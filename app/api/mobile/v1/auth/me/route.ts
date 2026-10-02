import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { EntitlementService } from '@/lib/services/EntitlementService'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let isPro = false
    let tier = 'FREE'
    let plan = 'FREE'
    try {
      const entitlements = await EntitlementService.getEntitlements(user.id)
      isPro = entitlements.isPro
      tier = entitlements.tier
      plan = entitlements.plan
    } catch (err) {
      console.warn('[MobileAuthMe] Entitlements fallback to FREE:', err)
    }

    return apiSuccess({
      id: user.id,
      username: user.username,
      email: user.email,
      isOwner: user.isOwner,
      isPro,
      tier,
      plan,
    })
  } catch (error) {
    console.error('[MobileAuthMe] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve profile', 500)
  }
}
