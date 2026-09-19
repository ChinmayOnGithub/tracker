"use server"

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth-guards'
import { BillingService } from '@/lib/services/BillingService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { PlanId, SafeCheckoutPayload, UserEntitlements } from '@/lib/billing/types'
import { getIntroductoryOfferId } from '@/lib/billing/plans'
import { logger } from '@/lib/logger'

export interface BillingSummary {
  plan: PlanId
  isEligibleForIntro: boolean
  entitlements: UserEntitlements
  subscription: {
    id: string
    providerSubscriptionId: string
    plan: string
    status: string
    billingInterval: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    canceledAt: string | null
    isIntroductory: boolean
  } | null
  history: Array<{
    id: string
    amount: number
    currency: string
    status: string
    method: string | null
    paidAt: string | null
    providerPaymentId: string
    providerSubscriptionId?: string | null
    plan?: string
  }>
}

/**
 * Retrieves the comprehensive billing summary for the current user.
 */
export async function getBillingSummaryAction(): Promise<{
  success: boolean
  data?: BillingSummary
  error?: string
}> {
  try {
    const user = await requireAuth()

    // Safe server-side auto-reconciliation for transitional state
    try {
      const currentSub = await BillingService.getSubscription(user.id)
      if (currentSub && (currentSub.status === 'PENDING' || currentSub.status === 'CREATED')) {
        await BillingService.reconcileSubscriptionState(user.id, currentSub.providerSubscriptionId)
      }
    } catch (reconcileErr) {
      logger.warn('BillingAction', 'Safe auto-reconciliation during getBillingSummary encountered error', {
        error: reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)
      })
    }

    const [entitlements, sub, eligibleForIntro, history] = await Promise.all([
      EntitlementService.getEntitlements(user.id),
      BillingService.getSubscription(user.id),
      BillingService.isEligibleForIntroductoryOffer(user.id),
      BillingService.getBillingHistory(user.id, 20)
    ])

    const hasConfiguredOffer = !!getIntroductoryOfferId()

    return {
      success: true,
      data: {
        plan: entitlements.plan,
        isEligibleForIntro: eligibleForIntro && hasConfiguredOffer,
        entitlements,
        subscription: sub
          ? {
              id: sub.id,
              providerSubscriptionId: sub.providerSubscriptionId,
              plan: sub.plan,
              status: sub.status,
              billingInterval: sub.billingInterval,
              currentPeriodStart: sub.currentPeriodStart ? sub.currentPeriodStart.toISOString() : null,
              currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              canceledAt: sub.canceledAt ? sub.canceledAt.toISOString() : null,
              isIntroductory: sub.isIntroductory
            }
          : null,
        history: history.map(item => ({
          id: item.id,
          amount: item.amount,
          currency: item.currency,
          status: item.status,
          method: item.method,
          paidAt: item.paidAt ? item.paidAt.toISOString() : null,
          providerPaymentId: item.providerPaymentId,
          providerSubscriptionId: item.subscription?.providerSubscriptionId || null,
          plan: item.subscription?.plan
        }))
      }
    }
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err)
    logger.error('BillingAction', 'Failed to get billing summary', { error: rawError })
    const isSafeDomainMsg = err instanceof Error && (err.name === 'BillingError' || err.name === 'InvalidPlanError' || err.name === 'SubscriptionNotFoundError')
    return {
      success: false,
      error: isSafeDomainMsg ? err.message : 'Unable to load your subscription details right now. Please try again.'
    }
  }
}

/**
 * Initiates subscription checkout for the authenticated user.
 */
export async function startSubscriptionAction(plan: PlanId): Promise<{
  success: boolean
  checkout?: SafeCheckoutPayload
  error?: string
  code?: string
}> {
  try {
    const user = await requireAuth()
    const result = await BillingService.startSubscription(user.id, plan, {
      userEmail: user.email,
      userName: user.username
    })

    return { success: true, checkout: result.checkout }
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err)
    logger.error('BillingAction', 'Failed to start subscription', { plan, error: rawError })
    const billingErr = err instanceof Error && err.name === 'BillingError'
      ? (err as Error & { code?: string })
      : null
    const isSafeDomainMsg = err instanceof Error && (
      err.name === 'BillingError' ||
      err.name === 'InvalidPlanError'
    )
    return {
      success: false,
      error: isSafeDomainMsg ? err.message : 'Unable to initiate checkout right now. Please try again later.',
      code: billingErr?.code
    }
  }
}


/**
 * Confirms checkout completion following client-side checkout modal.
 */
