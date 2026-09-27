import { NextRequest, NextResponse } from 'next/server'
import { SessionService } from '@/lib/services/SessionService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { StorageService } from '@/lib/services/StorageService'
import { db } from '@/lib/db'
import { decryptBuffer, decryptTitle, decryptMimeType } from '@/lib/vault-crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ─── Authenticate & Authorize Module ──────────────────────────────
    const user = await SessionService.resolveAuthFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      await AuthorizationService.assertUserModuleAccess(user, 'documents')
    } catch {
      return NextResponse.json({ error: 'Access denied to Vault module' }, { status: 403 })
    }

    const { id } = await params

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    // ─── Fetch document and verify ownership ──────────────────────────
    const doc = await db.secureDocument.findFirst({
      where: {
        id,
        userId: user.id,
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

    // ─── Read encrypted file from storage ─────────────────────────────
    let encryptedBuffer: Buffer
    try {
      encryptedBuffer = await StorageService.readVaultFile(user.id, doc.storageKey)
    } catch (error) {
      console.error('Failed to read encrypted file:', error)
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
    }

    if (encryptedBuffer.length === 0) {
      return NextResponse.json({ error: 'Encrypted file is empty' }, { status: 500 })
    }

    // ─── Server-side Decryption ───────────────────────────────────────
    let decryptedBuffer: Buffer
    try {
      decryptedBuffer = decryptBuffer(encryptedBuffer, doc.iv, doc.tag)
    } catch (decErr) {
      console.error('Decryption failed for document:', doc.id, decErr)
      return NextResponse.json({ error: 'Failed to decrypt document' }, { status: 500 })
    }

    // Resolve human-readable filename and MIME type
    let fileName = 'document'
    if (doc.encryptedTitle) {
      try {
        fileName = decryptTitle(doc.encryptedTitle)
      } catch {
        fileName = `document_${doc.id}`
      }
    }
    if (doc.extension && !fileName.toLowerCase().endsWith(`.${doc.extension.toLowerCase()}`)) {
      fileName = `${fileName}.${doc.extension}`
    }

    let mimeType = 'application/octet-stream'
    if (doc.encryptedType) {
      try {
        mimeType = decryptMimeType(doc.encryptedType)
      } catch {
        mimeType = 'application/octet-stream'
      }
    }

    // Update access tracking (async, don't wait)
    db.secureDocument.update({
      where: { id: doc.id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    }).catch(err => console.error('Failed to update access tracking:', err))

    // ─── Stream decrypted response to authorized client ───────────────
    const body = new Uint8Array(decryptedBuffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': body.length.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
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
