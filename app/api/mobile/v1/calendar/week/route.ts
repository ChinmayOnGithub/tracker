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
    const startDate = searchParams.get('startDate') || searchParams.get('date') // e.g. "2026-10-01"
    const timezone = searchParams.get('timezone') || undefined

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return apiError('VALIDATION_ERROR', 'Valid startDate in YYYY-MM-DD format is required', 400)
    }

    const weekData = await CalendarAggregationService.getWeekView(
      user.id,
      startDate,
      timezone
    )

    return apiSuccess({ week: weekData })
  } catch (error) {
    console.error('[MobileCalendarWeek] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve calendar week view', 500)
  }
}
