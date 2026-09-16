import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    return apiSuccess({
      id: user.id,
      username: user.username,
      email: user.email,
      isOwner: user.isOwner,
    })
  } catch (error) {
    console.error('[MobileAuthMe] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve profile', 500)
  }
}
