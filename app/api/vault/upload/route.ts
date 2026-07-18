import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import {
  encryptTitle,
  encryptMimeType,
  encryptBuffer,
  VAULT_MAX_FILE_SIZE,
} from '@/lib/vault-crypto'
import { normalizeSearchName, resolveMimeGroup, resolveExtension } from '@/app/actions/vault'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs/promises'

function getVaultDir(userId: string): string {
  return path.join(process.cwd(), 'uploads', 'vault', userId)
}

export async function POST(request: NextRequest) {
  try {
    // ─── Authenticate ─────────────────────────────────────────────────
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    const session = verifySession(token)
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    // ─── Parse multipart form data ────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const parentId = (formData.get('parentId') as string | null) || null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name || file.name.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 })
    }

    // ─── Validate file size ───────────────────────────────────────────
    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty files are not allowed' }, { status: 400 })
    }

    if (file.size > VAULT_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${VAULT_MAX_FILE_SIZE / (1024 * 1024)} MB` },
        { status: 413 }
      )
    }

    // ─── Validate parent folder ownership ─────────────────────────────
    if (parentId) {
      const parent = await db.secureDocument.findFirst({
        where: { id: parentId, userId: session.userId, isFolder: true, deletedAt: null },
        select: { id: true },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
      }
    }

    // ─── Resolve metadata (no decryption needed later for listing) ────
    const mimeType = file.type || 'application/octet-stream'
    const mimeGroup = await resolveMimeGroup(mimeType)
    const extension = await resolveExtension(file.name)
    const searchName = await normalizeSearchName(file.name)

    // ─── Read file buffer & encrypt ───────────────────────────────────
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await file.arrayBuffer()
    } catch (error) {
      console.error('Failed to read file:', error)
      return NextResponse.json({ error: 'Failed to read file data' }, { status: 500 })
    }

    const fileBuffer = Buffer.from(arrayBuffer)

    let encryptedName: string
    let encryptedType: string
    let encryptedBuffer: Buffer
    let iv: string
    let tag: string

    try {
      encryptedName = encryptTitle(file.name)
      encryptedType = encryptMimeType(mimeType)
      const encryptionResult = encryptBuffer(fileBuffer)
      encryptedBuffer = encryptionResult.encryptedBuffer
      iv = encryptionResult.iv
      tag = encryptionResult.tag
    } catch (error) {
      console.error('Encryption failed:', error)
      return NextResponse.json({ error: 'Failed to encrypt file' }, { status: 500 })
    }

    // ─── Write encrypted file to disk ─────────────────────────────────
    const storageKey = randomUUID()
    const vaultDir = getVaultDir(session.userId)
    
    try {
      await fs.mkdir(vaultDir, { recursive: true })
      await fs.writeFile(path.join(vaultDir, `${storageKey}.enc`), encryptedBuffer)
    } catch (error) {
      console.error('Failed to write encrypted file:', error)
      return NextResponse.json({ error: 'Failed to store file' }, { status: 500 })
    }

    // ─── Create database record ───────────────────────────────────────
    let doc
    try {
      doc = await db.secureDocument.create({
        data: {
          userId: session.userId,
          encryptedTitle: encryptedName,
          searchName,
          encryptedType,
          mimeGroup,
          extension,
          storageKey,
          storageProvider: 'local',
          iv,
          tag,
          fileSize: file.size,
          isFolder: false,
          parentId: parentId,
        },
      })
    } catch (error) {
      // Rollback: delete the file we just wrote
      try {
        await fs.unlink(path.join(vaultDir, `${storageKey}.enc`))
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
