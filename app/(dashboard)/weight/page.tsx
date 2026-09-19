import { db } from '@/lib/db'
import { WeightPanel } from '@/components/WeightPanel'
import { redirect } from 'next/navigation'
import { AuthorizationService } from '@/lib/services/AuthorizationService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const auth = await AuthorizationService.getAuthorizedPageContext({ module: 'weight' })
  if (!auth.user) {
    redirect('/')
    return null
  }

  if (!auth.canAccess) {
    redirect('/settings')
    return null
  }

  const loggedUser = auth.user

  // Weight records from last 90 days
  const weightRecordsRaw = await db.weightRecord.findMany({
    where: {
      userId: loggedUser.id,
      deletedAt: null,
      date: { gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: 'asc' },
  })

  const weightRecords = weightRecordsRaw.map(r => ({
    ...r,
    date: r.date.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  return <WeightPanel initialRecords={weightRecords} />
}
