import { NextRequest, NextResponse } from 'next/server'
import { SessionService } from '@/lib/services/SessionService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { StorageService } from '@/lib/services/StorageService'
import { db } from '@/lib/db'
import path from 'path'

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const user = await SessionService.resolveAuthFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      await AuthorizationService.assertUserModuleAccess(user, 'journal')
    } catch {
      return NextResponse.json({ error: 'Access denied to Journal module' }, { status: 403 })
    }

    const { filename } = await params
    // Prevent directory traversal
    const safeFilename = path.basename(filename)
    if (!safeFilename || safeFilename !== filename) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    // ─── Database-backed Ownership Verification ───────────────────────
    const attachment = await db.attachment.findFirst({
      where: {
        userId: user.id,
        fileKey: safeFilename,
      }
    })

    // If attachment record doesn't exist, verify user isn't accessing other user's files
    let fileBuffer: Buffer
    try {
      fileBuffer = await StorageService.readJournalImage(user.id, safeFilename)
    } catch {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const ext = path.extname(safeFilename).toLowerCase()
    const contentType = attachment?.mimeType || MIME_MAP[ext] || 'application/octet-stream'

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[JournalImage] Error reading file:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
