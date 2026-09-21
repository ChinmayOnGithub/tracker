import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { todayYMD } from '@/lib/dateUtils'

export interface UpsertJournalData {
  content?: string
  mood?: string | null
  gratitude?: string | null
  reflections?: string | null
  lessonsLearned?: string | null
  tomorrowPlan?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Canonical JournalService — Single source of truth for Journal domain operations.
 * Enforces strict tenant isolation (userId) and soft-deletion protection across all queries.
 */
export class JournalService {
  /**
   * Retrieves a journal entry for a user on a specific date (YYYY-MM-DD).
   */
  static async getByDate(userId: string, dateStr: string) {
    if (!userId || !dateStr) return null
    const journalDate = new Date(`${dateStr}T12:00:00.000Z`)

    return db.journalEntry.findFirst({
      where: {
        userId,
        journalDate,
        deletedAt: null,
      },
    })
  }

  /**
   * Retrieves today's journal entry for a user.
   */
  static async getForToday(userId: string) {
    return this.getByDate(userId, todayYMD())
  }

  /**
   * Retrieves journal entries within an inclusive date range (YYYY-MM-DD).
   */
  static async getRange(userId: string, startDateStr: string, endDateStr: string) {
    if (!userId || !startDateStr || !endDateStr) return []
    const startDate = new Date(`${startDateStr}T00:00:00.000Z`)
    const endDate = new Date(`${endDateStr}T23:59:59.999Z`)

    return db.journalEntry.findMany({
      where: {
        userId,
        journalDate: {
          gte: startDate,
          lte: endDate,
        },
        deletedAt: null,
      },
      orderBy: { journalDate: 'asc' },
    })
  }

  /**
   * Searches the authenticated user's journal entries.
   * Strictly scopes by userId and excludes soft-deleted entries.
   * Matches across: content, gratitude, reflections, lessonsLearned, tomorrowPlan, and mood.
   */
  static async search(userId: string, query: string) {
    if (!userId) return []
    const trimmed = query.trim()
    if (!trimmed) return []

    return db.journalEntry.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { content: { contains: trimmed, mode: 'insensitive' } },
          { gratitude: { contains: trimmed, mode: 'insensitive' } },
          { reflections: { contains: trimmed, mode: 'insensitive' } },
          { lessonsLearned: { contains: trimmed, mode: 'insensitive' } },
          { tomorrowPlan: { contains: trimmed, mode: 'insensitive' } },
          { mood: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      orderBy: { journalDate: 'desc' },
      take: 100,
    })
  }

  /**
   * Upserts a journal entry for the user on a specific date.
   */
  static async upsert(userId: string, dateStr: string, fields: UpsertJournalData) {
    if (!userId || !dateStr) throw new Error('userId and date are required')
    const journalDate = new Date(`${dateStr}T12:00:00.000Z`)

    const existing = await db.journalEntry.findFirst({
      where: { userId, journalDate },
    })

    if (existing) {
      return db.journalEntry.update({
        where: { id: existing.id },
        data: {
          content: fields.content !== undefined ? fields.content : existing.content,
          mood: fields.mood !== undefined ? fields.mood : existing.mood,
          gratitude: fields.gratitude !== undefined ? fields.gratitude : existing.gratitude,
          reflections: fields.reflections !== undefined ? fields.reflections : existing.reflections,
          lessonsLearned: fields.lessonsLearned !== undefined ? fields.lessonsLearned : existing.lessonsLearned,
          tomorrowPlan: fields.tomorrowPlan !== undefined ? fields.tomorrowPlan : existing.tomorrowPlan,
          metadata: fields.metadata !== undefined
            ? (fields.metadata ? (fields.metadata as Prisma.InputJsonValue) : Prisma.JsonNull)
            : (existing.metadata as Prisma.InputJsonValue),
          deletedAt: null,
        },
      })
    }

    return db.journalEntry.create({
      data: {
        userId,
        journalDate,
        content: fields.content ?? '',
        mood: fields.mood ?? null,
        gratitude: fields.gratitude ?? null,
        reflections: fields.reflections ?? null,
        lessonsLearned: fields.lessonsLearned ?? null,
        tomorrowPlan: fields.tomorrowPlan ?? null,
        metadata: fields.metadata ? (fields.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })
  }

  /**
   * Soft-deletes a journal entry and cascades soft-delete to linked activity logs.
   */
  static async delete(userId: string, id: string) {
    if (!userId || !id) return { success: false, error: 'Unauthorized or missing ID' }

    const { count } = await db.journalEntry.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    })

    if (count === 0) {
      return { success: false, error: 'Journal entry not found' }
    }

    // Cascade soft-delete to linked activity log scoped to user
    await db.activityLog.updateMany({
      where: { journalEntryId: id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    })

    return { success: true }
  }
}
