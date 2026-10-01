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
    const monthParam = searchParams.get('month') // e.g. "2026-10" or year & month
    const timezone = searchParams.get('timezone') || undefined

    let year: number
    let month: number

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number)
      year = y
      month = m
    } else {
      const now = new Date()
      year = now.getUTCFullYear()
      month = now.getUTCMonth() + 1
    }

    const summaries = await CalendarAggregationService.getMonthSummary(
      user.id,
      year,
      month,
      timezone
    )

    return apiSuccess({ summaries, year, month })
  } catch (error) {
    console.error('[MobileCalendarMonth] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve calendar month summary', 500)
  }
}
