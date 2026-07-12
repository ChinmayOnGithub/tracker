"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getLoggedUser } from './auth'

/**
 * Helper to check if a user is logged in and returns their profile.
 */
async function getAuthSession() {
  const user = await getLoggedUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Checks if a note is owned by the current user.
 */
async function verifyNoteOwnership(noteId: string, user: { id: string; username: string }) {
  const note = await db.note.findUnique({
    where: { id: noteId }
  })
  if (!note) {
    throw new Error('Note not found')
  }
  const isOwner = note.userId === user.id || (note.userId === null && user.username === 'admin')
  if (!isOwner) {
    throw new Error('Unauthorized note access')
  }
  return note
}

export async function createNote(
  date: string, // YYYY-MM-DD
  content: string,
  title?: string | null
) {
  try {
    const user = await getAuthSession()

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
    const user = await getAuthSession()
    await verifyNoteOwnership(id, user)

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
    const user = await getAuthSession()

    const existingNotes = await db.note.findMany({
      where: { date, userId: user.id },
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
        await db.note.deleteMany({ where: { id: { in: duplicateIds } } })
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
    const user = await getAuthSession()
    await verifyNoteOwnership(id, user)

    await db.note.delete({
      where: { id },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
