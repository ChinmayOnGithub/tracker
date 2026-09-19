import { JournalPanel } from '@/components/JournalPanel'
import { redirect } from 'next/navigation'
import { AuthorizationService } from '@/lib/services/AuthorizationService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const auth = await AuthorizationService.getAuthorizedPageContext({ module: 'journal' })
  if (!auth.user) {
    redirect('/')
    return null
  }

  if (!auth.canAccess) {
    redirect('/settings')
    return null
  }

  return <JournalPanel initialEntries={[]} />
}
