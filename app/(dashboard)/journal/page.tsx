import { JournalPanel, JournalEntry } from '@/components/JournalPanel'
import { redirect } from 'next/navigation'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { listJournalEntries } from '@/app/actions/journal'

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

  const res = await listJournalEntries(1, 100)
  const initialEntries: JournalEntry[] = res.success && res.entries ? (res.entries as unknown as JournalEntry[]) : []

  return <JournalPanel initialEntries={initialEntries} />
}
