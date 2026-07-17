"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getLoggedUser } from './auth'

async function getAuthSession() {
  const user = await getLoggedUser()
  if (!user) throw new Error('Authentication required')
  return user
}

// ─── Collections ─────────────────────────────────────────────────────────────

export async function listLinkCollections() {
  try {
    const user = await getAuthSession()
    const collections = await db.linkCollection.findMany({
      where: { userId: user.id, deletedAt: null },
      include: {
        links: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return { success: true, collections }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, collections: [] }
  }
}

export async function createLinkCollection(name: string, color?: string) {
  try {
    const user = await getAuthSession()
    const count = await db.linkCollection.count({ where: { userId: user.id, deletedAt: null } })
    const collection = await db.linkCollection.create({
      data: { userId: user.id, name, color: color ?? '#6366f1', sortOrder: count },
    })
    revalidatePath('/')
    return { success: true, collection }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateLinkCollection(id: string, data: { name?: string; color?: string }) {
  try {
    const user = await getAuthSession()
    const collection = await db.linkCollection.findUnique({ where: { id } })
    if (!collection || collection.userId !== user.id) throw new Error('Unauthorized')
    const updated = await db.linkCollection.update({ where: { id }, data })
    revalidatePath('/')
    return { success: true, collection: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteLinkCollection(id: string) {
  try {
    const user = await getAuthSession()
    const collection = await db.linkCollection.findUnique({ where: { id } })
    if (!collection || collection.userId !== user.id) throw new Error('Unauthorized')
    await db.linkCollection.update({ where: { id }, data: { deletedAt: new Date() } })
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─── Links ────────────────────────────────────────────────────────────────────

export async function createLink(
  collectionId: string,
  data: {
    url: string
    title?: string
    description?: string | null
    favicon?: string | null
    thumbnail?: string | null
  }
) {
  try {
    const user = await getAuthSession()
    const collection = await db.linkCollection.findUnique({ where: { id: collectionId } })
    if (!collection || collection.userId !== user.id) throw new Error('Unauthorized')
    const count = await db.savedLink.count({ where: { collectionId, deletedAt: null } })
    const link = await db.savedLink.create({
      data: {
        collectionId,
        url: data.url,
        title: data.title ?? '',
        description: data.description ?? null,
        favicon: data.favicon ?? null,
        thumbnail: data.thumbnail ?? null,
        sortOrder: count,
      },
    })
    revalidatePath('/')
    return { success: true, link }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateLink(
  id: string,
  data: {
    title?: string
    description?: string | null
    url?: string
    favicon?: string | null
    thumbnail?: string | null
    collectionId?: string
  }
) {
  try {
    const user = await getAuthSession()
    const link = await db.savedLink.findUnique({
      where: { id },
      include: { collection: true },
    })
    if (!link || link.collection.userId !== user.id) throw new Error('Unauthorized')
    const updated = await db.savedLink.update({ where: { id }, data })
    revalidatePath('/')
    return { success: true, link: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteLink(id: string) {
  try {
    const user = await getAuthSession()
    const link = await db.savedLink.findUnique({
      where: { id },
      include: { collection: true },
    })
    if (!link || link.collection.userId !== user.id) throw new Error('Unauthorized')
    await db.savedLink.update({ where: { id }, data: { deletedAt: new Date() } })
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
