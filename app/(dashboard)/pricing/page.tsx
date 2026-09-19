import { PricingPanel } from '@/components/PricingPanel'
import { redirect } from 'next/navigation'
import { SessionService } from '@/lib/services/SessionService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await SessionService.getSessionUser()
  if (!loggedUser) {
    redirect('/')
  }

  return <PricingPanel />
}
