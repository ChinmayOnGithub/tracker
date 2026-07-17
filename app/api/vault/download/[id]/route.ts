import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { decryptTitle, decryptMimeType, decryptBuffer } from '@/lib/vault-crypto'
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
    // ─── Authenticate ─────────────────────────────────────────────────
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    const session = verifySession(token)
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params

    // ─── Fetch document and verify ownership ──────────────────────────
    const doc = await db.secureDocument.findFirst({
      where: {
        id,
        userId: session.userId,
        isFolder: false,
        deletedAt: null,
      },
    })

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!doc.fileKey || !doc.iv || !doc.tag) {
      return NextResponse.json({ error: 'Document metadata is incomplete' }, { status: 500 })
    }

    // ─── Read encrypted file from disk ────────────────────────────────
    const vaultDir = getVaultDir(session.userId)
    const filePath = path.join(vaultDir, `${doc.fileKey}.enc`)

    let encryptedBuffer: Buffer
    try {
      encryptedBuffer = await fs.readFile(filePath)
    } catch {
      return NextResponse.json({ error: 'Encrypted file not found on disk' }, { status: 404 })
    }

    // ─── Decrypt ──────────────────────────────────────────────────────
    const decryptedBuffer = decryptBuffer(encryptedBuffer, doc.iv, doc.tag)

    // ─── Decrypt metadata for response headers ────────────────────────
    let fileName = 'download'
    try {
      fileName = decryptTitle(doc.encryptedTitle)
    } catch {
      // fallback
    }

    let mimeType = 'application/octet-stream'
    if (doc.encryptedType) {
      try {
        mimeType = decryptMimeType(doc.encryptedType)
      } catch {
        // fallback
      }
    }

    // ─── Stream response ──────────────────────────────────────────────
    const body = new Uint8Array(decryptedBuffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': body.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Vault download error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Download failed' },
      { status: 500 }
    )
  }
}
