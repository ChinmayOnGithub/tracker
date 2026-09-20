"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireOwnership, requireModuleAccess } from '@/lib/auth-guards'
import { logWeightSchema } from '@/lib/validations'

import { ActivityService } from '@/lib/services/ActivityService'

/**
 * Log or update today's weight entry (one per day per user).
 * Uses upsert-by-date pattern to avoid duplicates.
 */
export async function logWeight(date: string, weight: number, notes?: string | null) {
  const parsed = logWeightSchema.safeParse({ date, weight, notes })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    const user = await requireModuleAccess('weight')

    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const isPro = await EntitlementService.isPro(user.id)
    if (!isPro) {
      return {
        success: false,
        error: 'Weight tracking requires an active Tracker Pro subscription. Your historical weight records remain accessible.',
        code: 'ACCESS_DENIED'
      }
    }

    // Normalize to noon UTC to avoid timezone boundary issues
    const dateObj = new Date(`${date}T12:00:00.000Z`)

    // Find existing record for this date
    const startOfDay = new Date(`${date}T00:00:00.000Z`)
    const endOfDay = new Date(`${date}T23:59:59.999Z`)
    const existing = await db.weightRecord.findFirst({
      where: {
        userId: user.id,
        deletedAt: null,
        date: { gte: startOfDay, lte: endOfDay },
      },
    })

    let record
    if (existing) {
      await db.weightRecord.updateMany({
        where: { id: existing.id, userId: user.id, deletedAt: null },
        data: { weight, notes: notes ?? existing.notes },
      })
      record = await db.weightRecord.findUnique({ where: { id: existing.id } })
      if (!record) throw new Error('Failed to retrieve updated weight record')
    } else {
      record = await db.weightRecord.create({
        data: { userId: user.id, date: dateObj, weight, notes: notes ?? null },
      })
    }

    // Find/create default template for weight tracking
    const template = await ActivityService.getOrCreateDefaultTemplate(
      user.id,
      'PERSONAL',
      'Log Weight',
      'health',
      'Scale',
      'blue'
    )

    // Log occurrence via ActivityService
    await ActivityService.logActivity({
      userId: user.id,
      templateId: template.id,
      date,
      status: 'done',
      weightRecordId: record.id,
      amount: weight,
      note: notes ?? `Logged weight: ${weight} kg`
    })

    revalidatePath('/')
    return { success: true, record }
  } catch (error) {
    console.error('Failed to log weight:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Fetch the last N weight records for the current user, newest first.
 */
export async function getWeightHistory(days = 90) {
  try {
    const user = await requireModuleAccess('weight')
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    since.setUTCDate(since.getUTCDate() - days)

    const records = await db.weightRecord.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    })

    return { success: true, records }
  } catch (error) {
    console.error('Failed to get weight history:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, records: [] }
  }
}

/**
 * Soft-delete a weight record.
 */
export async function deleteWeightRecord(id: string) {
  try {
    await requireModuleAccess('weight')
    const { user } = await requireOwnership('weightRecord', id)

    const { count } = await db.weightRecord.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: { deletedAt: new Date() }
    })

    if (count === 0) {
      return { success: false, error: 'Weight record not found', code: 'NOT_FOUND' }
    }
    
    // Soft-delete corresponding activity logs scoped to userId
    await db.activityLog.updateMany({
      where: { weightRecordId: id, userId: user.id, deletedAt: null },
      data: { deletedAt: new Date() }
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete weight record:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
