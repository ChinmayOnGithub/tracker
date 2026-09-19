import { VaultPanel } from '@/components/VaultPanel'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import { canAccessModule, getEffectiveGuestPermissions } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
    return null
  }

  const guestPerms = await getEffectiveGuestPermissions()
  if (!canAccessModule(loggedUser, 'documents', guestPerms)) {
    redirect('/settings')
    return null
  }

  return <VaultPanel />
}
