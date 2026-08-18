import { CalendarWrapper } from '@/components/CalendarWrapper'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import { getTodayDateStr } from '@/lib/recurrence'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
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
