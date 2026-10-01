import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { CalendarAggregationService } from '@/modules/calendar/services/CalendarAggregationService'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') // e.g. "2026-10-01"

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiError('VALIDATION_ERROR', 'Valid date in YYYY-MM-DD format is required', 400)
    }

    const dayData = await CalendarAggregationService.getDayView(user.id, date)

    return apiSuccess({ day: dayData })
  } catch (error) {
    console.error('[MobileCalendarDay] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve calendar day view', 500)
  }
}