export async function confirmCheckoutAction(params: {
  subscriptionId: string
  paymentId?: string
  signature?: string
}): Promise<{
  success: boolean
  status?: string
  paymentStatus?: string
  isPro?: boolean
  entitlements?: UserEntitlements
  error?: string
}> {
  try {
    const user = await requireAuth()
    const result = await BillingService.confirmCheckout(user.id, params)

    // Retrieve fresh authoritative entitlements immediately
    const entitlements = await EntitlementService.getEntitlements(user.id)

    // Revalidate server paths
    try {
      revalidatePath('/pricing')
      revalidatePath('/settings')
      revalidatePath('/')
    } catch {
      // Non-blocking in test / non-route contexts
    }

    return {
      success: result.success,
      status: result.status,
      paymentStatus: result.paymentStatus,
      isPro: result.isPro,
      entitlements
    }
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err)
    logger.error('BillingAction', 'Failed to confirm checkout', { params, error: rawError })
    const isSafeDomainMsg = err instanceof Error && (err.name === 'BillingError' || err.name === 'SubscriptionNotFoundError')
    return {
      success: false,
      error: isSafeDomainMsg ? err.message : 'Unable to confirm subscription status. If paid, your status will update shortly via webhook.'
    }
  }
}

/**
 * Explicitly triggers server-side reconciliation for the authenticated user's subscription.
 */
export async function reconcileBillingAction(subscriptionId?: string): Promise<{
  success: boolean
  isPro?: boolean
  status?: string
  entitlements?: UserEntitlements
  error?: string
}> {
  try {
    const user = await requireAuth()
    let targetSubId = subscriptionId
    if (!targetSubId) {
      const sub = await BillingService.getSubscription(user.id)
      if (!sub) {
        return { success: false, error: 'No subscription found to reconcile.' }
      }
      targetSubId = sub.providerSubscriptionId
    }

    const result = await BillingService.reconcileSubscriptionState(user.id, targetSubId)
    const entitlements = await EntitlementService.getEntitlements(user.id)

    try {
      revalidatePath('/settings')
      revalidatePath('/pricing')
      revalidatePath('/')
    } catch {}

    return {
      success: true,
      isPro: result.isPro,
      status: result.status,
      entitlements
    }
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err)
    logger.error('BillingAction', 'Failed to reconcile billing', { subscriptionId, error: rawError })
    const isSafeDomainMsg = err instanceof Error && (err.name === 'BillingError' || err.name === 'SubscriptionNotFoundError')
    return {
      success: false,
      error: isSafeDomainMsg ? err.message : 'Unable to reconcile subscription status right now.'
    }
  }
}

/**
 * Cancels active subscription at period end for authenticated user.
 */
export async function cancelSubscriptionAction(): Promise<{
  success: boolean
  effectiveDate?: string
  entitlements?: UserEntitlements
  error?: string
}> {
  try {
    const user = await requireAuth()
    const result = await BillingService.cancelSubscription(user.id)

    // Retrieve fresh authoritative entitlements immediately
    const entitlements = await EntitlementService.getEntitlements(user.id)

    // Revalidate server paths
    try {
      revalidatePath('/settings')
      revalidatePath('/pricing')
      revalidatePath('/')
    } catch {
      // Non-blocking in test / non-route contexts
    }

    return {
      success: true,
      effectiveDate: result.effectiveDate.toISOString(),
      entitlements
    }
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err)
    logger.error('BillingAction', 'Failed to cancel subscription', { error: rawError })
    const isSafeDomainMsg = err instanceof Error && (err.name === 'BillingError' || err.name === 'SubscriptionNotFoundError')
    return {
      success: false,
      error: isSafeDomainMsg ? err.message : 'Unable to schedule cancellation right now. Please try again later.'
    }
  }
}

/**
 * Changes subscription plan (e.g. PRO_MONTHLY <-> PRO_ANNUAL) for active subscriber.
 */
export async function changeSubscriptionPlanAction(targetPlan: PlanId): Promise<{
  success: boolean
  plan?: PlanId
  entitlements?: UserEntitlements
  error?: string
}> {
  try {
    const user = await requireAuth()
    const result = await BillingService.changeSubscriptionPlan(user.id, targetPlan)

    // Retrieve fresh authoritative entitlements immediately
    const entitlements = await EntitlementService.getEntitlements(user.id)

    // Revalidate server paths
    try {
      revalidatePath('/settings')
      revalidatePath('/pricing')
      revalidatePath('/')
    } catch {
      // Non-blocking in test / non-route contexts
    }

    return {
      success: true,
      plan: result.subscription.plan as PlanId,
      entitlements
    }
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err)
    logger.error('BillingAction', 'Failed to change subscription plan', { error: rawError, targetPlan })
    const isSafeDomainMsg = err instanceof Error && (err.name === 'BillingError' || err.name === 'SubscriptionNotFoundError' || err.message.includes('already subscribed') || err.message.includes('active paid subscription'))
    return {
      success: false,
      error: isSafeDomainMsg ? err.message : 'Unable to change subscription plan right now. Please try again later.'
    }
  }
}

/**
 * Retrieves entitlements for current user.
 */
export async function getEntitlementsAction(): Promise<{
  success: boolean
  entitlements?: UserEntitlements
  error?: string
}> {
  try {
    const user = await requireAuth()
    const entitlements = await EntitlementService.getEntitlements(user.id)
    return { success: true, entitlements }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { success: false, error: errorMsg }
  }
}

