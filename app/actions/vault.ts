"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth-guards'
import {
  encryptTitle,
  decryptTitle,
  maskValue,
  getVaultKeyHex
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

export interface VaultItemMetadata {
  category?: string
  [key: string]: unknown
}

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
  metadata?: VaultItemMetadata
}

export interface VaultBreadcrumb {
  id: string | null
  name: string
}

export interface VaultCursor {
  id: string
  updatedAt: string
}export interface VaultSettingsConfig {
  fields?: Record<string, {
    category: string
    label: string
    encryptedValue: string
    updatedAt: string
  }>
  quickActions?: string[]
  pinnedDocuments?: string[]
  signatureDocId?: string | null
  photoDocId?: string | null
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
        metadata: true,
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
        metadata: (doc.metadata as unknown as VaultItemMetadata) || undefined,
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
        metadata: true,
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
        metadata: (doc.metadata as unknown as VaultItemMetadata) || undefined,
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
  const results = []
  for (const id of ids) {
    results.push(await deleteVaultItem(id))
  }
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

    const fileCount = await db.secureDocument.count({ where: { userId: user.id, isFolder: false, deletedAt: null } })
    const folderCount = await db.secureDocument.count({ where: { userId: user.id, isFolder: true, deletedAt: null } })
    const sizeResult = await db.secureDocument.aggregate({
      where: { userId: user.id, isFolder: false, deletedAt: null },
      _sum: { fileSize: true },
    })

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
        parentId: true, createdAt: true, updatedAt: true, metadata: true,
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
        metadata: (doc.metadata as unknown as VaultItemMetadata) || undefined,
      }
    })
    return { success: true, items }
  } catch (error) {
    console.error('List favorites error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load favorites'
    return { success: false, items: [], error: message }
  }
}

export interface QuickInfoFieldDTO {
  id: string
  category: string
  label: string
  maskedValue: string
  hasValue: boolean
  updatedAt: string
  documentId?: string | null
}

export interface VaultDashboardData {
  success: boolean
  quickInfoFields: QuickInfoFieldDTO[]
  quickActions: string[]
  pinnedDocuments: VaultItem[]
  signatureDocId: string | null
  photoDocId: string | null
  error?: string
}

const VAULT_SETTINGS_MODULE = 'VAULT_SETTINGS'

