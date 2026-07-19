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

  console.log('[JournalPage] Fetching entries for user:', loggedUser.id)

  // Debug: Check all entries including deleted ones
  const allEntries = await db.journalEntry.findMany({
    where: { userId: loggedUser.id },
    select: { id: true, journalDate: true, content: true, deletedAt: true },
    orderBy: { journalDate: 'desc' },
    take: 20,
  })
  console.log('[JournalPage] ALL entries (including deleted):', allEntries.length)
  allEntries.forEach(e => {
    console.log(`  - ${e.id}: deleted=${!!e.deletedAt}, content length: ${e.content.length}`)
  })

  const journalEntriesRaw = await db.journalEntry.findMany({
    where: { userId: loggedUser.id, deletedAt: null },
    orderBy: { journalDate: 'desc' },
    take: 20,
  })

  console.log('[JournalPage] Found NON-DELETED entries:', journalEntriesRaw.length)
  journalEntriesRaw.forEach(e => {
    console.log(`  - ${e.id}: ${e.journalDate.toISOString()}, content length: ${e.content.length}, preview: "${e.content.substring(0, 50)}"`)
  })

  const journalEntries = journalEntriesRaw.map(e => ({
    ...e,
    journalDate: e.journalDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    metadata: e.metadata as Record<string, unknown> | null,
  }))

  return <JournalPanel initialEntries={journalEntries} />
}
