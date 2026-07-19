"use server"

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'


import { requireAuth, requireOwnership } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'

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

    const log = await ActivityService.logActivity({
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

    const log = await ActivityService.updateLog(user.id, id, data)

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

    await ActivityService.deleteLog(user.id, id)

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

    const log = await ActivityService.logActivity({
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
