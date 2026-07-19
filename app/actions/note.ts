"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireOwnership } from '@/lib/auth-guards'

export async function createNote(
  date: string, // YYYY-MM-DD
  content: string,
  title?: string | null
) {
  try {
    const user = await requireAuth()

    const note = await db.note.create({
      data: {
        date,
        content,
        title: title ?? null,
        userId: user.id,
      },
    })

    revalidatePath('/')
    return { success: true, note }
  } catch (error) {
    console.error('Failed to create note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateNote(
  id: string,
  content: string,
  title?: string | null
) {
  try {
    const { user } = await requireOwnership('note', id)

    const note = await db.note.update({
      where: { id },
      data: {
        content,
        title: title ?? null,
      },
    })

    revalidatePath('/')
    return { success: true, note }
  } catch (error) {
    console.error('Failed to update note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Atomically upsert (create or update) the note for a given date.
 * Also heals any duplicate records created by concurrent client calls.
 */
export async function upsertNote(
  date: string, // YYYY-MM-DD
  content: string,
  title?: string | null
) {
  try {
    const user = await requireAuth()

    const existingNotes = await db.note.findMany({
      where: { date, userId: user.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })

    let note
    if (existingNotes.length > 0) {
      // Update the primary record
      note = await db.note.update({
        where: { id: existingNotes[0].id },
        data: { content, title: title ?? existingNotes[0].title },
      })
      // Delete any duplicates created by concurrent saves
      if (existingNotes.length > 1) {
        const duplicateIds = existingNotes.slice(1).map(n => n.id)
        await db.note.updateMany({
          where: { id: { in: duplicateIds } },
          data: { deletedAt: new Date() }
        })
      }
    } else {
      note = await db.note.create({
        data: { date, content, title: title ?? null, userId: user.id },
      })
    }

    revalidatePath('/')
    return { success: true, note }
  } catch (error) {
    console.error('Failed to upsert note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteNote(id: string) {
  try {
    const { user } = await requireOwnership('note', id)

    await db.note.update({
      where: { id },
      data: { deletedAt: new Date() }
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
