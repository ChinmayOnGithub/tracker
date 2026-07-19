"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth-guards'
import {
  encryptTitle,
  decryptTitle,
} from '@/lib/vault-crypto'
import path from 'path'
import fs from 'fs/promises'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 500

function getVaultDir(userId: string): string {
  return path.join(process.cwd(), 'uploads', 'vault', userId)
}

/** Normalize filename into a fast-searchable plaintext token */
export async function normalizeSearchName(filename: string): Promise<string> {
  return filename
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim()
}

/** Derive mimeGroup from MIME type */
export async function resolveMimeGroup(mime: string): Promise<string> {
  if (!mime) return 'OTHER'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'IMAGE'
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'VIDEO'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip') || mime.includes('compress')) return 'ARCHIVE'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'SPREADSHEET'
  if (mime.includes('document') || mime.includes('msword') || mime.startsWith('text/')) return 'TEXT'
  if (mime.includes('javascript') || mime.includes('json') || mime.includes('xml') || mime.includes('html') || mime.includes('css') || mime.includes('typescript') || mime.includes('python') || mime.includes('java')) return 'CODE'
  return 'OTHER'
}

/** Derive file extension from filename */
export async function resolveExtension(filename: string): Promise<string> {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultItem {
  id: string
  name: string           // decrypted display name
  searchName: string     // plaintext search token
  mimeGroup: string | null
  extension: string | null
  fileSize: number | null
  isFolder: boolean
  isFavorite: boolean
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export interface VaultBreadcrumb {
  id: string | null
  name: string
}

export interface VaultCursor {
  id: string
  updatedAt: string
}

// ─── List Items (Cursor Paginated) ────────────────────────────────────────────

export async function listVaultItems(
  parentId: string | null = null,
  cursor?: VaultCursor,
  limit: number = DEFAULT_PAGE_SIZE,
  recursiveFiles: boolean = false
): Promise<{
  success: boolean
  items: VaultItem[]
  nextCursor: VaultCursor | null
  error?: string
}> {
  try {
    const user = await requireAuth()
    const take = Math.min(Math.max(1, limit), MAX_PAGE_SIZE) + 1 // fetch one extra to detect next page

    // Validate parentId if provided
    if (parentId && !recursiveFiles) {
      const parent = await db.secureDocument.findFirst({
        where: { id: parentId, userId: user.id, isFolder: true, deletedAt: null },
        select: { id: true },
      })
      if (!parent) {
        return { success: false, items: [], nextCursor: null, error: 'Parent folder not found' }
      }
    }

    const documents = await db.secureDocument.findMany({
      where: {
        userId: user.id,
        ...(recursiveFiles ? {} : { parentId }),
        deletedAt: null,
        // Cursor-based pagination
        ...(cursor ? {
          OR: [
            { updatedAt: { lt: new Date(cursor.updatedAt) } },
            { updatedAt: new Date(cursor.updatedAt), id: { gt: cursor.id } },
          ]
        } : {}),
      },
      select: {
        id: true,
        encryptedTitle: true,
        searchName: true,
        mimeGroup: true,
        extension: true,
        fileSize: true,
        isFolder: true,
        isFavorite: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { isFolder: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      take,
    })

    const hasMore = documents.length > Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
    const page = hasMore ? documents.slice(0, -1) : documents

    const items: VaultItem[] = page.map((doc) => {
      let name = doc.searchName || 'Unknown'
      try {
        name = decryptTitle(doc.encryptedTitle)
      } catch (error) {
        console.warn(`Failed to decrypt title for document ${doc.id}:`, error)
        name = '⚠ Decryption Failed'
      }

      return {
        id: doc.id,
        name,
        searchName: doc.searchName,
        mimeGroup: doc.mimeGroup,
        extension: doc.extension,
        fileSize: doc.fileSize,
        isFolder: doc.isFolder,
        isFavorite: doc.isFavorite,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }
    })

    const last = page[page.length - 1]
    const nextCursor: VaultCursor | null = hasMore && last
      ? { id: last.id, updatedAt: last.updatedAt.toISOString() }
      : null

    return { success: true, items, nextCursor }
  } catch (error) {
    console.error('List vault items error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load items'
    return { success: false, items: [], nextCursor: null, error: message }
  }
}

// ─── Search (Uses searchName Index, No Decryption) ────────────────────────────

export async function searchVaultItems(
  query: string,
  limit: number = 50
): Promise<{ success: boolean; items: VaultItem[]; error?: string }> {
  try {
    if (!query || typeof query !== 'string') {
      return { success: true, items: [] }
    }

    const user = await requireAuth()
    const normalized = await normalizeSearchName(query)
    if (!normalized) return { success: true, items: [] }

    const validLimit = Math.min(Math.max(1, limit), 200)

    const documents = await db.secureDocument.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        searchName: { contains: normalized },
      },
      select: {
        id: true,
        encryptedTitle: true,
        searchName: true,
        mimeGroup: true,
        extension: true,
        fileSize: true,
        isFolder: true,
        isFavorite: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: validLimit,
    })

    const items: VaultItem[] = documents.map((doc) => {
      let name = doc.searchName
      try { 
        name = decryptTitle(doc.encryptedTitle) 
      } catch (error) {
        console.warn(`Failed to decrypt title for document ${doc.id}:`, error)
        name = doc.searchName || '⚠ Decryption Failed'
      }
      return {
        id: doc.id,
        name,
        searchName: doc.searchName,
        mimeGroup: doc.mimeGroup,
        extension: doc.extension,
        fileSize: doc.fileSize,
        isFolder: doc.isFolder,
        isFavorite: doc.isFavorite,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }
    })

    return { success: true, items }
  } catch (error) {
    console.error('Search vault items error:', error)
    const message = error instanceof Error ? error.message : 'Search failed'
    return { success: false, items: [], error: message }
  }
}

// ─── Create Folder ────────────────────────────────────────────────────────────

export async function createVaultFolder(
  name: string,
  parentId: string | null = null
): Promise<{ success: boolean; item?: VaultItem; error?: string }> {
  try {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Folder name is required')
    }

    if (name.length > 255) {
      throw new Error('Folder name is too long (maximum 255 characters)')
    }

    const user = await requireAuth()

    if (parentId) {
      const parent = await db.secureDocument.findFirst({
        where: { id: parentId, userId: user.id, isFolder: true, deletedAt: null },
        select: { id: true },
      })
      if (!parent) throw new Error('Parent folder not found')
    }

    // Check for duplicate folder name in same location
    const existingFolder = await db.secureDocument.findFirst({
      where: {
        userId: user.id,
        parentId,
        searchName: await normalizeSearchName(name),
        isFolder: true,
        deletedAt: null,
      },
      select: { id: true },
    })

    if (existingFolder) {
      throw new Error('A folder with this name already exists in this location')
    }

    const doc = await db.secureDocument.create({
      data: {
        userId: user.id,
        encryptedTitle: encryptTitle(name),
        searchName: await normalizeSearchName(name),
        isFolder: true,
        parentId,
      },
    })

    revalidatePath('/')
    return {
      success: true,
      item: {
        id: doc.id,
        name,
        searchName: doc.searchName,
        mimeGroup: null,
        extension: null,
        fileSize: null,
        isFolder: true,
        isFavorite: false,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      },
    }
  } catch (error) {
    console.error('Create folder error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create folder'
    return { success: false, error: message }
  }
}

// ─── Rename Item ──────────────────────────────────────────────────────────────

export async function renameVaultItem(
  id: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid document ID')
    }

    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      throw new Error('New name is required')
    }

    if (newName.length > 255) {
      throw new Error('Name is too long (maximum 255 characters)')
    }

    const user = await requireAuth()

    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true, parentId: true, isFolder: true },
    })
    if (!doc) throw new Error('Document not found')

    // Check for duplicate name in same location
    const searchName = await normalizeSearchName(newName)
    const existingItem = await db.secureDocument.findFirst({
      where: {
        userId: user.id,
        parentId: doc.parentId,
        searchName,
        isFolder: doc.isFolder,
        deletedAt: null,
        id: { not: id },
      },
      select: { id: true },
    })

    if (existingItem) {
      throw new Error('An item with this name already exists in this location')
    }

    await db.secureDocument.update({
      where: { id },
      data: {
        encryptedTitle: encryptTitle(newName),
        searchName,
      },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Rename item error:', error)
    const message = error instanceof Error ? error.message : 'Rename failed'
    return { success: false, error: message }
  }
}

