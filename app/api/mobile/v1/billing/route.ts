import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { BillingService } from '@/lib/services/BillingService'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const entitlements = await EntitlementService.getEntitlements(user.id)
    let subscription = null
    try {
      const sub = await BillingService.getSubscription(user.id)
      if (sub) {
        subscription = {
          id: sub.id,
          status: sub.status,
          planId: sub.plan,
          currentPeriodStart: sub.currentPeriodStart ? sub.currentPeriodStart.toISOString() : null,
          currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        }
      }
    } catch (err) {
      console.warn('[MobileBilling] Subscription fetch fallback:', err)
    }

    return apiSuccess({
      isPro: entitlements.isPro,
      tier: entitlements.tier,
      plan: entitlements.plan,
      features: entitlements.features,
      limits: entitlements.limits,
      subscription,
    })
  } catch (error) {
    console.error('[MobileBilling] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve billing entitlements', 500)
  }
}
