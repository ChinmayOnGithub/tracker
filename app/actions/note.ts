"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createNote(
  date: string, // YYYY-MM-DD
  content: string,
  title?: string | null
) {
  try {
    const note = await db.note.create({
      data: {
        date,
        content,
        title: title ?? null,
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

export async function deleteNote(id: string) {
  try {
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
