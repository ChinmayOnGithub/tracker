import { SessionService } from '@/lib/services/SessionService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { DashboardLayout } from '@/components/DashboardLayout'
import type { UserEntitlements } from '@/lib/billing/types'

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const loggedUser = await SessionService.getSessionUser()

  // Resolve entitlements server-side so the client starts with the correct
  // access snapshot rather than the FREE_SNAPSHOT interim state.
  let initialEntitlements: UserEntitlements | null = null
  if (loggedUser?.id) {
    try {
      initialEntitlements = await EntitlementService.getEntitlements(loggedUser.id)
    } catch {
      // Non-fatal: client will refetch on mount and use FREE_SNAPSHOT as fallback
      initialEntitlements = null
    }
  }

  return (
    <DashboardLayout currentUser={loggedUser} initialEntitlements={initialEntitlements}>
      {children}
    </DashboardLayout>
  )
}
