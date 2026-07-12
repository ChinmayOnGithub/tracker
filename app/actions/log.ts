"use server"

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { getLoggedUser } from './auth'

/**
 * Helper to check if a user is logged in and returns their profile.
 */
async function getAuthSession() {
  const user = await getLoggedUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Checks if a template is owned by the current user.
 */
async function verifyTemplateOwnership(templateId: string, user: { id: string; username: string }) {
  const template = await db.activityTemplate.findUnique({
    where: { id: templateId }
  })
  if (!template) {
    throw new Error('Activity template not found')
  }
  const isOwner = template.userId === user.id || (template.userId === null && user.username === 'admin')
  if (!isOwner) {
    throw new Error('Unauthorized template access')
  }
  return template
}

/**
 * Checks if a log is owned by the current user.
 */
async function verifyLogOwnership(logId: string, user: { id: string; username: string }) {
  const log = await db.activityLog.findUnique({
    where: { id: logId }
  })
  if (!log) {
    throw new Error('Activity log not found')
  }
  const isOwner = log.userId === user.id || (log.userId === null && user.username === 'admin')
  if (!isOwner) {
    throw new Error('Unauthorized log access')
  }
  return log
}

export async function createLog(data: {
  activityId: string
  date: string // YYYY-MM-DD
  status: string
  note?: string | null
  amount?: number | null
  payload?: unknown
}) {
  try {
    const user = await getAuthSession()
    await verifyTemplateOwnership(data.activityId, user)

    const log = await db.activityLog.create({
      data: {
        activityId: data.activityId,
        logDate: new Date(data.date),
        status: data.status,
        note: data.note ?? null,
        amount: data.amount ?? null,
        payload: data.payload as Prisma.InputJsonValue,
        userId: user.id,
      },
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
    const user = await getAuthSession()
    await verifyLogOwnership(id, user)

    const log = await db.activityLog.update({
      where: { id },
      data: {
        status: data.status,
        note: data.note,
        amount: data.amount,
        payload: data.payload !== undefined ? (data.payload as Prisma.InputJsonValue) : undefined,
      },
    })

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
    const user = await getAuthSession()
    await verifyLogOwnership(id, user)

    await db.activityLog.delete({
      where: { id },
    })

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
    const user = await getAuthSession()
    await verifyTemplateOwnership(templateId, user)

    const existing = await db.activityLog.findFirst({
      where: {
        activityId: templateId,
        logDate: new Date(date),
        status,
        userId: user.id,
      },
    })

    if (existing) {
      return { success: true, log: existing, message: 'Already marked complete' }
    }

    const log = await db.activityLog.create({
      data: {
        activityId: templateId,
        logDate: new Date(date),
        status,
        amount: amount ?? null,
        payload: payload as Prisma.InputJsonValue,
        userId: user.id,
      },
    })

    revalidatePath('/')
    return { success: true, log }
  } catch (error) {
    console.error('Failed to mark complete:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
