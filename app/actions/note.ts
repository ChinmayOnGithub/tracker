"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireOwnership } from '@/lib/auth-guards'
import { todayYMD } from '@/lib/dateUtils'
import { toSafeActionError } from '@/lib/errors'

export interface NoteItem {
  id: string
  title: string | null
  content: string
  date: string
  userId: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
  version?: number
}

export async function createNote(
  content: string = '',
  title?: string | null,
  dateStr?: string
) {
  try {
    const user = await requireAuth()

    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const hasAccess = await EntitlementService.hasFeature(user.id, 'unlimited_notes')
    if (!hasAccess) {
      return {
        success: false,
        error: 'Notes writing requires an active Tracker Pro subscription. Your historical notes remain accessible.',
        code: 'ACCESS_DENIED'
      }
    }

    const finalDate = dateStr || `${todayYMD()}_${Date.now()}`

    const note = await db.note.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: finalDate,
        },
      },
      update: {
        content: content ?? '',
        title: title !== undefined ? (title ? title.trim() : null) : undefined,
        version: { increment: 1 },
      },
      create: {
        date: finalDate,
        content: content ?? '',
        title: title ? title.trim() : null,
        userId: user.id,
        version: 1,
      },
    })

    try {
      revalidatePath('/notes')
      revalidatePath('/')
    } catch {}
    return { success: true, note }
  } catch (error) {
    console.error('Failed to create note:', error)
    const safe = toSafeActionError(error)
    return { success: false, error: safe.message, code: safe.code }
  }
}

export async function updateNote(
  id: string,
  content: string,
  title?: string | null
) {
  try {
    const { user } = await requireOwnership('note', id)

    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const hasAccess = await EntitlementService.hasFeature(user.id, 'unlimited_notes')
    if (!hasAccess) {
      return {
        success: false,
        error: 'Notes writing requires an active Tracker Pro subscription. Your historical notes remain accessible.',
        code: 'ACCESS_DENIED'
      }
    }

    const { count } = await db.note.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: {
        content: content ?? '',
        title: title !== undefined ? (title ? title.trim() : null) : undefined,
        version: { increment: 1 }
      },
    })

    if (count === 0) {
      return { success: false, error: 'Note not found or deleted', code: 'NOT_FOUND' }
    }

    const note = await db.note.findUnique({ where: { id } })

    try {
      revalidatePath('/notes')
      revalidatePath('/')
    } catch {}
    return { success: true, note }
  } catch (error) {
    console.error('Failed to update note:', error)
    const safe = toSafeActionError(error)
    return { success: false, error: safe.message, code: safe.code }
  }
}

export async function restoreNote(id: string) {
  try {
    const { user } = await requireOwnership('note', id)

    const { count } = await db.note.updateMany({
      where: { id, userId: user.id, deletedAt: { not: null } },
      data: {
        deletedAt: null,
        version: { increment: 1 }
      }
    })

    if (count === 0) {
      return { success: false, error: 'Note not found or not deleted', code: 'NOT_FOUND' }
    }

    const note = await db.note.findUnique({ where: { id } })

    try {
      revalidatePath('/notes')
      revalidatePath('/')
    } catch {}
    return { success: true, note }
  } catch (error) {
    console.error('Failed to restore note:', error)
    const safe = toSafeActionError(error)
    return { success: false, error: safe.message, code: safe.code }
  }
}

export async function listNotes() {
  try {
    const user = await requireAuth()

    const notes = await db.note.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })

    return { success: true, notes }
  } catch (error) {
    console.error('Failed to list notes:', error)
    const safe = toSafeActionError(error)
    return { success: false, error: safe.message, code: safe.code, notes: [] }
  }
}

export async function deleteNote(id: string) {
  try {
    const { user } = await requireOwnership('note', id)

    const { count } = await db.note.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 }
      }
    })

    if (count === 0) {
      return { success: false, error: 'Note not found', code: 'NOT_FOUND' }
    }

    try {
      revalidatePath('/notes')
      revalidatePath('/')
    } catch {}
    return { success: true }
  } catch (error) {
    console.error('Failed to delete note:', error)
    const safe = toSafeActionError(error)
    return { success: false, error: safe.message, code: safe.code }
  }
}
