import { NextRequest, NextResponse } from 'next/server'
import { SessionService } from '@/lib/services/SessionService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { StorageService } from '@/lib/services/StorageService'
import { db } from '@/lib/db'
import { decryptBuffer, decryptMimeType } from '@/lib/vault-crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const doc = await db.secureDocument.findFirst({
      where: {
        id,
        userId: user.id,
        isFolder: false,
        deletedAt: null,
      },
    })

    if (!doc || !doc.storageKey || !doc.iv || !doc.tag) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    let encryptedBuffer: Buffer
    try {
      encryptedBuffer = await StorageService.readVaultFile(user.id, doc.storageKey)
    } catch {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
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