// ─── Toggle Favorite ──────────────────────────────────────────────────────────

export async function toggleVaultFavorite(
  id: string,
  isFavorite: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid document ID')
    }

    if (typeof isFavorite !== 'boolean') {
      throw new Error('Invalid favorite status')
    }

    const user = await requireAuth()
    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true },
    })
    if (!doc) throw new Error('Document not found')
    
    await db.secureDocument.update({ 
      where: { id }, 
      data: { isFavorite } 
    })
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Toggle favorite error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update favorite status'
    return { success: false, error: message }
  }
}

// ─── Delete Item ──────────────────────────────────────────────────────────────

export async function deleteVaultItem(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid document ID')
    }

    const user = await requireAuth()

    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true, storageKey: true, isFolder: true },
    })
    if (!doc) throw new Error('Document not found')

    // Collect all items to delete (including descendants)
    const itemsToDelete: Array<{ id: string; storageKey: string | null }> = []

    async function collectItems(docId: string) {
      const item = await db.secureDocument.findUnique({
        where: { id: docId },
        select: { id: true, userId: true, storageKey: true, isFolder: true, deletedAt: true },
      })
      if (!item || item.userId !== user.id || item.deletedAt) return
      
      itemsToDelete.push({ id: item.id, storageKey: item.storageKey })
      
      if (item.isFolder) {
        const children = await db.secureDocument.findMany({
          where: { parentId: docId, deletedAt: null },
          select: { id: true },
        })
        for (const child of children) {
          await collectItems(child.id)
        }
      }
    }

    await collectItems(id)

    if (itemsToDelete.length === 0) {
      throw new Error('No items to delete')
    }

    // Use transaction to ensure database consistency
    const deletedIds = itemsToDelete.map(item => item.id)
    
    await db.$transaction(async (tx) => {
      // Soft-delete all items in a single operation
      await tx.secureDocument.updateMany({
        where: { 
          id: { in: deletedIds },
          userId: user.id 
        },
        data: {
          deletedAt: new Date()
        }
      })
    })

    // Clean up encrypted files from disk (after database transaction succeeds)
    const vaultDir = getVaultDir(user.id)
    const cleanupErrors: string[] = []
    
    for (const item of itemsToDelete) {
      if (item.storageKey) {
        try {
          await fs.unlink(path.join(vaultDir, `${item.storageKey}.enc`))
        } catch (error) {
          // Log but don't fail - file might already be deleted
          cleanupErrors.push(item.storageKey)
          console.warn(`Failed to delete file ${item.storageKey}.enc:`, error)
        }
      }
    }

    revalidatePath('/')
    
    if (cleanupErrors.length > 0) {
      console.error(`Warning: ${cleanupErrors.length} files could not be deleted from disk`)
    }
    
    return { success: true }
  } catch (error) {
    console.error('Delete vault item error:', error)
    const message = error instanceof Error ? error.message : 'Delete failed'
    return { success: false, error: message }
  }
}

