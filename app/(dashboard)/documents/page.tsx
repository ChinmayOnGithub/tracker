import { VaultPanel } from '@/components/VaultPanel'
import { redirect } from 'next/navigation'
import { AuthorizationService } from '@/lib/services/AuthorizationService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const auth = await AuthorizationService.getAuthorizedPageContext({ module: 'documents' })
  if (!auth.user) {
    redirect('/')
    return null
  }

  if (!auth.canAccess) {
    redirect('/settings')
    return null
  }

  return <VaultPanel />
}
