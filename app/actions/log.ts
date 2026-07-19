"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'


import { requireOwnership } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { SyncedActivityService } from '@/lib/services/SyncedActivityService'

export async function createLog(data: {
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
