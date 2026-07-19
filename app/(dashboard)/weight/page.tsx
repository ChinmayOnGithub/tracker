import { db } from '@/lib/db'
import { WeightPanel } from '@/components/WeightPanel'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
  }

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
