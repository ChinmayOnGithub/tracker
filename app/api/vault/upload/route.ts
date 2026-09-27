import { NextRequest, NextResponse } from 'next/server'
import { SessionService } from '@/lib/services/SessionService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { StorageService } from '@/lib/services/StorageService'
import { db } from '@/lib/db'
import {
  encryptTitle,
  encryptMimeType,
  encryptBuffer,
  VAULT_MAX_FILE_SIZE,
} from '@/lib/vault-crypto'
import { normalizeSearchName, resolveMimeGroup, resolveExtension } from '@/app/actions/vault'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // ─── Authenticate & Authorize Module Access ───────────────────────
    const user = await SessionService.resolveAuthFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      await AuthorizationService.assertUserModuleAccess(user, 'documents')
    } catch {
      return NextResponse.json({ error: 'Access denied to Vault module' }, { status: 403 })
    }

    // ─── Parse multipart form data ────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const parentId = (formData.get('parentId') as string | null) || null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // ─── Enforce Server-Authoritative Vault Storage Capacity ─────────
    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const currentFileCount = await db.secureDocument.count({
      where: { userId: user.id, isFolder: false, deletedAt: null }
    })
    const capacity = await EntitlementService.checkVaultCapacity(user.id, currentFileCount)
    if (!capacity.allowed) {
      return NextResponse.json(
        {
          error: `Vault storage limit reached (${capacity.maxFiles} files on Free plan). Upgrade to Tracker Pro for unlimited storage.`,
          code: 'VAULT_LIMIT_EXCEEDED'
        },
        { status: 403 }
      )
    }

    const category = (formData.get('category') as string | null) || 'Other'
    const educationLevel = formData.get('educationLevel') as string | null
    const careerSub = formData.get('careerSub') as string | null
    const financialSub = formData.get('financialSub') as string | null
    const documentType = formData.get('documentType') as string | null
    const associateWithInfoField = formData.get('associateWithInfoField') as string | null

    const metadata: Record<string, string> = { category }
    if (educationLevel) metadata.educationLevel = educationLevel
    if (careerSub) metadata.careerSub = careerSub
    if (financialSub) metadata.financialSub = financialSub
    if (documentType) metadata.documentType = documentType
    if (associateWithInfoField) metadata.associateWithInfoField = associateWithInfoField

    // ─── Validate file ────────────────────────────────────────────────
    if (file.size > VAULT_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${VAULT_MAX_FILE_SIZE / (1024 * 1024)} MB` },
        { status: 413 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    // ─── Validate parent folder if specified ──────────────────────────
    if (parentId) {
      const parent = await db.secureDocument.findFirst({
        where: {
          id: parentId,
          userId: user.id,
          isFolder: true,
          deletedAt: null,
        },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
      }
    }

    // ─── Read file buffer ─────────────────────────────────────────────
    const rawBuffer = Buffer.from(await file.arrayBuffer())

    // ─── Encrypt file buffer with AES-256-GCM ──────────────────────────
    const { encryptedBuffer, iv, tag } = encryptBuffer(rawBuffer)

    // ─── Encrypt filename and MIME type ───────────────────────────────
    const encryptedName = encryptTitle(file.name)
    const encryptedType = encryptMimeType(file.type || 'application/octet-stream')

    // ─── Derive search token and file metadata ────────────────────────
    const searchName = await normalizeSearchName(file.name)
    const extension = await resolveExtension(file.name)
    const mimeGroup = await resolveMimeGroup(file.type || '')

    // ─── Save file to storage ─────────────────────────────────────────
    const storageKey = randomUUID()
    try {
      await StorageService.saveVaultFile(user.id, storageKey, encryptedBuffer)
    } catch (error) {
      console.error('Failed to write encrypted file to storage:', error)
      return NextResponse.json({ error: 'Failed to store file' }, { status: 500 })
    }

    // ─── Create database records transactionally ──────────────────────
    let doc
    try {
      doc = await db.secureDocument.create({
        data: {
          userId: user.id,
          encryptedTitle: encryptedName,
          searchName,
          encryptedType,
          mimeGroup,
          extension,
          storageKey,
          storageProvider: 'storage_service',
          iv,
          tag,
          fileSize: file.size,
          isFolder: false,
          parentId: parentId,
          metadata: metadata,
        },
      })

      // Database-backed attachment record
      await db.attachment.create({
        data: {
          userId: user.id,
          fileName: file.name,
          fileKey: storageKey,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          documentId: doc.id,
        },
      }).catch(attErr => console.warn('Attachment creation warning:', attErr))

    } catch (error) {
      // Rollback: delete the stored file
      try {
        await StorageService.deleteVaultFile(user.id, storageKey)
      } catch {
        // Silent fail on cleanup
      }
      console.error('Failed to create database record:', error)
      return NextResponse.json({ error: 'Failed to save file metadata' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        name: file.name,
        mimeGroup,
        extension,
        fileSize: file.size,
        isFolder: false,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        metadata: doc.metadata,
      },
    })
  } catch (error) {
    console.error('Vault upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    )
  }
}
