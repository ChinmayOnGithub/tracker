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
    const yearStr = searchParams.get('year')
    const monthStr = searchParams.get('month')

    const now = new Date()
    const year = yearStr ? parseInt(yearStr, 10) : now.getFullYear()
    const month = monthStr ? parseInt(monthStr, 10) : now.getMonth() + 1

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    const data = await CalendarAggregationService.getMonthSummary(user.id, year, month)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Failed to get calendar month summary:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
