import { db } from '@/lib/db'
import { LeavePanel } from '@/components/LeavePanel'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

import { LeaveType, LeaveStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
  }

  const currentYear = new Date().getFullYear()

  const [leaveRecordsRaw, leaveAllowancesRaw] = await Promise.all([
    db.leaveRecord.findMany({
      where: {
        userId: loggedUser.id,
        deletedAt: null,
        startDate: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      orderBy: { startDate: 'desc' },
    }),
    db.leaveAllowance.findMany({
      where: { userId: loggedUser.id, year: currentYear },
      orderBy: { leaveType: 'asc' },
    }),
  ])

  const leaveRecords = leaveRecordsRaw.map(r => ({
    ...r,
    leaveType: r.leaveType as LeaveType,
    status: r.status as LeaveStatus,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))

  const leaveAllowances = leaveAllowancesRaw.map(a => ({
    leaveType: a.leaveType as LeaveType,
    allowance: a.allowance,
  }))

  return (
    <LeavePanel
      leaveRecords={leaveRecords}
      leaveAllowances={leaveAllowances}
      currentYear={currentYear}
    />
  )
}
