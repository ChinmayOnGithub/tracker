import { db } from '../db'
import { eventBus } from '../events'
import { getTodayDateStr } from '../recurrence'

export class ActivityService {
  /**
   * Log an activity occurrence. This is the single writer to ActivityLog.
   */
  static async logActivity(params: {
    userId: string
    templateId: string
    date: string // YYYY-MM-DD
    status: string // done, skipped, paid, etc.
    note?: string | null
    amount?: number | null
    payload?: any
    weightRecordId?: string | null
    leaveRecordId?: string | null
    journalEntryId?: string | null
  }) {
    const { userId, templateId, date, status, note, amount, payload, weightRecordId, leaveRecordId, journalEntryId } = params
    const logDate = new Date(`${date}T12:00:00.000Z`)

    // Check for existing log for this date and template
    const existing = await db.activityLog.findFirst({
      where: {
        userId,
        activityId: templateId,
        logDate,
        deletedAt: null
      }
    })

    let log
    if (existing) {
      log = await db.activityLog.update({
        where: { id: existing.id },
        data: {
          status,
          note: note !== undefined ? note : existing.note,
          amount: amount !== undefined ? amount : existing.amount,
          payload: payload !== undefined ? payload : existing.payload,
          weightRecordId: weightRecordId !== undefined ? weightRecordId : existing.weightRecordId,
          leaveRecordId: leaveRecordId !== undefined ? leaveRecordId : existing.leaveRecordId,
          journalEntryId: journalEntryId !== undefined ? journalEntryId : existing.journalEntryId
        }
      })
    } else {
      log = await db.activityLog.create({
        data: {
          userId,
          activityId: templateId,
          logDate,
          status,
          note: note ?? null,
          amount: amount ?? null,
          payload: payload ?? null,
          weightRecordId: weightRecordId ?? null,
          leaveRecordId: leaveRecordId ?? null,
          journalEntryId: journalEntryId ?? null
        }
      })
    }

    // Publish event
    if (status === 'done' || status === 'paid' || status === 'completed') {
      await eventBus.publish('ACTIVITY_COMPLETED', {
        logId: log.id,
        templateId,
        userId
      })
    } else if (status === 'skipped') {
      await eventBus.publish('ACTIVITY_SKIPPED', {
        templateId,
        userId
      })
    }

    return log
  }

  /**
   * soft delete an activity log entry
   */
  static async deleteLog(userId: string, logId: string) {
    const existing = await db.activityLog.findUnique({ where: { id: logId } })
    if (!existing || existing.userId !== userId) {
      throw new Error('Log record not found or unauthorized')
    }

    return await db.activityLog.update({
      where: { id: logId },
      data: { deletedAt: new Date() }
    })
  }

  /**
   * Find or create the default template for a system activity type.
   */
  static async getOrCreateDefaultTemplate(userId: string, type: 'JOURNAL' | 'LEAVE' | 'PERSONAL', name: string, category: string, icon: string, color: string) {
    const existing = await db.activityTemplate.findFirst({
      where: {
        userId,
        type,
        name,
        isActive: true,
        deletedAt: null
      }
    })

    if (existing) return existing

    return await db.activityTemplate.create({
      data: {
        userId,
        name,
        category,
        type,
        icon,
        color,
        recurrenceType: 'daily',
        isActive: true
      }
    })
  }
}
