import { db } from '../db'
import { getBillingProvider, IBillingProvider } from '../billing/providers'
import {
  PlanId,
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
   * Retrieves the latest active or historic subscription for a user.
   */
  static async getSubscription(userId: string) {
    return await db.subscription.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    })
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
          select: { plan: true, billingInterval: true }
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
   */
  static async getEntitlements(userId: string): Promise<UserEntitlements> {
    const sub = await db.subscription.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    })

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

    // Check if user already has an active subscription for this plan
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

    // Retrieve or create provider customer
    let customer = await db.billingCustomer.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: provider.name
        }
      }
    })

    if (!customer) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, username: true }
      })

      const providerCustomer = await provider.createCustomer({
        userId,
        email: options?.userEmail || user?.email,
        name: options?.userName || user?.username
      })

      customer = await db.billingCustomer.create({
        data: {
          userId,
          provider: provider.name,
          providerCustomerId: providerCustomer.providerCustomerId,
          currency: planConfig.currency
        }
      })
    }

    // Determine introductory pricing eligibility with atomic concurrency reservation
    let isIntroductory = false
    let offerId: string | undefined

    if (requestedPlan === 'PRO_MONTHLY') {
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
          offerId = getIntroductoryOfferId()
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
   * Confirms checkout completion following client-side modal success.
   * Authoritative access is synced from the provider.
   */
  static async confirmCheckout(
    userId: string,
    params: {
      subscriptionId: string
      paymentId?: string
      signature?: string
    },
    providerOverride?: IBillingProvider
  ): Promise<{ success: boolean; error?: string }> {
    const provider = providerOverride || getBillingProvider()
    const { subscriptionId, paymentId, signature } = params

    const sub = await db.subscription.findFirst({
      where: {
        userId,
        providerSubscriptionId: subscriptionId,
        deletedAt: null
      }
    })

    if (!sub) {
      throw new SubscriptionNotFoundError(`No subscription matching ${subscriptionId} for user`)
    }

    // Verify signature if provided and supported by provider
    if (signature && paymentId && provider.verifySubscriptionPaymentSignature) {
      const isValidSig = provider.verifySubscriptionPaymentSignature(subscriptionId, paymentId, signature)
      if (!isValidSig) {
        throw new BillingError('Invalid checkout verification signature.', 'INVALID_SIGNATURE')
      }
    }

    // Retrieve provider authoritative status
    const providerSub = await provider.retrieveSubscription(subscriptionId)

    const nextStatus = providerSub.status.toUpperCase()
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: nextStatus,
        currentPeriodStart: providerSub.currentStart || new Date(),
        currentPeriodEnd: providerSub.currentEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      }
    })

    // If payment ID is available, record payment
    if (paymentId) {
      const providerPayment = await provider.retrievePayment(paymentId)
      await db.payment.upsert({
        where: { providerPaymentId: paymentId },
        create: {
          userId,
          subscriptionId: sub.id,
          billingCustomerId: sub.billingCustomerId,
          provider: provider.name,
          providerPaymentId: paymentId,
          amount: providerPayment.amount,
          currency: providerPayment.currency,
          status: providerPayment.status === 'captured' ? 'SUCCESS' : 'PENDING',
          method: providerPayment.method,
          paidAt: providerPayment.paidAt || new Date()
        },
        update: {
          status: providerPayment.status === 'captured' ? 'SUCCESS' : 'PENDING',
          amount: providerPayment.amount,
          paidAt: providerPayment.paidAt || new Date()
        }
      })
    }

    // If this was an introductory subscription and now active/authenticated, lock introductory offer
    if (sub.isIntroductory && sub.billingCustomerId) {
      await db.billingCustomer.update({
        where: { id: sub.billingCustomerId },
        data: {
          hasUsedIntroductoryOffer: true,
          introductoryOfferClaimedAt: new Date()
        }
      })
    }

    await AuditService.log({
      userId,
      entityType: 'Subscription',
      entityId: sub.id,
      action: 'SUBSCRIPTION_CONFIRMED',
      performedBy: userId,
      newData: {
        status: nextStatus,
        paymentId
      }
    })

    return { success: true }
  }

  /**
   * Cancels a user's subscription, scheduling cancellation at period end.
   */
  static async cancelSubscription(
    userId: string,
    providerOverride?: IBillingProvider
  ): Promise<{ success: boolean; effectiveDate: Date }> {
    const provider = providerOverride || getBillingProvider()

    const sub = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'AUTHENTICATED', 'CREATED'] },
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!sub) {
      throw new SubscriptionNotFoundError('No active subscription found to cancel.')
    }

    // Call provider cancel API
    await provider.cancelSubscription({
      providerSubscriptionId: sub.providerSubscriptionId,
      cancelAtPeriodEnd: true
    })

    const effectiveDate = sub.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

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
      // 4. Handle Subscription Lifecycle Events
      if (norm.providerSubscriptionId) {
        const sub = await db.subscription.findUnique({
          where: { providerSubscriptionId: norm.providerSubscriptionId },
          include: { billingCustomer: true }
        })

        if (sub) {
          const isActivated = norm.eventType === 'subscription.activated'
          const isCharged = norm.eventType === 'subscription.charged'
          const isCancelled = norm.eventType === 'subscription.cancelled'
          const isHalted = norm.eventType === 'subscription.halted'
          const isPending = norm.eventType === 'subscription.pending'

          let newStatus = sub.status
          if (isActivated || isCharged) {
            newStatus = 'ACTIVE'
          } else if (isCancelled) {
            newStatus = 'CANCELLED'
          } else if (isHalted) {
            newStatus = 'HALTED'
          } else if (isPending) {
            newStatus = 'PENDING'
          }

          const isCancelledGrace = isCancelled && (norm.currentPeriodEnd || sub.currentPeriodEnd) && (norm.currentPeriodEnd || sub.currentPeriodEnd)! > new Date()

          // Update subscription state
          await db.subscription.update({
            where: { id: sub.id },
            data: {
              status: newStatus,
              cancelAtPeriodEnd: isCancelledGrace ? true : sub.cancelAtPeriodEnd,
              currentPeriodStart: norm.currentPeriodStart || sub.currentPeriodStart,
              currentPeriodEnd: norm.currentPeriodEnd || sub.currentPeriodEnd,
              updatedAt: new Date()
            }
          })

          // Mark introductory offer consumed if this is an introductory subscription activation
          if ((isActivated || isCharged) && sub.isIntroductory && sub.billingCustomerId) {
            await db.billingCustomer.update({
              where: { id: sub.billingCustomerId },
              data: {
                hasUsedIntroductoryOffer: true,
                introductoryOfferClaimedAt: new Date()
              }
            })
          }

          // Record Payment on charge
          if (norm.providerPaymentId && (isCharged || norm.amount !== undefined)) {
            let chargeAmount = norm.amount
            if (chargeAmount === undefined && norm.providerPaymentId) {
              try {
                const fetchedPayment = await provider.retrievePayment(norm.providerPaymentId)
                chargeAmount = fetchedPayment.amount
              } catch (fetchErr) {
                console.warn('Could not fetch payment details from provider:', fetchErr)
              }
            }

            if (chargeAmount === undefined) {
              throw new BillingError(
                `Cannot record payment ${norm.providerPaymentId} without verified provider amount. Local assumptions are prohibited.`,
                'UNVERIFIED_PAYMENT_AMOUNT'
              )
            }

            await db.payment.upsert({
              where: { providerPaymentId: norm.providerPaymentId },
              create: {
                userId: sub.userId,
                subscriptionId: sub.id,
                billingCustomerId: sub.billingCustomerId,
                provider: provider.name,
                providerPaymentId: norm.providerPaymentId,
                amount: chargeAmount,
                currency: norm.currency || 'INR',
                status: 'SUCCESS',
                method: norm.method,
                paidAt: norm.occurredAt || new Date()
              },
              update: {
                status: 'SUCCESS',
                amount: chargeAmount,
                paidAt: norm.occurredAt || new Date()
              }
            })

            await AuditService.log({
              userId: sub.userId,
              entityType: 'Payment',
              entityId: norm.providerPaymentId,
              action: 'PAYMENT_SUCCESS',
              performedBy: 'WEBHOOK',
              newData: {
                amount: chargeAmount,
                subscriptionId: sub.id
              }
            })
          }

          // Log subscription state audit event
          await AuditService.log({
            userId: sub.userId,
            entityType: 'Subscription',
            entityId: sub.id,
            action: `SUBSCRIPTION_${newStatus}`,
            performedBy: 'WEBHOOK',
            newData: {
              eventType: norm.eventType,
              status: newStatus
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
