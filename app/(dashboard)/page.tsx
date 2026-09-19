import { TodayDashboardWrapper } from '@/components/TodayDashboardWrapper'
import { getUserSettingsAction } from '@/app/actions/settings'
import { redirect } from 'next/navigation'
import { getTodayDateStr } from '@/lib/recurrence'
import { AuthorizationService } from '@/lib/services/AuthorizationService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page(props: { searchParams: Promise<{ date?: string }> }) {
  const searchParams = await props.searchParams
  const dateParam = searchParams.date
  
  const auth = await AuthorizationService.getAuthorizedPageContext({ module: 'today' })
  if (!auth.user) {
    // Return null so DashboardLayout renders the login form (Google / Passcode) on '/'
    return null
  }

  // Enforce server-side module access for Today overview
  if (!auth.canAccess) {
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