export async function getVaultDashboardData(): Promise<VaultDashboardData> {
  try {
    const user = await requireAuth()
    
    // Find or create VAULT_SETTINGS in UserSetting
    let setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    if (!setting) {
      setting = await db.userSetting.create({
        data: {
          userId: user.id,
          module: VAULT_SETTINGS_MODULE,
          config: {
            fields: {},
            quickActions: ['identity_aadhaar', 'identity_pan', 'banking_account_number', 'banking_ifsc', 'signature', 'photo'],
            pinnedDocuments: [],
            signatureDocId: null,
            photoDocId: null
          }
        }
      })
    }
    
    const config = (setting.config as unknown as VaultSettingsConfig) || {}
    const fieldsConfig = config.fields || {}
    const quickActions = config.quickActions || []
    const pinnedDocIds = config.pinnedDocuments || []
    const signatureDocId = config.signatureDocId || null
    const photoDocId = config.photoDocId || null
    
    // Fetch all user documents to check associations for Quick Access
    const allDocs = await db.secureDocument.findMany({
      where: { userId: user.id, deletedAt: null, isFolder: false },
      select: { id: true, searchName: true, metadata: true, encryptedTitle: true }
    })

    const docList = allDocs.map(d => {
      let name = d.searchName
      try {
        name = decryptTitle(d.encryptedTitle).toLowerCase()
      } catch {}
      const meta = (d.metadata as unknown as VaultItemMetadata) || {}
      return { id: d.id, name, meta }
    })

    const findDocId = (fieldId: string) => {
      const explicit = docList.find(d => d.meta.associateWithInfoField === fieldId)
      if (explicit) return explicit.id

      if (fieldId === 'identity_aadhaar') {
        const found = docList.find(d => d.name.includes('aadhaar') || (d.meta.category === 'Identity' && d.name.includes('adhaar')))
        if (found) return found.id
      }
      if (fieldId === 'identity_pan') {
        const found = docList.find(d => d.name.includes('pan') && !d.name.includes('pant') && !d.name.includes('company'))
        if (found) return found.id
      }
      if (fieldId === 'banking_account_number') {
        const found = docList.find(d => d.name.includes('bank') || d.name.includes('passbook') || d.name.includes('statement') || d.name.includes('account'))
        if (found) return found.id
      }
      return null
    }

    // Build quick info fields
    const quickInfoFields: QuickInfoFieldDTO[] = []
    
    // Default metadata of fields
    const defaultFields = [
      { id: 'identity_aadhaar', category: 'IDENTITY', label: 'Aadhaar number' },
      { id: 'identity_pan', category: 'IDENTITY', label: 'PAN number' },
      { id: 'identity_passport', category: 'IDENTITY', label: 'Passport number' },
      { id: 'identity_dl', category: 'IDENTITY', label: 'Driving licence number' },
      { id: 'identity_voter', category: 'IDENTITY', label: 'Voter ID' },
      { id: 'identity_other', category: 'IDENTITY', label: 'Other identity number' },
      
      { id: 'banking_bank_name', category: 'BANKING', label: 'Bank name' },
      { id: 'banking_holder_name', category: 'BANKING', label: 'Account holder name' },
      { id: 'banking_account_number', category: 'BANKING', label: 'Account number' },
      { id: 'banking_ifsc', category: 'BANKING', label: 'IFSC' },
      { id: 'banking_branch', category: 'BANKING', label: 'Branch' },
      { id: 'banking_account_type', category: 'BANKING', label: 'Account type' },
      { id: 'banking_upi_id', category: 'BANKING', label: 'UPI ID' },
      
      { id: 'personal_full_name', category: 'PERSONAL', label: 'Full name' },
      { id: 'personal_dob', category: 'PERSONAL', label: 'Date of birth' },
      { id: 'personal_phone', category: 'PERSONAL', label: 'Phone number' },
      { id: 'personal_email', category: 'PERSONAL', label: 'Email' },
      { id: 'personal_address', category: 'PERSONAL', label: 'Address' }
    ]
    
    // Map existing fields and add defaults if missing
    const allFieldIds = new Set([
      ...defaultFields.map(f => f.id),
      ...Object.keys(fieldsConfig)
    ])
    
    for (const fId of allFieldIds) {
      const dbField = fieldsConfig[fId]
      const defaultField = defaultFields.find(df => df.id === fId)
      
      const category = dbField?.category || defaultField?.category || 'OTHER'
      const label = dbField?.label || defaultField?.label || fId
      const encryptedValue = dbField?.encryptedValue || null
      const updatedAt = dbField?.updatedAt || setting.updatedAt.toISOString()
      
      let maskedValue = ''
      let hasValue = false
      if (encryptedValue) {
        try {
          const raw = decryptTitle(encryptedValue)
          maskedValue = maskValue(fId, raw)
          hasValue = !!raw.trim()
        } catch {
          maskedValue = '⚠ Decryption error'
        }
      }
      
      quickInfoFields.push({
        id: fId,
        category,
        label,
        maskedValue,
        hasValue,
        updatedAt,
        documentId: findDocId(fId)
      })
    }
    
    // Fetch pinned documents
    const pinnedDocuments: VaultItem[] = []
    if (pinnedDocIds.length > 0) {
      const documents = await db.secureDocument.findMany({
        where: {
          id: { in: pinnedDocIds },
          userId: user.id,
          deletedAt: null
        },
        select: {
          id: true, encryptedTitle: true, searchName: true, mimeGroup: true,
          extension: true, fileSize: true, isFolder: true, isFavorite: true,
          parentId: true, createdAt: true, updatedAt: true
        }
      })
      
      // Preserve client side order
      const docMap = new Map(documents.map(d => [d.id, d]))
      pinnedDocIds.forEach((id: string) => {
        const doc = docMap.get(id)
        if (doc) {
          let name = doc.searchName
          try {
            name = decryptTitle(doc.encryptedTitle)
          } catch {
            name = '⚠ Decryption Failed'
          }
          pinnedDocuments.push({
            id: doc.id, name, searchName: doc.searchName, mimeGroup: doc.mimeGroup,
            extension: doc.extension, fileSize: doc.fileSize, isFolder: doc.isFolder,
            isFavorite: doc.isFavorite, parentId: doc.parentId,
            createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString()
          })
        }
      })
    }
    
    return {
      success: true,
      quickInfoFields,
      quickActions,
      pinnedDocuments,
      signatureDocId,
      photoDocId
    }
  } catch (error) {
    console.error('getVaultDashboardData error:', error)
    return {
      success: false,
      quickInfoFields: [],
      quickActions: [],
      pinnedDocuments: [],
      signatureDocId: null,
      photoDocId: null,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data'
    }
  }
}

