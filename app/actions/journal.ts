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
    const entry = await JournalService.upsert(user.id, date, fields)
    console.log(`[Journal] Entry upserted successfully: ${entry.id}, content length: ${entry.content.length}`)

    // Verify the save by reading it back
    const verification = await db.journalEntry.findUnique({
      where: { id: entry.id },
      select: { id: true, content: true, updatedAt: true }
    })
    console.log(`[Journal] Verification read from DB:`, {
      id: verification?.id,
      contentLength: verification?.content.length,
      updatedAt: verification?.updatedAt
    })

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

    try {
      await ActivityService.logActivity({
        userId: user.id,
        templateId: template.id,
        date,
        status: 'done',
        journalEntryId: entry.id,
        note: cleanNoteText ? (cleanNoteText.substring(0, 100) + '...') : ''
      })
    } catch (activityError) {
      // Log the error but don't fail the journal save
      console.error('Failed to log activity for journal entry:', activityError)
    }

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
    const skip = (page - 1) * limit

    const entries = await db.journalEntry.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
      skip,
      take: limit,
    })
    const total = await db.journalEntry.count({ where: { userId: user.id, deletedAt: null } })

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
    await requireModuleAccess('journal')
    const { user } = await requireOwnership('journalEntry', id)

    const { JournalService } = await import('@/modules/journal/server')
    const result = await JournalService.delete(user.id, id)
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
