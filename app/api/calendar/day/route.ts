import { NextRequest, NextResponse } from 'next/server'
import { getLoggedUser } from '@/app/actions/auth'
import { CalendarAggregationService } from '@/modules/calendar/services/CalendarAggregationService'

export async function GET(req: NextRequest) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams = new URL(req.url).searchParams } = new URL(req.url)
    const date = searchParams.get('date')

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Missing or invalid date format (YYYY-MM-DD)' }, { status: 400 })
    }

    const data = await CalendarAggregationService.getDayView(user.id, date)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Failed to get calendar day view:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