export async function getVaultSecretValue(
  id: string,
  actionType: 'copy' | 'reveal'
): Promise<{ success: boolean; value?: string; error?: string }> {
  try {
    const user = await requireAuth()
    
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    if (!setting) throw new Error('Vault settings not found')
    const config = (setting.config as unknown as VaultSettingsConfig) || {}
    const fields = config.fields || {}
    const field = fields[id]
    
    if (!field || !field.encryptedValue) {
      return { success: false, error: 'Value not set' }
    }
    
    let decrypted = ''
    try {
      decrypted = decryptTitle(field.encryptedValue)
    } catch {
      return { success: false, error: 'Decryption failed' }
    }
    
    // Log audit log (User security rule)
    await db.auditLog.create({
      data: {
        userId: user.id,
        entityType: 'VAULT_SECRET',
        entityId: id,
        action: actionType === 'copy' ? 'VAULT_SECRET_COPIED' : 'VAULT_SECRET_REVEALED',
        performedBy: user.username
      }
    })
    
    return { success: true, value: decrypted }
  } catch (error) {
    console.error('getVaultSecretValue error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load secret' }
  }
}

export async function saveVaultQuickInfoField(
  id: string,
  category: string,
  label: string,
  rawValue: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    const config = setting ? (setting.config as unknown as VaultSettingsConfig) : { fields: {}, quickActions: [], pinnedDocuments: [] }
    const fields = config.fields || {}
    
    const encryptedValue = encryptTitle(rawValue)
    
    fields[id] = {
      category,
      label,
      encryptedValue,
      updatedAt: new Date().toISOString()
    }
    
    config.fields = fields
    
    await db.userSetting.upsert({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } },
      create: { userId: user.id, module: VAULT_SETTINGS_MODULE, config },
      update: { config }
    })
    
    // Log audit
    await db.auditLog.create({
      data: {
        userId: user.id,
        entityType: 'VAULT_SECRET',
        entityId: id,
        action: 'VAULT_SECRET_UPDATED',
        performedBy: user.username
      }
    })
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('saveVaultQuickInfoField error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save value' }
  }
}

export async function deleteVaultQuickInfoField(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    if (!setting) throw new Error('Settings not found')
    
    const config = (setting.config as unknown as VaultSettingsConfig) || {}
    const fields = config.fields || {}
    
    if (fields[id]) {
      delete fields[id]
      config.fields = fields
      
      await db.userSetting.update({
        where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } },
        data: { config }
      })
      
      // Log audit
      await db.auditLog.create({
        data: {
          userId: user.id,
          entityType: 'VAULT_SECRET',
          entityId: id,
          action: 'VAULT_SECRET_DELETED',
          performedBy: user.username
        }
      })
    }
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('deleteVaultQuickInfoField error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete custom field' }
  }
}

