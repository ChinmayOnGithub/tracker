import { NotesPanel } from '@/components/NotesPanel'
import { listNotes } from '@/app/actions/note'
import { redirect } from 'next/navigation'
import { AuthorizationService } from '@/lib/services/AuthorizationService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const auth = await AuthorizationService.getAuthorizedPageContext({ module: 'notes' })
  if (!auth.user) {
    redirect('/')
    return null
  }

  if (!auth.canAccess) {
    redirect('/settings')
    return null
  }

  const notesRes = await listNotes()
  const initialNotes = notesRes.success && notesRes.notes ? notesRes.notes : []

  return <NotesPanel initialNotes={initialNotes} />
}
