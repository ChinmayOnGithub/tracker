import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'

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

    if (!doc.storageKey) {
      return NextResponse.json({ error: 'Document has no storage reference' }, { status: 500 })
    }

    if (!doc.iv || !doc.tag) {
      return NextResponse.json({ error: 'Document encryption metadata is missing' }, { status: 500 })
    }

    // ─── Read encrypted file from disk ────────────────────────────────
    const vaultDir = getVaultDir(session.userId)
    const filePath = path.join(vaultDir, `${doc.storageKey}.enc`)

    let encryptedBuffer: Buffer
    try {
      encryptedBuffer = await fs.readFile(filePath)
    } catch (error) {
      console.error('Failed to read encrypted file:', error)
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }

    if (encryptedBuffer.length === 0) {
      return NextResponse.json({ error: 'Encrypted file is empty' }, { status: 500 })
    }

    // Update access tracking (async, don't wait)
    db.secureDocument.update({
      where: { id: doc.id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    }).catch(err => console.error('Failed to update access tracking:', err))

    // ─── Stream raw encrypted response ────────────────────────────────────────
    const body = new Uint8Array(encryptedBuffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'x-iv-hex': doc.iv || '',
        'x-tag-hex': doc.tag || '',
        'x-filename-enc': doc.encryptedTitle || '',
        'x-mimetype-enc': doc.encryptedType || '',
      },
    })
  } catch (error) {
    console.error('Vault download error:', error)
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    )
  }
}
