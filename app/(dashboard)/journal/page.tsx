import { db } from '@/lib/db'
import { JournalPanel } from '@/components/JournalPanel'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
  }

  const journalEntriesRaw = await db.journalEntry.findMany({
    where: { userId: loggedUser.id, deletedAt: null },
    orderBy: { journalDate: 'desc' },
    take: 20,
  })

  const journalEntries = journalEntriesRaw.map(e => ({
    ...e,
    journalDate: e.journalDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    metadata: e.metadata as any,
  }))

  return <JournalPanel initialEntries={journalEntries} />
}
