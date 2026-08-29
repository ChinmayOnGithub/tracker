"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'


import { requireOwnership } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { SyncedActivityService } from '@/lib/services/SyncedActivityService'

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
  date: string // YYYY-MM-DD
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

    const logDate = new Date(`${data.date}T12:00:00.000Z`)
    const existing = await db.activityLog.findFirst({
      where: {
        activityId: data.templateId,
        logDate,
        userId: user.id,
        deletedAt: null
      }
    })

    const service = isFeatureEnabled('SYNC_ENGINE_ENABLED') 
      ? SyncedActivityService 
      : ActivityService

    if (data.status === 'cleared') {
      if (existing) {
        if (existing.workSessionId) {
          await db.workSession.updateMany({
            where: { id: existing.workSessionId, userId: user.id, deletedAt: null },
            data: { deletedAt: new Date() }
          })
        }
        await service.deleteLog(user.id, existing.id)
      }
    } else {
      const logStatus = data.status === 'office' ? 'done' : 'wfh'
      const sessionState = data.sessionState || (data.outTime ? 'completed' : 'running')
      const accumulatedSeconds = data.accumulatedSeconds !== undefined && data.accumulatedSeconds !== null
        ? data.accumulatedSeconds
        : (data.hours ? Math.round(data.hours * 3600) : 0)

      // Ensure a linked WorkSession exists and is synchronized
      let wsId = data.workSessionId || existing?.workSessionId
      if (!wsId) {
        const ws = await db.workSession.create({
          data: {
            userId: user.id,
            date: data.date,
            mode: data.status,
            startedAt: data.currentSegmentStartedAt ? new Date(data.currentSegmentStartedAt) : (data.inTime ? new Date(`${data.date}T${data.inTime}:00`) : null),
            endedAt: sessionState === 'completed' && data.outTime ? new Date(`${data.date}T${data.outTime}:00`) : null,
            durationMinutes: Math.round(accumulatedSeconds / 60),
            loggingMode: data.loggingMode || 'timer',
            manualMinutes: data.manualHours ? Math.round(data.manualHours * 60) : 0,
          }
        })
        wsId = ws.id
      } else {
        await db.workSession.updateMany({
          where: { id: wsId, userId: user.id },
          data: {
            mode: data.status,
            startedAt: data.currentSegmentStartedAt ? new Date(data.currentSegmentStartedAt) : undefined,
            endedAt: sessionState === 'completed' && data.outTime ? new Date(`${data.date}T${data.outTime}:00`) : (sessionState === 'running' ? null : undefined),
            durationMinutes: Math.round(accumulatedSeconds / 60),
            loggingMode: data.loggingMode || 'timer',
            manualMinutes: data.manualHours ? Math.round(data.manualHours * 60) : 0,
          }
        })
      }

      const payloadJson = {
        inTime: data.inTime || null,
        outTime: data.outTime || null,
        isWfh: data.status === 'wfh',
        hours: data.hours || 0,
        loggingMode: data.loggingMode || null,
        manualHours: data.manualHours || null,
        sessionState,
        accumulatedSeconds,
        currentSegmentStartedAt: data.currentSegmentStartedAt ?? null,
        workSessionId: wsId,
      }

      await service.logActivity({
        id: existing?.id,
        userId: user.id,
        templateId: data.templateId,
        date: data.date,
        status: logStatus,
        amount: data.hours || 0,
        workSessionId: wsId,
        payload: payloadJson
      })
    }

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to log work presence:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

