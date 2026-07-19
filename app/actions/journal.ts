"use server"

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireOwnership } from '@/lib/auth-guards'

import { ActivityService } from '@/lib/services/ActivityService'

/** Converts any JSON-like value or null to the type Prisma requires for nullable JSON columns. */
function toJsonField(v: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue)
}

/**
 * Upsert a journal entry for a given date (one entry per user per day).
 * Structured fields are optional — pass only what changed.
 */
export async function upsertJournalEntry(
  date: string, // YYYY-MM-DD
  fields: {
    content?: string
    mood?: string | null
    gratitude?: string | null
    reflections?: string | null
    lessonsLearned?: string | null
    tomorrowPlan?: string | null
    metadata?: Record<string, unknown> | null
  }
) {
  try {
    const user = await requireAuth()
    // journalDate is stored as a DateTime — use noon UTC to avoid timezone drift
    const journalDate = new Date(`${date}T12:00:00.000Z`)

    const existing = await db.journalEntry.findUnique({
      where: { userId_journalDate: { userId: user.id, journalDate } },
    })

    let entry
    if (existing) {
      entry = await db.journalEntry.update({
        where: { id: existing.id },
        data: {
          content: fields.content ?? existing.content,
          mood: fields.mood !== undefined ? fields.mood : existing.mood,
          gratitude: fields.gratitude !== undefined ? fields.gratitude : existing.gratitude,
          reflections: fields.reflections !== undefined ? fields.reflections : existing.reflections,
          lessonsLearned: fields.lessonsLearned !== undefined ? fields.lessonsLearned : existing.lessonsLearned,
          tomorrowPlan: fields.tomorrowPlan !== undefined ? fields.tomorrowPlan : existing.tomorrowPlan,
          metadata: toJsonField(
            fields.metadata !== undefined ? fields.metadata : existing.metadata
          ),
        },
      })
    } else {
      entry = await db.journalEntry.create({
        data: {
          userId: user.id,
          journalDate,
          content: fields.content ?? '',
          mood: fields.mood ?? null,
          gratitude: fields.gratitude ?? null,
          reflections: fields.reflections ?? null,
          lessonsLearned: fields.lessonsLearned ?? null,
          tomorrowPlan: fields.tomorrowPlan ?? null,
          metadata: toJsonField(fields.metadata ?? null),
        },
      })
    }

    // Dynamic Template + Log Sync
    const template = await ActivityService.getOrCreateDefaultTemplate(
      user.id,
      'JOURNAL',
      'Daily Journal',
      'personal',
      'BookOpen',
      'amber'
    )

    const cleanNoteText = fields.content 
      ? fields.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() 
      : ''

    await ActivityService.logActivity({
      userId: user.id,
      templateId: template.id,
      date,
      status: 'done',
      journalEntryId: entry.id,
      note: cleanNoteText ? (cleanNoteText.substring(0, 100) + '...') : ''
    })

    revalidatePath('/')
    return { success: true, entry }
  } catch (error) {
    console.error('Failed to upsert journal entry:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * List journal entries for the current user, paginated newest-first.
 */
export async function listJournalEntries(page = 1, limit = 20) {
  try {
    const user = await requireAuth()
    const skip = (page - 1) * limit

    const [entries, total] = await Promise.all([
      db.journalEntry.findMany({
        where: { userId: user.id, deletedAt: null },
        orderBy: { journalDate: 'desc' },
        skip,
        take: limit,
      }),
      db.journalEntry.count({ where: { userId: user.id, deletedAt: null } }),
    ])

    return { success: true, entries, total, page, limit }
  } catch (error) {
    console.error('Failed to list journal entries:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, entries: [], total: 0 }
  }
}

/**
 * Soft-delete a journal entry.
 */
export async function deleteJournalEntry(id: string) {
  try {
    const { user } = await requireOwnership('journalEntry', id)

    await db.journalEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete journal entry:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
