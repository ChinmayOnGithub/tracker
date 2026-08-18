import { TodayDashboardWrapper } from '@/components/TodayDashboardWrapper'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import { getTodayDateStr } from '@/lib/recurrence'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page(props: { searchParams: Promise<{ date?: string }> }) {
  const searchParams = await props.searchParams
  const dateParam = searchParams.date
  
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/api/auth/google')
    return null
  }

  const todayStr = dateParam || getTodayDateStr()

  return (
    <TodayDashboardWrapper
      todayStr={todayStr}
      analyzedTemplates={[]}
      logs={[]}
      journalEntries={[]}
      leaveRecords={[]}
      leaveAllowances={[]}
      weightRecords={[]}
      initialDashboardConfig={null}
    />
  )
}
