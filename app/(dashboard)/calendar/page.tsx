import { CalendarWrapper } from '@/components/CalendarWrapper'
import { redirect } from 'next/navigation'
import { getTodayDateStr } from '@/lib/recurrence'
import { AuthorizationService } from '@/lib/services/AuthorizationService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const auth = await AuthorizationService.getAuthorizedPageContext({ module: 'calendar' })
  if (!auth.user) {
    redirect('/')
    return null
  }

  if (!auth.canAccess) {
    redirect('/settings')
    return null
  }

  const todayStr = getTodayDateStr()

  return (
    <CalendarWrapper
      logs={[]}
      templates={[]}
      notes={[]}
      todayStr={todayStr}
      analyzedTemplates={[]}
    />
  )
}
