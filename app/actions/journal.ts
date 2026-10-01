"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireOwnership, requireModuleAccess } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { upsertJournalSchema } from '@/lib/validations'

/**
 * Upsert a journal entry for a given date (one entry per user per day).
 * Structured fields are optional — pass only what changed.
 */
export async function upsertJournalEntry(
  date: string,
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
  const parsed = upsertJournalSchema.safeParse({ date, ...fields })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  console.log(`[Journal] upsertJournalEntry called for date ${date}, fields:`, {
    hasContent: !!fields.content,
    contentLength: fields.content?.length || 0,
  })
  
  try {
    const user = await requireModuleAccess('journal')
    console.log(`[Journal] User authenticated: ${user.id}`)

    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const hasAccess = await EntitlementService.hasFeature(user.id, 'advanced_journal')
    if (!hasAccess) {
      return {
        success: false,
        error: 'Journal writing requires an active Tracker Pro subscription. Your historical journal entries remain accessible.',
        code: 'ACCESS_DENIED'
      }
    }
    
    const { JournalService } = await import('@/modules/journal/server')

    const cleanNoteText = fields.content 
      ? fields.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() 
      : ''

    const entry = await db.$transaction(async (tx) => {
      const savedEntry = await JournalService.upsert(user.id, date, fields, tx)

      const template = await ActivityService.getOrCreateDefaultTemplate(
        user.id,
        'JOURNAL',
        'Daily Journal',
        'personal',
        'BookOpen',
        'amber',
        tx
      )

      await ActivityService.logActivity({
        userId: user.id,
        templateId: template.id,
        date,
        status: 'done',
        journalEntryId: savedEntry.id,
        note: cleanNoteText ? (cleanNoteText.substring(0, 100) + '...') : ''
      }, tx)

      return savedEntry
    })

    try {
      revalidatePath('/')
    } catch {}
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
    const user = await requireModuleAccess('journal')
    const numPage = Number(page)
    const numLimit = Number(limit)

    if (isNaN(numPage) || isNaN(numLimit) || !Number.isInteger(numPage) || !Number.isInteger(numLimit) || numPage < 1 || numLimit < 1) {
      return { success: false, error: 'Invalid page or limit parameter. Both must be positive integers.', entries: [], total: 0 }
    }

    if (numPage > 10000) {
      return { success: false, error: 'Requested page exceeds maximum allowed pagination depth of 10000.', entries: [], total: 0 }
    }

    const safeLimit = Math.min(100, numLimit)
    const safePage = numPage
    const skip = (safePage - 1) * safeLimit

    const entries = await db.journalEntry.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
      skip,
      take: safeLimit,
    })
    const total = await db.journalEntry.count({ where: { userId: user.id, deletedAt: null } })

    return { success: true, entries, total, page: safePage, limit: safeLimit }
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
    await requireModuleAccess('journal')
    const { user } = await requireOwnership('journalEntry', id)

    const { JournalService } = await import('@/modules/journal/server')
    const result = await db.$transaction(async (tx) => {
      return JournalService.delete(user.id, id, tx)
    })
    if (!result.success) {
      return { success: false, error: result.error || 'Journal entry not found', code: 'NOT_FOUND' }
    }

    try {
      revalidatePath('/')
    } catch {}
    return { success: true }
  } catch (error) {
    console.error('Failed to delete journal entry:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
