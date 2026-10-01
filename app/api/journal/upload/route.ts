import { NextRequest, NextResponse } from 'next/server'
import { SessionService } from '@/lib/services/SessionService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { StorageService } from '@/lib/services/StorageService'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import path from 'path'

const MAX_JOURNAL_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

function getExtension(mimeType: string, originalName: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    case 'image/svg+xml': return 'svg'
    default: {
      const ext = path.extname(originalName).replace('.', '').toLowerCase()
      return ext || 'png'
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await SessionService.resolveAuthFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // ─── Module Authorization & Pro Entitlement Check ──────────────────
    try {
      await AuthorizationService.assertUserModuleAccess(user, 'journal')
    } catch {
      return NextResponse.json({ error: 'Access denied to Journal module' }, { status: 403 })
    }

    const hasAccess = await EntitlementService.hasFeature(user.id, 'advanced_journal')
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: 'Journal image uploads require an active Tracker Pro subscription.',
          code: 'PRO_REQUIRED'
        },
        { status: 403 }
      )
    }

    const { rateLimiter } = await import('@/lib/services/RateLimiter')
    const limit = await rateLimiter.check(`upload:journal:${user.id}`, 20, 60)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Upload rate limit exceeded. Retry in ${limit.retryAfterSeconds} seconds.` },
        { status: 429 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_JOURNAL_IMAGE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_JOURNAL_IMAGE_SIZE / (1024 * 1024)} MB` },
        { status: 413 }
      )
    }

    const mimeType = file.type || 'image/png'
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 })
    }

    const ext = getExtension(mimeType, file.name)
    const fileId = `${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // ─── Persist to Durable Storage ───────────────────────────────────
    await StorageService.saveJournalImage(user.id, fileId, buffer, mimeType)

    // ─── Create Database-backed Ownership Record with Compensating Cleanup (#152) ───
    try {
      await db.attachment.create({
        data: {
          userId: user.id,
          fileName: file.name,
          fileKey: fileId,
          fileSize: file.size,
          mimeType: mimeType,
        }
      })
    } catch (dbErr) {
      try {
        await StorageService.deleteJournalImage(user.id, fileId)
      } catch (delErr) {
        console.warn('[JournalUpload] Failed to clean up orphaned image after DB failure:', delErr)
      }
      throw dbErr
    }

    const url = `/api/journal/image/${fileId}`
    return NextResponse.json({
      success: true,
      url,
      name: file.name,
      size: file.size,
    })
  } catch (err) {
    console.error('[JournalUpload] Error uploading file:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
