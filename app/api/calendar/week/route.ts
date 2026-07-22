import { NextRequest, NextResponse } from 'next/server'
import { getLoggedUser } from '@/app/actions/auth'
import { CalendarAggregationService } from '@/modules/calendar/services/CalendarAggregationService'

export async function GET(req: NextRequest) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const startOfWeek = searchParams.get('startOfWeek')

    if (!startOfWeek || !/^\d{4}-\d{2}-\d{2}$/.test(startOfWeek)) {
      return NextResponse.json({ error: 'Missing or invalid startOfWeek format (YYYY-MM-DD)' }, { status: 400 })
    }

    const data = await CalendarAggregationService.getWeekView(user.id, startOfWeek)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Failed to get calendar week view:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
