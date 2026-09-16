import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import path from 'path'
import fs from 'fs/promises'

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

function getJournalDir(userId: string): string {
  return path.join(process.cwd(), 'uploads', 'journal', userId)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
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

    const { filename } = await params
    // Prevent directory traversal
    const safeFilename = path.basename(filename)
    if (!safeFilename || safeFilename !== filename) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const userDir = getJournalDir(session.userId)
    const filePath = path.join(userDir, safeFilename)

    let fileBuffer: Buffer
    try {
      fileBuffer = await fs.readFile(filePath)
    } catch {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const ext = path.extname(safeFilename).toLowerCase()
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (err) {
    console.error('[JournalImage] Error reading file:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
