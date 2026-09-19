import { Subscription, Payment } from '@prisma/client'
import { db } from '../db'
import { getBillingProvider, IBillingProvider } from '../billing/providers'
import {
  NormalizedWebhookEvent,
  PlanId,
  ProviderPayment,
  ProviderSubscription,
  SafeCheckoutPayload,
  UserEntitlements
} from '../billing/types'
import { calculateEntitlements } from '../billing/entitlements'
import { getIntroductoryOfferId, getPlan } from '../billing/plans'
import {
  BillingError,
  InvalidPlanError,
  SubscriptionNotFoundError
} from '../billing/errors'
import { selectCanonicalSubscription } from '../billing/subscriptionSelector'
import { AuditService } from './AuditService'

export class BillingService {
  /**
   * Retrieves the current effective plan for a user.
   */
  static async getCurrentPlan(userId: string): Promise<PlanId> {
    const entitlements = await this.getEntitlements(userId)
    return entitlements.plan
  }

  /**
   * Retrieves the canonical effective subscription for a user.
   * Single public entry point for subscription queries.
   */
  static async getSubscription(userId: string) {
    const allSubs = await db.subscription.findMany({
      where: { userId, deletedAt: null },
      orderBy: [
        { currentPeriodEnd: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return selectCanonicalSubscription(allSubs, new Date())
  }

  /**
   * Alias for backward compatibility with existing callers.
   */
  static async getCanonicalSubscription(userId: string) {
    return await this.getSubscription(userId)
  }

  /**
   * Retrieves the billing customer for a user if one has been created.
   */
  static async getBillingCustomer(userId: string, providerName = 'RAZORPAY') {
    return await db.billingCustomer.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: providerName
        }
      }
    })
  }

