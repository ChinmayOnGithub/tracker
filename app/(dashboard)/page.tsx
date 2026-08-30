import { TodayDashboardWrapper } from '@/components/TodayDashboardWrapper'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import { getTodayDateStr } from '@/lib/recurrence'
import { canAccess } from '@/lib/auth-guards'

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

  // Check if current user is owner. If non-owner, redirect to personal profile/settings
  if (!canAccess(loggedUser, 'core.owner')) {
    redirect('/settings')
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
