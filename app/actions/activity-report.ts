"use server"

import { db } from '@/lib/db'
import { requireOwnership } from '@/lib/auth-guards'

/**
 * Load the complete, user-owned history for a monetary activity.
 * The global client store may contain only a partial history, so reports must
 * query the persisted logs directly instead of treating client state as complete.
 */
export async function getActivityReportLogs(activityId: string) {
  const { user } = await requireOwnership('activityTemplate', activityId)

  const records = await db.activityLog.findMany({
    where: {
      userId: user.id,
      activityId,
      deletedAt: null,
    },
    orderBy: [{ logDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })

  return records.map((log) => ({
    id: log.id,
    activityId: log.activityId,
    date: log.logDate.toISOString().slice(0, 10),
    logDate: log.logDate,
    note: log.note,
    status: log.status,
    amount: log.amount,
    payload: log.payload,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  }))
}
