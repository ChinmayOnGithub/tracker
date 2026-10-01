"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'


import { requireAuth, requireOwnership } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { SyncedActivityService } from '@/lib/services/SyncedActivityService'
import { createLocalDateTime } from '@/lib/dateUtils'
import { Prisma } from '@prisma/client'

async function acquireWorkTrackerLock(
  tx: Prisma.TransactionClient,
  userId: string,
  templateId: string,
  date: string,
) {
  const lockKey = 'work-tracker:' + userId + ':' + templateId + ':' + date
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)
}

export async function createLog(data: {
  id?: string
  activityId: string
  date: string // YYYY-MM-DD
  status: string
  note?: string | null
  amount?: number | null
  payload?: unknown
}) {
  try {
    const { user } = await requireOwnership('activityTemplate', data.activityId)

    // Feature-flagged: Use Sync Engine if enabled
    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED') 
      ? SyncedActivityService 
      : ActivityService

    const log = await service.logActivity({
      id: data.id,
      userId: user.id,
      templateId: data.activityId,
      date: data.date,
      status: data.status,
      note: data.note,
      amount: data.amount,
      payload: data.payload,
    })

    revalidatePath('/')
    return { success: true, log }
  } catch (error) {
    console.error('Failed to create log:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateLog(
  id: string,
  data: {
    status?: string
    note?: string | null
    amount?: number | null
    payload?: unknown
  }
) {
  try {
    const { user } = await requireOwnership('activityLog', id)

    // Feature-flagged: Use Sync Engine if enabled
    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED') 
      ? SyncedActivityService 
      : ActivityService

    const log = await service.updateLog(user.id, id, data)

    revalidatePath('/')
    return { success: true, log }
  } catch (error) {
    console.error('Failed to update log:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteLog(id: string) {
  try {
    const { user } = await requireOwnership('activityLog', id)

    // Feature-flagged: Use Sync Engine if enabled
    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED') 
      ? SyncedActivityService 
      : ActivityService

    await service.deleteLog(user.id, id)

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete log:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function markComplete(
  templateId: string,
  date: string, // YYYY-MM-DD
  status = 'done',
  amount?: number | null,
  payload?: unknown
) {
  try {
    const { user } = await requireOwnership('activityTemplate', templateId)

    const logDate = new Date(`${date}T12:00:00.000Z`)
    const existing = await db.activityLog.findFirst({
      where: {
        activityId: templateId,
        logDate,
        status,
        userId: user.id,
        deletedAt: null
      },
    })

    if (existing) {
      return { success: true, log: existing, message: 'Already marked complete' }
    }

    // Feature-flagged: Use Sync Engine if enabled
    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED') 
      ? SyncedActivityService 
      : ActivityService

    const log = await service.logActivity({
      userId: user.id,
      templateId,
      date,
      status,
      amount: amount ?? null,
      payload,
    })

    revalidatePath('/')
    return { success: true, log }
  } catch (error) {
    console.error('Failed to mark complete:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Postpone a one_time task: marks it as 'postponed' on the current date
 * and updates the template's targetDate to the next day.
 * This keeps the postponed log visible on the original day (history)
 * while making the task appear as "due" on the next day.
 */
export async function postponeOneTimeTask(
  templateId: string,
  currentDate: string, // YYYY-MM-DD — the day being postponed FROM
  existingLogId?: string | null
) {
  try {
    const { user } = await requireOwnership('activityTemplate', templateId)

    // Feature-flagged: Use Sync Engine if enabled
    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED')
      ? SyncedActivityService
      : ActivityService

    // 1. Mark the current-day log as 'postponed'
    if (existingLogId) {
      await service.updateLog(user.id, existingLogId, { status: 'postponed' })
    } else {
      await service.logActivity({
        userId: user.id,
        templateId,
        date: currentDate,
        status: 'postponed',
      })
    }

    // 2. Compute the next day and update the template's targetDate
    const [y, m, d] = currentDate.split('-').map(Number)
    const nextDay = new Date(Date.UTC(y, m - 1, d))
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    const nextDayStr = nextDay.toISOString().split('T')[0]

    await db.activityTemplate.update({
      where: { id: templateId },
      data: { targetDate: new Date(`${nextDayStr}T12:00:00.000Z`) }
    })

    revalidatePath('/')
    return { success: true, nextDate: nextDayStr }
  } catch (error) {
    console.error('Failed to postpone one_time task:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Un-postpone a one_time task: soft-deletes the postponed log
 * and reverts the template's targetDate back to the original date.
 */
export async function unpostponeOneTimeTask(
  templateId: string,
  logId: string,
  originalDate: string // YYYY-MM-DD — the day to revert targetDate to
) {
  try {
    const { user } = await requireOwnership('activityTemplate', templateId)

    // Feature-flagged: Use Sync Engine if enabled
    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED')
      ? SyncedActivityService
      : ActivityService

    // 1. Soft-delete the postponed log
    await service.deleteLog(user.id, logId)

    // 2. Revert the template's targetDate
    await db.activityTemplate.update({
      where: { id: templateId },
      data: { targetDate: new Date(`${originalDate}T12:00:00.000Z`) }
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to un-postpone one_time task:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Logs daily work presence (Office, WFH, or Cleared).
 * If status is 'office', tracks in-time, out-time, and computed office hours.
 * If status is 'wfh', tracks WFH hours.
 * Saves data into the ActivityLog table associated with the system 'Work Tracker' template.
 */
export async function logWorkPresence(data: {
  templateId: string
  date: string
  status: 'office' | 'wfh' | 'cleared'
  inTime?: string | null
  outTime?: string | null
  hours?: number | null
  loggingMode?: 'time' | 'manual' | null
  manualHours?: number | null
  sessionState?: 'idle' | 'running' | 'paused' | 'completed' | null
  accumulatedSeconds?: number | null
  currentSegmentStartedAt?: string | null
  workSessionId?: string | null
}) {
  try {
    const { user } = await requireOwnership('activityTemplate', data.templateId)

    const result = await db.$transaction(async (tx) => {
      await acquireWorkTrackerLock(tx, user.id, data.templateId, data.date)

      const logDate = new Date(data.date + 'T12:00:00.000Z')
      const existing = await tx.activityLog.findFirst({
        where: { activityId: data.templateId, logDate, userId: user.id, deletedAt: null },
      })

      if (data.status === 'cleared') {
        if (existing) await ActivityService.deleteLog(user.id, existing.id, tx)
        return null
      }

      const logStatus = data.status === 'office' ? 'done' : 'wfh'
      const sessionState = data.sessionState || (data.outTime ? 'completed' : 'running')
      const accumulatedSeconds = data.accumulatedSeconds !== undefined && data.accumulatedSeconds !== null
        ? Math.max(0, Math.round(data.accumulatedSeconds))
        : (data.hours ? Math.max(0, Math.round(data.hours * 3600)) : 0)

      let wsId = data.workSessionId || existing?.workSessionId

      if (wsId) {
        const linkedSession = await tx.workSession.findFirst({
          where: { id: wsId, userId: user.id, date: data.date, deletedAt: null },
          include: { activityLog: { select: { activityId: true, userId: true, deletedAt: true } } },
        })
        if (!linkedSession) throw new Error('Work session not found or unauthorized.')
        if (linkedSession.activityLog && (
          linkedSession.activityLog.activityId !== data.templateId ||
          linkedSession.activityLog.userId !== user.id ||
          linkedSession.activityLog.deletedAt !== null
        )) {
          throw new Error('Invalid work session for this Work Tracker record.')
        }
      }

      if (!wsId) {
        const ws = await tx.workSession.create({
          data: {
            userId: user.id,
            date: data.date,
            mode: data.status,
            startedAt: data.currentSegmentStartedAt
              ? new Date(data.currentSegmentStartedAt)
              : (data.inTime ? createLocalDateTime(data.date, data.inTime) : null),
            endedAt: sessionState === 'completed' && data.outTime
              ? createLocalDateTime(data.date, data.outTime)
              : null,
            durationMinutes: Math.round(accumulatedSeconds / 60),
            durationSeconds: accumulatedSeconds,
            loggingMode: data.loggingMode || 'timer',
            manualMinutes: data.manualHours ? Math.round(data.manualHours * 60) : 0,
          },
        })
        wsId = ws.id
      } else {
        const updated = await tx.workSession.updateMany({
          where: { id: wsId, userId: user.id, date: data.date, deletedAt: null },
          data: {
            mode: data.status,
            startedAt: data.currentSegmentStartedAt ? new Date(data.currentSegmentStartedAt) : undefined,
            endedAt: sessionState === 'completed' && data.outTime
              ? createLocalDateTime(data.date, data.outTime)
              : (sessionState === 'running' ? null : undefined),
            durationMinutes: Math.round(accumulatedSeconds / 60),
            durationSeconds: accumulatedSeconds,
            loggingMode: data.loggingMode || 'timer',
            manualMinutes: data.manualHours ? Math.round(data.manualHours * 60) : 0,
          },
        })
        if (updated.count !== 1) throw new Error('Work session could not be updated.')
      }

      return ActivityService.logActivity({
        id: existing?.id,
        userId: user.id,
        templateId: data.templateId,
        date: data.date,
        status: logStatus,
        amount: accumulatedSeconds / 3600,
        workSessionId: wsId,
        payload: {
          inTime: data.inTime || null,
          outTime: data.outTime || null,
          isWfh: data.status === 'wfh',
          hours: accumulatedSeconds / 3600,
          loggingMode: data.loggingMode || null,
          manualHours: data.manualHours || null,
          sessionState,
          accumulatedSeconds,
          currentSegmentStartedAt: data.currentSegmentStartedAt ?? null,
          workSessionId: wsId,
        },
      }, tx)
    })

    revalidatePath('/')
    return { success: true, log: result }
  } catch (error) {
    console.error('Failed to log work presence:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}



/**
 * Restores a previously cleared Work Tracker record.
 * The restore is conflict-safe: it will not overwrite a newer active
 * record created for the same template/date after the clear.
 */
export async function restoreWorkPresence(logId: string) {
  try {
    const user = await requireAuth()

    const restoredLog = await db.$transaction(async (tx) => {
      const deletedLog = await tx.activityLog.findFirst({
        where: {
          id: logId,
          userId: user.id,
          deletedAt: { not: null },
          activity: { name: 'Work Tracker', userId: user.id },
        },
      })
      if (!deletedLog) throw new Error('The cleared work record could not be found.')

      await acquireWorkTrackerLock(tx, user.id, deletedLog.activityId, deletedLog.logDate.toISOString().slice(0, 10))

      const activeRecord = await tx.activityLog.findFirst({
        where: {
          activityId: deletedLog.activityId,
          logDate: deletedLog.logDate,
          userId: user.id,
          deletedAt: null,
          id: { not: deletedLog.id },
        },
        select: { id: true },
      })
      if (activeRecord) throw new Error('A newer work record already exists for this date. Undo was not applied.')

      if (deletedLog.workSessionId) {
        await tx.workSession.updateMany({
          where: { id: deletedLog.workSessionId, userId: user.id, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
      }

      const restored = await tx.activityLog.updateMany({
        where: { id: deletedLog.id, userId: user.id, deletedAt: { not: null } },
        data: { deletedAt: null, version: { increment: 1 } },
      })
      if (restored.count !== 1) throw new Error('The work record changed before it could be restored.')

      const freshLog = await tx.activityLog.findUnique({ where: { id: deletedLog.id } })
      if (!freshLog) throw new Error('The restored work record could not be loaded.')
      return freshLog
    })

    revalidatePath('/')
    return { success: true, log: restoredLog }
  } catch (error) {
    console.error('Failed to restore work presence:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
