"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireOwnership, requireModuleAccess } from '@/lib/auth-guards'
import { logWeightSchema } from '@/lib/validations'

import { ActivityService, type TransactionalDbClient } from '@/lib/services/ActivityService'

/**
 * Log or update today's weight entry (one per day per user).
 * Uses upsert-by-date pattern to avoid duplicates.
 */
export async function logWeight(
  date: string,
  weight: number,
  notes?: string | null,
  options?: { consentToCreateActivity?: boolean } | boolean
) {
  const parsed = logWeightSchema.safeParse({ date, weight, notes })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    const user = await requireModuleAccess('weight')

    const hasConsent = typeof options === 'boolean' ? options : Boolean(options?.consentToCreateActivity)

    // Normalize to noon UTC to avoid timezone boundary issues
    const dateObj = new Date(`${date}T12:00:00.000Z`)
    const startOfDay = new Date(`${date}T00:00:00.000Z`)
    const endOfDay = new Date(`${date}T23:59:59.999Z`)

    const txResult = await db.$transaction(async (tx) => {
      // Concurrency lock for template provisioning and weight logging
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('user-template:' || ${user.id}))`
      } catch {
        // Non-fatal in mock/test environments
      }

      // 1. Find or provision canonical template atomically
      let template = await tx.activityTemplate.findFirst({
        where: {
          userId: user.id,
          name: 'Log Weight',
          deletedAt: null
        }
      })

      // 2. If activity does not exist, require explicit user consent before provisioning (#195)
      if (!template && !hasConsent) {
        return {
          requiresConsent: true,
          code: 'FEATURE_ACTIVITY_CONSENT_REQUIRED' as const,
          error: 'Weight tracking requires a "Log Weight" activity in your routine. Would you like to create or restore it?',
          feature: 'weight',
          activityName: 'Log Weight'
        }
      }

      // 3. If consent is provided and template is missing, check activity quota against canonical entitlement
      if (!template && hasConsent) {
        const { EntitlementService } = await import('@/lib/services/EntitlementService')
        const activeCount = await tx.activityTemplate.count({
          where: {
            userId: user.id,
            deletedAt: null,
            isActive: true
          }
        })
        const quotaLimit = await EntitlementService.getLimit(user.id, 'activities_active')

        if (activeCount >= quotaLimit) {
          return {
            success: false,
            code: 'ACTIVITY_LIMIT_REACHED' as const,
            error: `You have reached your active activity limit (${activeCount}/${quotaLimit}). Please deactivate or delete an activity to make room for Weight Tracking, or upgrade your plan.`,
            limit: quotaLimit,
            current: activeCount
          }
        }

        // Prefer restoring a soft-deleted canonical template rather than creating a duplicate
        const softDeletedTemplate = await tx.activityTemplate.findFirst({
          where: {
            userId: user.id,
            name: 'Log Weight',
            deletedAt: { not: null }
          },
          orderBy: { updatedAt: 'desc' }
        })

        if (softDeletedTemplate) {
          template = await tx.activityTemplate.update({
            where: { id: softDeletedTemplate.id },
            data: { deletedAt: null, isActive: true }
          })
        } else {
          template = await tx.activityTemplate.create({
            data: {
              userId: user.id,
              name: 'Log Weight',
              type: 'PERSONAL',
              recurrenceType: 'daily',
              category: 'health',
              icon: 'Scale',
              color: 'blue',
              sortOrder: activeCount + 1,
              notes: 'Track daily weight fluctuations',
              metadata: {
                completion: {
                  method: 'VALUE',
                  hook: 'weight',
                  value: {
                    label: 'Weight',
                    unit: 'kg',
                    required: true,
                  }
                }
              }
            }
          })
        }
      }

      if (!template) {
        throw new Error('Failed to resolve activity template for weight tracking')
      }

      // Find existing record for this date
      const existing = await tx.weightRecord.findFirst({
        where: {
          userId: user.id,
          deletedAt: null,
          date: { gte: startOfDay, lte: endOfDay },
        },
      })

      let currentRecord
      if (existing) {
        await tx.weightRecord.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null },
          data: { weight, notes: notes ?? existing.notes },
        })
        currentRecord = await tx.weightRecord.findUnique({ where: { id: existing.id } })
        if (!currentRecord) throw new Error('Failed to retrieve updated weight record')
      } else {
        currentRecord = await tx.weightRecord.create({
          data: { userId: user.id, date: dateObj, weight, notes: notes ?? null },
        })
      }

      // Log occurrence via ActivityService
      await ActivityService.logActivity({
        userId: user.id,
        templateId: template.id,
        date,
        status: 'done',
        weightRecordId: currentRecord.id,
        amount: weight,
        note: notes ?? `Logged weight: ${weight} kg`
      }, tx as TransactionalDbClient)

      return { success: true, record: currentRecord }
    })

    if ('requiresConsent' in txResult && txResult.requiresConsent) {
      return {
        success: false,
        code: txResult.code,
        error: txResult.error,
        requiresConsent: true,
        feature: txResult.feature,
        activityName: txResult.activityName
      }
    }

    if ('code' in txResult && txResult.code === 'ACTIVITY_LIMIT_REACHED') {
      return txResult
    }

    try {
      revalidatePath('/')
    } catch {
      // Non-fatal if invoked outside Next.js request context (e.g. in test suites)
    }
    return txResult
  } catch (error) {
    console.error('Failed to log weight:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

const MAX_WEIGHT_HISTORY_DAYS = 730
 
/**
 * Fetch the last N weight records for the current user, newest first.
 */
export async function getWeightHistory(days = 90) {
  try {
    const user = await requireModuleAccess('weight')
    const numDays = Number(days)

    if (isNaN(numDays) || !Number.isInteger(numDays) || numDays <= 0) {
      return { success: false, error: 'Days must be a positive integer', records: [] }
    }

    if (numDays > MAX_WEIGHT_HISTORY_DAYS) {
      return { success: false, error: `Days cannot exceed maximum allowed history of ${MAX_WEIGHT_HISTORY_DAYS} days`, records: [] }
    }

    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    since.setUTCDate(since.getUTCDate() - numDays)

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

    await db.$transaction(async (tx) => {
      const { count } = await tx.weightRecord.updateMany({
        where: { id, userId: user.id, deletedAt: null },
        data: { deletedAt: new Date() }
      })

      if (count === 0) {
        throw new Error('Weight record not found')
      }
      
      // Soft-delete corresponding activity logs scoped to userId
      await tx.activityLog.updateMany({
        where: { weightRecordId: id, userId: user.id, deletedAt: null },
        data: { deletedAt: new Date() }
      })
    })

    try {
      revalidatePath('/')
    } catch {
      // Non-fatal if invoked outside Next.js request context (e.g. in test suites)
    }
    return { success: true }
  } catch (error) {
    console.error('Failed to delete weight record:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