  /**
   * Retrieves payment transaction history for a user.
   */
  static async getBillingHistory(userId: string, limit = 50) {
    return await db.payment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        subscription: {
          select: { plan: true, billingInterval: true, providerSubscriptionId: true }
        }
      }
    })
  }

  /**
   * Checks whether an account is eligible for the introductory promotion (₹29 first month).
   *
   * Invariants:
   * - Strictly once per account.
   * - Cancellations, plan changes, or retries will NOT grant the offer again.
   * - Server-authoritative check.
   */
  static async isEligibleForIntroductoryOffer(userId: string): Promise<boolean> {
    // 1. Check if BillingCustomer record explicitly marked offer consumed
    const customer = await db.billingCustomer.findFirst({
      where: { userId, deletedAt: null }
    })
    if (customer?.hasUsedIntroductoryOffer) {
      return false
    }

    // 2. Check if user has ever had an introductory subscription
    const introSub = await db.subscription.findFirst({
      where: { userId, isIntroductory: true, deletedAt: null }
    })
    if (introSub) {
      return false
    }

    // 3. Check if user has ever paid ₹29
    const introPayment = await db.payment.findFirst({
      where: { userId, amount: 29, status: 'SUCCESS', deletedAt: null }
    })
    if (introPayment) {
      return false
    }

    return true
  }

  /**
   * Computes server-authoritative entitlements for a user.
   * Uses canonical subscription resolution to prevent pending checkouts from
   * overriding an active subscription's entitlements.
   */
  static async getEntitlements(userId: string): Promise<UserEntitlements> {
    const sub = await this.getCanonicalSubscription(userId)

    if (!sub) {
      return calculateEntitlements(null)
    }

    return calculateEntitlements({
      id: sub.id,
      plan: sub.plan,
      status: sub.status,
      billingInterval: sub.billingInterval,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      canceledAt: sub.canceledAt,
      isIntroductory: sub.isIntroductory
    })
  }

  /**
   * Initiates a subscription checkout for the authenticated user.
   */
  static async startSubscription(
    userId: string,
    requestedPlan: PlanId,
    options?: { provider?: IBillingProvider; userEmail?: string | null; userName?: string | null }
  ): Promise<{ checkout: SafeCheckoutPayload }> {
    if (requestedPlan !== 'PRO_MONTHLY' && requestedPlan !== 'PRO_ANNUAL') {
      throw new InvalidPlanError(requestedPlan)
    }

    const provider = options?.provider || getBillingProvider()
    const planConfig = getPlan(requestedPlan)

    // Check if user already has an active subscription for this exact plan
    const activeSub = await db.subscription.findFirst({
      where: {
        userId,
        plan: requestedPlan,
        status: { in: ['ACTIVE', 'AUTHENTICATED'] },
        deletedAt: null
      }
    })
    if (activeSub && (!activeSub.currentPeriodEnd || activeSub.currentPeriodEnd > new Date())) {
      throw new BillingError('You already have an active subscription for this plan.', 'ALREADY_SUBSCRIBED')
    }

    // Concurrency guard: check for a recent in-flight CREATED checkout session (within 15 minutes)
    // Reuses existing checkout session instead of creating duplicate subscriptions on provider
    const inFlightSub = await db.subscription.findFirst({
      where: {
        userId,
        plan: requestedPlan,
        status: 'CREATED',
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }
      },
      orderBy: { createdAt: 'desc' }
    })
    if (inFlightSub) {
      const effectiveAmount = inFlightSub.isIntroductory && planConfig.introductoryPrice !== undefined
        ? planConfig.introductoryPrice
        : planConfig.price

      return {
        checkout: {
          subscriptionId: inFlightSub.providerSubscriptionId,
          keyId: (provider as { keyId?: string }).keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
          name: 'Tracker',
          description: `${planConfig.name} Subscription`,
          amount: effectiveAmount,
          currency: planConfig.currency,
          planId: requestedPlan,
          isIntroductory: inFlightSub.isIntroductory,
          customerEmail: options?.userEmail,
          customerName: options?.userName
        }
      }
    }

    // Check if user has an active subscription for a DIFFERENT plan (#45: plan switching)
    // We must not silently create overlapping subscriptions — the user must cancel first,
    // or the system must explicitly handle an upgrade/downgrade transition.
    const canonicalSub = await this.getCanonicalSubscription(userId)
    const canonicalStatus = canonicalSub?.status?.toUpperCase()
    const canonicalIsActive =
      canonicalSub &&
      canonicalSub.plan !== requestedPlan &&
      (canonicalStatus === 'ACTIVE' || canonicalStatus === 'AUTHENTICATED') &&
      (!canonicalSub.currentPeriodEnd || canonicalSub.currentPeriodEnd > new Date())

    if (canonicalIsActive) {
      throw new BillingError(
        `You already have an active ${canonicalSub!.plan} subscription. Please cancel your current plan before switching to a different plan.`,
        'PLAN_SWITCH_NOT_ALLOWED'
      )
    }

    // Retrieve, verify or create provider customer
    let customer = await db.billingCustomer.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: provider.name
        }
      }
    })

    let needsNewCustomer = false

    if (!customer) {
      needsNewCustomer = true
    } else if (customer.providerCustomerId.startsWith('cust_mock_')) {
      needsNewCustomer = true
    } else if (provider.retrieveCustomer) {
      const verified = await provider.retrieveCustomer(customer.providerCustomerId)
      if (!verified) {
        needsNewCustomer = true
      }
    }

    if (needsNewCustomer) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, username: true }
      })

      const providerCustomer = await provider.createCustomer({
        userId,
        email: options?.userEmail || user?.email,
        name: options?.userName || user?.username
      })

      customer = await db.billingCustomer.upsert({
        where: {
          userId_provider: {
            userId,
            provider: provider.name
          }
        },
        create: {
          userId,
          provider: provider.name,
          providerCustomerId: providerCustomer.providerCustomerId,
          currency: planConfig.currency
        },
        update: {
          providerCustomerId: providerCustomer.providerCustomerId,
          currency: planConfig.currency,
          updatedAt: new Date()
        }
      })
    }

    if (!customer) {
      throw new BillingError('Failed to resolve or create customer record for billing.', 'CUSTOMER_RESOLUTION_FAILED')
    }

    // Determine introductory pricing eligibility with atomic concurrency reservation
    let isIntroductory = false
    let offerId: string | undefined

    if (requestedPlan === 'PRO_MONTHLY') {
      const configuredOfferId = getIntroductoryOfferId()
      if (configuredOfferId) {
        const eligible = await this.isEligibleForIntroductoryOffer(userId)
        if (eligible) {
          // Atomic conditional update on BillingCustomer to reserve the offer and prevent race conditions
          const reserveResult = await db.billingCustomer.updateMany({
            where: {
              id: customer.id,
              hasUsedIntroductoryOffer: false
            },
            data: {
              hasUsedIntroductoryOffer: true,
              introductoryOfferClaimedAt: new Date()
            }
          })

          if (reserveResult.count === 1) {
            isIntroductory = true
            offerId = configuredOfferId
          }
        }
      }
    }

    try {
      // Create subscription on provider
      const checkoutResult = await provider.createSubscription({
        planId: requestedPlan,
        customerId: customer.providerCustomerId,
        offerId,
        isIntroductory,
        notes: {
          userId,
          planId: requestedPlan,
          isIntroductory: isIntroductory ? 'true' : 'false'
        }
      })

      // Upsert local subscription state
      await db.subscription.upsert({
        where: {
          providerSubscriptionId: checkoutResult.providerSubscriptionId
        },
        create: {
          userId,
          billingCustomerId: customer.id,
          provider: provider.name,
          providerSubscriptionId: checkoutResult.providerSubscriptionId,
          plan: requestedPlan,
          status: 'CREATED',
          billingInterval: requestedPlan === 'PRO_ANNUAL' ? 'annual' : 'monthly',
          isIntroductory,
          cancelAtPeriodEnd: false
        },
        update: {
          status: 'CREATED',
          plan: requestedPlan,
          billingInterval: requestedPlan === 'PRO_ANNUAL' ? 'annual' : 'monthly',
          isIntroductory,
          updatedAt: new Date()
        }
      })

      // Log audit event
      await AuditService.log({
        userId,
        entityType: 'Subscription',
        entityId: checkoutResult.providerSubscriptionId,
        action: 'SUBSCRIPTION_STARTED',
        performedBy: userId,
        newData: {
          plan: requestedPlan,
          isIntroductory,
          amount: checkoutResult.amount
        }
      })

      return {
        checkout: {
          subscriptionId: checkoutResult.providerSubscriptionId,
          keyId: checkoutResult.keyId,
          name: 'Tracker',
          description: `${planConfig.name} Subscription`,
          amount: checkoutResult.amount,
          currency: checkoutResult.currency,
          planId: requestedPlan,
          isIntroductory,
          customerEmail: options?.userEmail,
          customerName: options?.userName
        }
      }
    } catch (err) {
      // If checkout creation failed on provider, rollback the reservation so user isn't penalized
      if (isIntroductory && customer?.id) {
        await db.billingCustomer.updateMany({
          where: {
            id: customer.id,
            subscriptions: { none: { isIntroductory: true } }
          },
          data: {
            hasUsedIntroductoryOffer: false,
            introductoryOfferClaimedAt: null
          }
        }).catch(() => {})
      }
      throw err
    }
  }

  /**
   * Authoritative canonical billing reconciliation operation.
   * Single source of truth for synchronizing subscription and payment state from provider.
   */
  static async reconcileSubscriptionState(
    userId: string,
    providerSubscriptionId: string,
    optionalProviderPaymentId?: string,
    providerOverride?: IBillingProvider,
    options?: {
      webhookEvent?: NormalizedWebhookEvent
    }
  ): Promise<{
    subscription: Subscription
    payment?: Payment | null
    status: string
    isPro: boolean
  }> {
    const provider = providerOverride || getBillingProvider()

    // STEP 1 — Validate ownership
    let sub = await db.subscription.findFirst({
      where: {
        userId,
        providerSubscriptionId,
        deletedAt: null
      },
      include: { billingCustomer: true }
    })

    // Fallback to findUnique for mock compatibility in unit tests
    if (!sub && db.subscription.findUnique) {
      const found = await db.subscription.findUnique({
        where: { providerSubscriptionId },
        include: { billingCustomer: true }
      })
      if (found && found.userId === userId && !found.deletedAt) {
        sub = found
      }
    }

    if (!sub) {
      throw new SubscriptionNotFoundError(`No subscription matching ${providerSubscriptionId} for user`)
    }

    // STEP 3 — Fetch authoritative subscription state
    let providerSub: ProviderSubscription | null = null
    try {
      providerSub = await provider.retrieveSubscription(providerSubscriptionId)
    } catch (subErr) {
      if (options?.webhookEvent?.status) {
        providerSub = {
          id: providerSubscriptionId,
          status: options.webhookEvent.status,
          currentStart: options.webhookEvent.currentPeriodStart || null,
          currentEnd: options.webhookEvent.currentPeriodEnd || null,
          planId: ''
        }
      } else {
        throw subErr
      }
    }

    let rawStatus = (providerSub.status || '').toUpperCase()
    if (options?.webhookEvent) {
      if (options.webhookEvent.eventType === 'subscription.activated' || options.webhookEvent.eventType === 'subscription.charged') {
        rawStatus = 'ACTIVE'
      } else if (options.webhookEvent.eventType === 'subscription.cancelled') {
        rawStatus = 'CANCELLED'
      } else if (options.webhookEvent.eventType === 'subscription.halted') {
        rawStatus = 'HALTED'
      } else if (options.webhookEvent.eventType === 'subscription.pending') {
        rawStatus = 'PENDING'
      }
    }
    let mappedStatus = rawStatus || sub.status

    // Monotonic guard: ACTIVE / AUTHENTICATED subscriptions must never regress to PENDING / CREATED due to delayed/replayed events
    if ((sub.status === 'ACTIVE' || sub.status === 'AUTHENTICATED') && (mappedStatus === 'PENDING' || mappedStatus === 'CREATED')) {
      mappedStatus = sub.status
    }

    const isCancelled = mappedStatus === 'CANCELLED'
    const currentEnd = providerSub.currentEnd || sub.currentPeriodEnd || null
    const isCancelledGrace = isCancelled && currentEnd && currentEnd > new Date()
    const cancelAtPeriodEnd = isCancelled ? Boolean(isCancelledGrace) : (providerSub.cancelAtPeriodEnd ?? sub.cancelAtPeriodEnd)

    // STEP 4, 5 & 6 — Authoritative payment state, paidAt correction, and monotonic upsert
    const paymentIdsToReconcile = new Set<string>()
    if (optionalProviderPaymentId) {
      paymentIdsToReconcile.add(optionalProviderPaymentId)
    }

    // Sweep any local PENDING payments for this subscription to guarantee convergence
    const pendingLocalPayments = await db.payment.findMany({
      where: {
        subscriptionId: sub.id,
        status: 'PENDING',
        deletedAt: null
      },
      select: { providerPaymentId: true }
    })
    for (const p of pendingLocalPayments) {
      if (p.providerPaymentId) {
        paymentIdsToReconcile.add(p.providerPaymentId)
      }
    }

    let primaryPayment: Payment | null = null

    for (const paymentId of paymentIdsToReconcile) {
      try {
        let providerPayment: ProviderPayment | null = null
        try {
          providerPayment = await provider.retrievePayment(paymentId)
        } catch (payErr) {
          if (options?.webhookEvent && options.webhookEvent.providerPaymentId === paymentId) {
            const isCharged = options.webhookEvent.eventType === 'subscription.charged'
            const amt = options.webhookEvent.amount
            if (amt === undefined && isCharged) {
              throw new BillingError(
                `Cannot record payment ${paymentId} without verified provider amount. Local assumptions are prohibited.`,
                'UNVERIFIED_PAYMENT_AMOUNT'
              )
            }
            providerPayment = {
              id: paymentId,
              amount: amt ?? 0,
              currency: options.webhookEvent.currency || 'INR',
              status: isCharged ? 'captured' : 'authorized',
              method: options.webhookEvent.method,
              paidAt: isCharged ? (options.webhookEvent.occurredAt || null) : null
            }
          } else {
            console.warn(`Could not retrieve payment ${paymentId} from provider:`, payErr)
            continue
          }
        }

        let targetStatus: string
        let paidAt: Date | null = null

        if (providerPayment.status === 'captured') {
          targetStatus = 'SUCCESS'
          paidAt = providerPayment.paidAt || null
        } else if (providerPayment.status === 'failed') {
          targetStatus = 'FAILED'
          paidAt = null
        } else {
          targetStatus = 'PENDING'
          paidAt = null
        }

        const existingPayment = await db.payment.findUnique({
          where: { providerPaymentId: paymentId }
        })

        // Monotonic guard: SUCCESS must never be downgraded to PENDING or FAILED by stale/replayed events
        if (existingPayment?.status === 'SUCCESS' && targetStatus !== 'SUCCESS') {
          targetStatus = 'SUCCESS'
          paidAt = existingPayment.paidAt
        }

        const upsertedPayment = await db.payment.upsert({
          where: { providerPaymentId: paymentId },
          create: {
            userId: sub.userId,
            subscriptionId: sub.id,
            billingCustomerId: sub.billingCustomerId,
            provider: provider.name,
            providerPaymentId: paymentId,
            amount: providerPayment.amount,
            currency: providerPayment.currency || 'INR',
            status: targetStatus,
            method: providerPayment.method,
            paidAt: targetStatus === 'SUCCESS' ? paidAt : null
          },
          update: {
            status: targetStatus,
            amount: providerPayment.amount,
            paidAt: targetStatus === 'SUCCESS' ? (paidAt || existingPayment?.paidAt || null) : null,
            method: providerPayment.method || undefined
          }
        })

        if (!primaryPayment || paymentId === optionalProviderPaymentId) {
          primaryPayment = upsertedPayment
        }

        if (targetStatus === 'SUCCESS' && (!existingPayment || existingPayment.status !== 'SUCCESS')) {
          await AuditService.log({
            userId: sub.userId,
            entityType: 'Payment',
            entityId: paymentId,
            action: 'PAYMENT_SUCCESS',
            performedBy: options?.webhookEvent ? 'WEBHOOK' : sub.userId,
            newData: {
              amount: providerPayment.amount,
              subscriptionId: sub.id
            }
          })
        }
      } catch (err) {
        if (err instanceof BillingError) throw err
        console.warn(`Failed to reconcile payment ${paymentId}:`, err)
      }
    }

    // STEP 7 — Update subscription with authoritative provider data
    const updatedSub = await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: mappedStatus,
        currentPeriodStart: providerSub.currentStart || sub.currentPeriodStart || null,
        currentPeriodEnd: providerSub.currentEnd || sub.currentPeriodEnd || null,
        cancelAtPeriodEnd,
        canceledAt: isCancelled ? (sub.canceledAt || new Date()) : sub.canceledAt,
        updatedAt: new Date()
      }
    })

    // Consume introductory offer if applicable and subscription is active/authenticated
    if (sub.isIntroductory && sub.billingCustomerId && (mappedStatus === 'ACTIVE' || mappedStatus === 'AUTHENTICATED')) {
      await db.billingCustomer.update({
        where: { id: sub.billingCustomerId },
        data: {
          hasUsedIntroductoryOffer: true,
          introductoryOfferClaimedAt: new Date()
        }
      })
    }

    await AuditService.log({
      userId: sub.userId,
      entityType: 'Subscription',
      entityId: sub.id,
      action: options?.webhookEvent ? `SUBSCRIPTION_${mappedStatus}` : 'SUBSCRIPTION_CONFIRMED',
      performedBy: options?.webhookEvent ? 'WEBHOOK' : sub.userId,
      newData: {
        status: mappedStatus,
        paymentId: optionalProviderPaymentId,
        paymentStatus: primaryPayment?.status
      }
    })

    // STEP 8 — Entitlement derives from canonical subscription state
    const entitlements = await this.getEntitlements(sub.userId)
    const isPro = entitlements.plan === 'PRO_MONTHLY' || entitlements.plan === 'PRO_ANNUAL'

    return {
      subscription: updatedSub,
      payment: primaryPayment,
      status: mappedStatus,
      isPro
    }
  }

  /**
   * Confirms checkout completion following client-side modal success.
   * Authoritative access is converged through canonical reconciliation.
   */
  static async confirmCheckout(
    userId: string,
    params: {
      subscriptionId: string
      paymentId?: string
      signature?: string
    },
    providerOverride?: IBillingProvider
  ): Promise<{
    success: boolean
    error?: string
    status?: string
    isPro?: boolean
    paymentStatus?: string
  }> {
    const provider = providerOverride || getBillingProvider()
    const { subscriptionId, paymentId, signature } = params

    // Verify signature if provided and supported by provider
    if (signature && paymentId && provider.verifySubscriptionPaymentSignature) {
      const isValidSig = provider.verifySubscriptionPaymentSignature(subscriptionId, paymentId, signature)
      if (!isValidSig) {
        throw new BillingError('Invalid checkout verification signature.', 'INVALID_SIGNATURE')
      }
    }

    const result = await this.reconcileSubscriptionState(
      userId,
      subscriptionId,
      paymentId,
      provider
    )

    return {
      success: true,
      status: result.status,
      isPro: result.isPro,
      paymentStatus: result.payment?.status
    }
  }

  /**
   * Cancels a user's subscription, scheduling cancellation at period end.
   */
  static async cancelSubscription(
    userId: string,
    providerOverride?: IBillingProvider
  ): Promise<{ success: boolean; effectiveDate: Date }> {
    const provider = providerOverride || getBillingProvider()

    // Use canonical resolution to cancel the right subscription
    const sub = await this.getCanonicalSubscription(userId)

    if (!sub) {
      throw new SubscriptionNotFoundError('No active subscription found to cancel.')
    }

    const cancellableStatuses = ['ACTIVE', 'AUTHENTICATED', 'CREATED', 'PENDING']
    if (!cancellableStatuses.includes(sub.status.toUpperCase())) {
      throw new SubscriptionNotFoundError('No cancellable subscription found.')
    }

    // Call provider cancel API
    await provider.cancelSubscription({
      providerSubscriptionId: sub.providerSubscriptionId,
      cancelAtPeriodEnd: true
    })

    const effectiveDate = sub.currentPeriodEnd || new Date()

    await db.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: new Date()
      }
    })

    await AuditService.log({
      userId,
      entityType: 'Subscription',
      entityId: sub.id,
      action: 'SUBSCRIPTION_CANCEL_REQUESTED',
      performedBy: userId,
      newData: {
        effectiveDate: effectiveDate.toISOString()
      }
    })

    return { success: true, effectiveDate }
  }

  /**
   * Processes webhook events idempotently and safely.
   */
  static async processWebhook(
    providerName: string,
    rawBody: string,
    signature: string,
    providerOverride?: IBillingProvider
  ): Promise<{ status: number; message: string }> {
    const provider = providerOverride || getBillingProvider(providerName)

    // 1. Cryptographic signature check
    const isValid = provider.verifyWebhookSignature(rawBody, signature)
    if (!isValid) {
      return { status: 400, message: 'Invalid webhook signature' }
    }

    // 2. Parse & normalize event
    let rawJson: unknown
    try {
      rawJson = JSON.parse(rawBody)
    } catch {
      return { status: 400, message: 'Malformed JSON payload' }
    }

    const norm = provider.normalizeWebhookEvent(rawJson)

    // 3. Idempotency deduplication check
    const existingEvent = await db.billingWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: provider.name,
          providerEventId: norm.eventId
        }
      }
    })

    if (existingEvent && existingEvent.status === 'PROCESSED') {
      return { status: 200, message: 'Event already processed' }
    }

    // Record webhook event as PENDING
    const webhookRecord = await db.billingWebhookEvent.upsert({
      where: {
        provider_providerEventId: {
          provider: provider.name,
          providerEventId: norm.eventId
        }
      },
      create: {
        provider: provider.name,
        providerEventId: norm.eventId,
        eventType: norm.eventType,
        occurredAt: norm.occurredAt,
        status: 'PENDING',
        payload: rawJson as object
      },
      update: {
        status: 'PENDING',
        updatedAt: new Date()
      }
    })

    try {
      // 4. Handle Subscription Lifecycle & Payment Events via canonical reconciliation
      let targetSubscriptionId = norm.providerSubscriptionId
      if (!targetSubscriptionId && norm.providerPaymentId) {
        const existingPayment = await db.payment.findUnique({
          where: { providerPaymentId: norm.providerPaymentId }
        })
        if (existingPayment?.subscriptionId) {
          const linkedSub = await db.subscription.findUnique({
            where: { id: existingPayment.subscriptionId }
          })
          if (linkedSub?.providerSubscriptionId) {
            targetSubscriptionId = linkedSub.providerSubscriptionId
          }
        }
      }

      if (targetSubscriptionId) {
        const sub = (await db.subscription.findUnique?.({
          where: { providerSubscriptionId: targetSubscriptionId },
          include: { billingCustomer: true }
        })) || (await db.subscription.findFirst({
          where: { providerSubscriptionId: targetSubscriptionId, deletedAt: null },
          include: { billingCustomer: true }
        }))

        if (sub) {
          await this.reconcileSubscriptionState(
            sub.userId,
            targetSubscriptionId,
            norm.providerPaymentId,
            provider,
            { webhookEvent: norm }
          )
        }
      }

      // Standalone payment.captured handling: guarantee payment is recorded as SUCCESS
      if (norm.eventType === 'payment.captured' && norm.providerPaymentId) {
        const existingPayment = await db.payment.findUnique({
          where: { providerPaymentId: norm.providerPaymentId }
        })
        if (!existingPayment || existingPayment.status !== 'SUCCESS') {
          const upserted = await db.payment.upsert({
            where: { providerPaymentId: norm.providerPaymentId },
            create: {
              userId: existingPayment?.userId || 'system',
              subscriptionId: existingPayment?.subscriptionId,
              provider: provider.name,
              providerPaymentId: norm.providerPaymentId,
              amount: norm.amount || 0,
              currency: norm.currency || 'INR',
              status: 'SUCCESS',
              method: norm.method,
              paidAt: norm.occurredAt || new Date()
            },
            update: {
              status: 'SUCCESS',
              amount: norm.amount ?? undefined,
              paidAt: norm.occurredAt || new Date(),
              method: norm.method || undefined
            }
          })

          await AuditService.log({
            userId: upserted.userId,
            entityType: 'Payment',
            entityId: norm.providerPaymentId,
            action: 'PAYMENT_SUCCESS',
            performedBy: 'WEBHOOK',
            newData: {
              amount: norm.amount,
              status: 'SUCCESS'
            }
          })
        }
      }

      // Handle standalone payment failure
      if (norm.eventType === 'payment.failed' && norm.providerPaymentId) {
        let userId = 'system'
        if (norm.providerSubscriptionId) {
          const sub = await db.subscription.findUnique({
            where: { providerSubscriptionId: norm.providerSubscriptionId }
          })
          if (sub) userId = sub.userId
        }

        await db.payment.upsert({
          where: { providerPaymentId: norm.providerPaymentId },
          create: {
            userId,
            provider: provider.name,
            providerPaymentId: norm.providerPaymentId,
            amount: norm.amount || 0,
            currency: norm.currency || 'INR',
            status: 'FAILED',
            method: norm.method,
            paidAt: null
          },
          update: {
            status: 'FAILED'
          }
        })

        await AuditService.log({
          userId,
          entityType: 'Payment',
          entityId: norm.providerPaymentId,
          action: 'PAYMENT_FAILED',
          performedBy: 'WEBHOOK',
          newData: { eventType: norm.eventType }
        })
      }

      // 5. Mark webhook event as PROCESSED
      await db.billingWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date()
        }
      })

      return { status: 200, message: 'Processed successfully' }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      await db.billingWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          status: 'FAILED',
          error: errorMsg
        }
      })
      console.error('Webhook processing failure:', err)
      return { status: 500, message: `Internal processing error: ${errorMsg}` }
    }
  }
}
