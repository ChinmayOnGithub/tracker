import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs/promises'

const MAX_JOURNAL_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

function getJournalDir(userId: string): string {
  return path.join(process.cwd(), 'uploads', 'journal', userId)
}

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
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const session = verifySession(token)
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
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
    const userDir = getJournalDir(session.userId)
    await fs.mkdir(userDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = path.join(userDir, fileId)
    await fs.writeFile(filePath, buffer)

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
