import { JournalPanel } from '@/components/JournalPanel'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import { canAccess } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
    return null
  }

  if (!canAccess(loggedUser, 'journal.read')) {
    redirect('/settings')
    return null
  }

  return <JournalPanel initialEntries={[]} />
}
