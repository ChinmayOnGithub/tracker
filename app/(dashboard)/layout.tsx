import { getLoggedUser } from '@/app/actions/auth'
import { DashboardLayout } from '@/components/DashboardLayout'

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const loggedUser = await getLoggedUser()

  return (
    <DashboardLayout currentUser={loggedUser}>
      {children}
    </DashboardLayout>
  )
}
