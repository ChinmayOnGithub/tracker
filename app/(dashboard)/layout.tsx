import { SessionService } from '@/lib/services/SessionService'
import { DashboardLayout } from '@/components/DashboardLayout'

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const loggedUser = await SessionService.getSessionUser()

  return (
    <DashboardLayout currentUser={loggedUser}>
      {children}
    </DashboardLayout>
  )
}