// ─── Batch Delete ─────────────────────────────────────────────────────────────

export async function batchDeleteVaultItems(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!ids.length) return { success: true }
  const results = await Promise.all(ids.map(id => deleteVaultItem(id)))
  const failed = results.find(r => !r.success)
  return failed ? { success: false, error: failed.error } : { success: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────



async function fetchBreadcrumbNode(docId: string, userId: string) {
  return db.secureDocument.findFirst({
    where: { id: docId, userId, deletedAt: null },
    select: { id: true, encryptedTitle: true, parentId: true },
  })
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

export async function getVaultBreadcrumbs(
  folderId: string | null
): Promise<{ success: boolean; breadcrumbs: VaultBreadcrumb[]; error?: string }> {
  try {
    const user = await requireAuth()
    const breadcrumbs: VaultBreadcrumb[] = [{ id: null, name: 'Vault' }]
    if (!folderId) return { success: true, breadcrumbs }

    const chain: { id: string; name: string }[] = []
    let currentId: string | null = folderId
    const visitedIds = new Set<string>() // Prevent infinite loops

    while (currentId) {
      if (visitedIds.has(currentId)) {
        console.error('Circular reference detected in folder hierarchy')
        break
      }
      visitedIds.add(currentId)

      const doc = await fetchBreadcrumbNode(currentId, user.id)
      if (!doc) {
        console.warn(`Breadcrumb node not found: ${currentId}`)
        break
      }
      
      let name = 'Folder'
      try { 
        name = decryptTitle(doc.encryptedTitle) 
      } catch (error) {
        console.warn(`Failed to decrypt breadcrumb title for ${doc.id}:`, error)
        name = '⚠ Encrypted Folder'
      }
      
      chain.unshift({ id: doc.id, name })
      currentId = doc.parentId
      
      // Safety limit: max 50 levels deep
      if (chain.length > 50) {
        console.error('Breadcrumb chain exceeded maximum depth')
        break
      }
    }

    breadcrumbs.push(...chain)
    return { success: true, breadcrumbs }
  } catch (error) {
    console.error('Get breadcrumbs error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load breadcrumbs'
    return { success: false, breadcrumbs: [{ id: null, name: 'Vault' }], error: message }
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getVaultStats(): Promise<{
  success: boolean
  stats: { totalFiles: number; totalFolders: number; totalSize: number }
  error?: string
}> {
  try {
    const user = await requireAuth()

    const [fileCount, folderCount, sizeResult] = await Promise.all([
      db.secureDocument.count({ where: { userId: user.id, isFolder: false, deletedAt: null } }),
      db.secureDocument.count({ where: { userId: user.id, isFolder: true, deletedAt: null } }),
      db.secureDocument.aggregate({
        where: { userId: user.id, isFolder: false, deletedAt: null },
        _sum: { fileSize: true },
      }),
    ])

    return {
      success: true,
      stats: {
        totalFiles: fileCount,
        totalFolders: folderCount,
        totalSize: sizeResult._sum.fileSize || 0,
      },
    }
  } catch (error) {
    console.error('Get vault stats error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load statistics'
    return { success: false, stats: { totalFiles: 0, totalFolders: 0, totalSize: 0 }, error: message }
  }
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function listVaultFavorites(): Promise<{ success: boolean; items: VaultItem[]; error?: string }> {
  try {
    const user = await requireAuth()
    const documents = await db.secureDocument.findMany({
      where: { userId: user.id, isFavorite: true, deletedAt: null },
      select: {
        id: true, encryptedTitle: true, searchName: true, mimeGroup: true,
        extension: true, fileSize: true, isFolder: true, isFavorite: true,
        parentId: true, createdAt: true, updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    const items: VaultItem[] = documents.map(doc => {
      let name = doc.searchName
      try { 
        name = decryptTitle(doc.encryptedTitle) 
      } catch (error) {
        console.warn(`Failed to decrypt favorite title for ${doc.id}:`, error)
        name = doc.searchName || '⚠ Decryption Failed'
      }
      return {
        id: doc.id, name, searchName: doc.searchName, mimeGroup: doc.mimeGroup,
        extension: doc.extension, fileSize: doc.fileSize, isFolder: doc.isFolder,
        isFavorite: doc.isFavorite, parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString(),
      }
    })
    return { success: true, items }
  } catch (error) {
    console.error('List favorites error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load favorites'
    return { success: false, items: [], error: message }
  }
}
