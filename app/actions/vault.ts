"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getLoggedUser } from './auth'
import {
  encryptTitle,
  decryptTitle,
  decryptMimeType,
} from '@/lib/vault-crypto'
import path from 'path'
import fs from 'fs/promises'

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function getAuthSession() {
  const user = await getLoggedUser()
  if (!user) throw new Error('Authentication required')
  return user
}

// ─── Vault Upload Directory ───────────────────────────────────────────────────

function getVaultDir(userId: string): string {
  return path.join(process.cwd(), 'uploads', 'vault', userId)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultItem {
  id: string
  name: string        // decrypted
  mimeType: string | null  // decrypted (null for folders)
  fileSize: number | null
  isFolder: boolean
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export interface VaultBreadcrumb {
  id: string | null   // null for root
  name: string
}

// ─── List Items ───────────────────────────────────────────────────────────────

export async function listVaultItems(parentId: string | null = null): Promise<{
  success: boolean
  items: VaultItem[]
  error?: string
}> {
  try {
    const user = await getAuthSession()

    const documents = await db.secureDocument.findMany({
      where: {
        userId: user.id,
        parentId: parentId,
        deletedAt: null,
      },
      orderBy: [
        { isFolder: 'desc' },   // folders first
        { createdAt: 'desc' },
      ],
    })

    const items: VaultItem[] = documents.map((doc) => {
      let name = 'Unknown'
      try {
        name = decryptTitle(doc.encryptedTitle)
      } catch {
        name = '⚠ Encrypted'
      }

      let mimeType: string | null = null
      if (doc.encryptedType) {
        try {
          mimeType = decryptMimeType(doc.encryptedType)
        } catch {
          mimeType = 'application/octet-stream'
        }
      }

      return {
        id: doc.id,
        name,
        mimeType,
        fileSize: doc.fileSize,
        isFolder: doc.isFolder,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }
    })

    return { success: true, items }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, items: [], error: message }
  }
}

// ─── Create Folder ────────────────────────────────────────────────────────────

export async function createVaultFolder(
  name: string,
  parentId: string | null = null
): Promise<{ success: boolean; item?: VaultItem; error?: string }> {
  try {
    const user = await getAuthSession()

    // Validate parent belongs to user if provided
    if (parentId) {
      const parent = await db.secureDocument.findFirst({
        where: { id: parentId, userId: user.id, isFolder: true, deletedAt: null },
      })
      if (!parent) throw new Error('Parent folder not found')
    }

    const encryptedName = encryptTitle(name)

    const doc = await db.secureDocument.create({
      data: {
        userId: user.id,
        encryptedTitle: encryptedName,
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
        mimeType: null,
        fileSize: null,
        isFolder: true,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─── Rename Item ──────────────────────────────────────────────────────────────

export async function renameVaultItem(
  id: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthSession()

    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
    })
    if (!doc) throw new Error('Document not found')

    const encryptedName = encryptTitle(newName)

    await db.secureDocument.update({
      where: { id },
      data: { encryptedTitle: encryptedName },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─── Delete Item ──────────────────────────────────────────────────────────────

export async function deleteVaultItem(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthSession()

    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
    })
    if (!doc) throw new Error('Document not found')

    // Collect all files to delete from disk (this item + all descendants if folder)
    const fileKeysToDelete: string[] = []

    async function collectFileKeys(docId: string) {
      const item = await db.secureDocument.findUnique({ where: { id: docId } })
      if (!item || item.userId !== user.id) return

      if (item.fileKey) {
        fileKeysToDelete.push(item.fileKey)
      }

      if (item.isFolder) {
        const children = await db.secureDocument.findMany({
          where: { parentId: docId, deletedAt: null },
        })
        for (const child of children) {
          await collectFileKeys(child.id)
        }
      }
    }

    await collectFileKeys(id)

    // Soft-delete the item (cascade handled by collecting children above)
    // We'll hard-delete for clean filesystem management
    await db.secureDocument.deleteMany({
      where: {
        id: { in: await collectAllDescendantIds(id, user.id) },
      },
    })
    await db.secureDocument.delete({ where: { id } })

    // Clean up encrypted files from disk
    const vaultDir = getVaultDir(user.id)
    for (const fileKey of fileKeysToDelete) {
      const filePath = path.join(vaultDir, `${fileKey}.enc`)
      try {
        await fs.unlink(filePath)
      } catch {
        // File may already be gone
      }
    }

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// Helper to collect all descendant IDs for deletion
async function collectAllDescendantIds(parentId: string, userId: string): Promise<string[]> {
  const ids: string[] = []
  const children = await db.secureDocument.findMany({
    where: { parentId, userId, deletedAt: null },
    select: { id: true, isFolder: true },
  })
  for (const child of children) {
    ids.push(child.id)
    if (child.isFolder) {
      const nested = await collectAllDescendantIds(child.id, userId)
      ids.push(...nested)
    }
  }
  return ids
}

// Helper to fetch a single document for breadcrumb traversal (avoids circular type inference in loops)
async function fetchBreadcrumbNode(docId: string, userId: string) {
  return db.secureDocument.findFirst({
    where: { id: docId, userId, deletedAt: null },
    select: { id: true, encryptedTitle: true, parentId: true },
  })
}

export async function getVaultBreadcrumbs(
  folderId: string | null
): Promise<{ success: boolean; breadcrumbs: VaultBreadcrumb[]; error?: string }> {
  try {
    const user = await getAuthSession()

    const breadcrumbs: VaultBreadcrumb[] = [{ id: null, name: 'Vault' }]

    if (!folderId) {
      return { success: true, breadcrumbs }
    }

    // Walk up the parent chain
    const chain: { id: string; name: string }[] = []
    let currentId: string | null = folderId

    while (currentId) {
      const doc = await fetchBreadcrumbNode(currentId, user.id)
      if (!doc) break

      let name = 'Unknown'
      try {
        name = decryptTitle(doc.encryptedTitle)
      } catch {
        name = '⚠ Encrypted'
      }

      chain.unshift({ id: doc.id, name })
      currentId = doc.parentId
    }

    breadcrumbs.push(...chain)

    return { success: true, breadcrumbs }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
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
    const user = await getAuthSession()

    const [fileCount, folderCount, sizeResult] = await Promise.all([
      db.secureDocument.count({
        where: { userId: user.id, isFolder: false, deletedAt: null },
      }),
      db.secureDocument.count({
        where: { userId: user.id, isFolder: true, deletedAt: null },
      }),
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
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      stats: { totalFiles: 0, totalFolders: 0, totalSize: 0 },
      error: message,
    }
  }
}
