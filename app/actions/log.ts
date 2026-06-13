"use server"

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'

export async function createLog(data: {
  activityId: string
  date: string // YYYY-MM-DD
  status: string
  note?: string | null
  amount?: number | null
  payload?: unknown
}) {
  try {
    const log = await db.activityLog.create({
      data: {
        activityId: data.activityId,
        date: data.date,
        status: data.status,
        note: data.note ?? null,
        amount: data.amount ?? null,
        payload: data.payload as Prisma.InputJsonValue,
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
    const existing = await db.activityLog.findFirst({
      where: {
        activityId: templateId,
        date,
        status,
      },
    })

    if (existing) {
      return { success: true, log: existing, message: 'Already marked complete' }
    }

    const log = await db.activityLog.create({
      data: {
        activityId: templateId,
        date,
        status,
        amount: amount ?? null,
        payload: payload as Prisma.InputJsonValue,
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
