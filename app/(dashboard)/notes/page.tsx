import { NotesPanel } from '@/components/NotesPanel'
import { getLoggedUser } from '@/app/actions/auth'
import { listNotes } from '@/app/actions/note'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
    return null
  }

  const notesRes = await listNotes()
  const initialNotes = notesRes.success && notesRes.notes ? notesRes.notes : []

  return <NotesPanel initialNotes={initialNotes} />
}
