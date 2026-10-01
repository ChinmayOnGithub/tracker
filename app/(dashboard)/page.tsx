import { TodayDashboardWrapper } from '@/components/TodayDashboardWrapper'
import { getUserSettingsAction } from '@/app/actions/settings'

export default async function Page() {
  const settings = await getUserSettingsAction()

  return (
    <TodayDashboardWrapper
      initialDashboardConfig={settings.success ? settings.settings?.dashboard ?? null : null}
      initialWeeklyGoal={settings.success ? settings.settings?.weeklyGoal ?? null : null}
    />
  )
}
