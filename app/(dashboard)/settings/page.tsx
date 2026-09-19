import { SettingsPanel } from '@/components/SettingsPanel'
import { getUserProfileAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import { SessionService } from '@/lib/services/SessionService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await SessionService.getSessionUser()
  if (!loggedUser) {
    redirect('/')
  }

  const profileRes = await getUserProfileAction()
  const initialUserProfile = profileRes.success && profileRes.user ? profileRes.user : null

  return <SettingsPanel initialUserProfile={initialUserProfile} />
}
