import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { decryptBuffer, decryptMimeType } from '@/lib/vault-crypto'
import path from 'path'
import fs from 'fs/promises'

function getVaultDir(userId: string): string {
  return path.join(process.cwd(), 'uploads', 'vault', userId)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const session = verifySession(token)
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    const doc = await db.secureDocument.findFirst({
      where: {
        id,
        userId: session.userId,
        isFolder: false,
        deletedAt: null,
      },
    })

    if (!doc || !doc.storageKey || !doc.iv || !doc.tag) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const vaultDir = getVaultDir(session.userId)
    const filePath = path.join(vaultDir, `${doc.storageKey}.enc`)

    let encryptedBuffer: Buffer
    try {
      encryptedBuffer = await fs.readFile(filePath)
    } catch {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }

    let decryptedBuffer: Buffer
    try {
      decryptedBuffer = decryptBuffer(encryptedBuffer, doc.iv, doc.tag)
    } catch {
      return NextResponse.json({ error: 'Decryption failed' }, { status: 500 })
    }

    let contentType = 'application/octet-stream'
    if (doc.encryptedType) {
      try {
        contentType = decryptMimeType(doc.encryptedType)
      } catch {
        contentType = doc.extension === 'png' ? 'image/png' : doc.extension === 'jpg' || doc.extension === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'
      }
    }

    const body = new Uint8Array(decryptedBuffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Vault preview error:', error)
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 })
  }
}
