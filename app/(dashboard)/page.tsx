import { TodayDashboardWrapper } from '@/components/TodayDashboardWrapper'
import { getLoggedUser } from '@/app/actions/auth'
import { getUserSettingsAction } from '@/app/actions/settings'
import { redirect } from 'next/navigation'
import { getTodayDateStr } from '@/lib/recurrence'
import { canAccessModule, getEffectiveGuestPermissions } from '@/lib/auth-guards'

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

  // Enforce server-side module access for Today overview
  const guestPerms = await getEffectiveGuestPermissions()
  if (!canAccessModule(loggedUser, 'today', guestPerms)) {
    redirect('/settings')
    return null
  }

  const todayStr = dateParam || getTodayDateStr()

  // Load canonical user dashboard configuration and settings server-side
  let initialDashboardConfig = null
  let initialWeeklyGoal: number | null = null
  try {
    const settingsRes = await getUserSettingsAction()
    if (settingsRes.success && settingsRes.settings) {
      if (settingsRes.settings.dashboard) {
        initialDashboardConfig = settingsRes.settings.dashboard
      }
      if (settingsRes.settings.weeklyGoal !== undefined) {
        initialWeeklyGoal = settingsRes.settings.weeklyGoal
      }
    }
  } catch (err) {
    console.error('[Page] Failed to fetch initial settings:', err)
  }

  return (
    <TodayDashboardWrapper
      todayStr={todayStr}
      analyzedTemplates={[]}
      logs={[]}
      journalEntries={[]}
      leaveRecords={[]}
      leaveAllowances={[]}
      weightRecords={[]}
      initialDashboardConfig={initialDashboardConfig}
      initialWeeklyGoal={initialWeeklyGoal}
    />
  )
}
