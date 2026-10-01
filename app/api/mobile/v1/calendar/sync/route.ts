import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { CalendarService } from '@/modules/calendar/services/CalendarService'

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const syncResult = await CalendarService.sync(user.id)

    return apiSuccess({
      synced: true,
      result: syncResult ?? null,
    })
  } catch (error) {
    console.error('[MobileCalendarSync] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to synchronize with calendar provider', 500)
  }
}
