"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireOwnership } from '@/lib/auth-guards'
import { todayYMD } from '@/lib/dateUtils'

export interface NoteItem {
  id: string
  title: string | null
  content: string
  date: string
  userId: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
}

export async function createNote(
  content: string = '',
  title?: string | null,
  dateStr?: string
) {
  try {
    const user = await requireAuth()
    const finalDate = dateStr || `${todayYMD()}_${Date.now()}`

    const note = await db.note.create({
      data: {
        date: finalDate,
        content: content ?? '',
        title: title ? title.trim() : null,
        userId: user.id,
      },
    })

    revalidatePath('/notes')
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
    await requireOwnership('note', id)

    const note = await db.note.update({
      where: { id },
      data: {
        content: content ?? '',
        title: title !== undefined ? (title ? title.trim() : null) : undefined,
      },
    })

    revalidatePath('/notes')
    revalidatePath('/')
    return { success: true, note }
  } catch (error) {
    console.error('Failed to update note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
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
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, notes: [] }
  }
}

export async function deleteNote(id: string) {
  try {
    await requireOwnership('note', id)

    await db.note.update({
      where: { id },
      data: { deletedAt: new Date() }
    })

    revalidatePath('/notes')
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete note:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