export async function saveVaultQuickActions(
  actions: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    if (!setting) throw new Error('Settings not found')
    const config = (setting.config as unknown as VaultSettingsConfig) || {}
    config.quickActions = actions
    
    await db.userSetting.update({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } },
      data: { config }
    })
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('saveVaultQuickActions error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save actions order' }
  }
}

export async function toggleVaultPin(
  documentId: string,
  pin: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    const config = setting ? (setting.config as unknown as VaultSettingsConfig) : { fields: {}, quickActions: [], pinnedDocuments: [] }
    let pinned = config.pinnedDocuments || []
    
    if (pin) {
      if (!pinned.includes(documentId)) {
        pinned.push(documentId)
      }
    } else {
      pinned = pinned.filter((id: string) => id !== documentId)
    }
    
    config.pinnedDocuments = pinned
    
    await db.userSetting.upsert({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } },
      create: { userId: user.id, module: VAULT_SETTINGS_MODULE, config },
      update: { config }
    })
    
    // Log audit
    await db.auditLog.create({
      data: {
        userId: user.id,
        entityType: 'VAULT_DOCUMENT',
        entityId: documentId,
        action: pin ? 'VAULT_DOCUMENT_PINNED' : 'VAULT_DOCUMENT_UNPINNED',
        performedBy: user.username
      }
    })
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('toggleVaultPin error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to pin/unpin document' }
  }
}

export async function setVaultSpecialAsset(
  type: 'signature' | 'photo',
  docId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } }
    })
    
    const config = setting ? (setting.config as unknown as VaultSettingsConfig) : { fields: {}, quickActions: [], pinnedDocuments: [] }
    
    const fieldKey = type === 'signature' ? 'signatureDocId' : 'photoDocId'
    const oldId = config[fieldKey]
    
    // Update config
    config[fieldKey] = docId
    
    await db.userSetting.upsert({
      where: { userId_module: { userId: user.id, module: VAULT_SETTINGS_MODULE } },
      create: { userId: user.id, module: VAULT_SETTINGS_MODULE, config },
      update: { config }
    })
    
    // Delete old doc if replacement occurred
    if (oldId && oldId !== docId) {
      await deleteVaultItem(oldId)
    }
    
    // Log audit
    await db.auditLog.create({
      data: {
        userId: user.id,
        entityType: 'VAULT_ASSET',
        entityId: docId || 'none',
        action: `VAULT_${type.toUpperCase()}_UPDATED`,
        performedBy: user.username
      }
    })
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('setVaultSpecialAsset error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update asset link' }
  }
}

export async function logVaultAuditAction(
  action: string,
  entityId: string,
  entityType: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    await db.auditLog.create({
      data: {
        userId: user.id,
        action,
        entityId,
        entityType,
        performedBy: user.username || 'user'
      }
    })
    return { success: true }
  } catch (error) {
    console.error('logVaultAuditAction error:', error)
    return { success: false, error: 'Audit logging failed' }
  }
}

export async function updateVaultItemCategory(
  id: string,
  category: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth()
    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null }
    })
    if (!doc) throw new Error('Document not found')
    
    const existingMeta = (doc.metadata as unknown as Record<string, string>) || {}
    const updatedMeta = { ...existingMeta, category }
    
    await db.secureDocument.update({
      where: { id },
      data: { metadata: updatedMeta }
    })
    
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Update item category error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Update failed' }
  }
}

export async function getVaultKeyAction(): Promise<{ success: boolean; key?: string; error?: string }> {
  try {
    await requireAuth()
    return { success: true, key: getVaultKeyHex() }
  } catch (error) {
    console.error('getVaultKeyAction error:', error)
    return { success: false, error: 'Failed to retrieve vault key' }
  }
}


