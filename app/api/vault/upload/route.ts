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
    const session = verifySession(token)
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // ─── Parse multipart form data ────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const parentId = formData.get('parentId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // ─── Validate file size ───────────────────────────────────────────
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
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
      }
    }

    // ─── Read file buffer ─────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    // ─── Encrypt everything ───────────────────────────────────────────
    const encryptedName = encryptTitle(file.name)
    const encryptedType = encryptMimeType(file.type || 'application/octet-stream')
    const { encryptedBuffer, iv, tag } = encryptBuffer(fileBuffer)

    // ─── Write encrypted file to disk ─────────────────────────────────
    const fileKey = randomUUID()
    const vaultDir = getVaultDir(session.userId)
    await fs.mkdir(vaultDir, { recursive: true })

    const filePath = path.join(vaultDir, `${fileKey}.enc`)
    await fs.writeFile(filePath, encryptedBuffer)

    // ─── Create database record ───────────────────────────────────────
    const doc = await db.secureDocument.create({
      data: {
        userId: session.userId,
        encryptedTitle: encryptedName,
        encryptedType: encryptedType,
        fileKey,
        iv,
        tag,
        fileSize: file.size,
        isFolder: false,
        parentId: parentId || null,
      },
    })

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
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
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
