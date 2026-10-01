import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { db } from '@/lib/db'
import { todayYMD } from '@/lib/dateUtils'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const notes = await db.note.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })

    return apiSuccess({ notes })
  } catch (error) {
    console.error('[MobileNotesGet] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve notes', 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let body: { title?: string | null; content?: string; date?: string }
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const content = body.content ?? ''
    const title = body.title ? body.title.trim() : null
    const finalDate = body.date || `${todayYMD()}_${Date.now()}`

    const note = await db.note.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: finalDate,
        },
      },
      update: {
        content,
        title,
        version: { increment: 1 },
        deletedAt: null,
      },
      create: {
        date: finalDate,
        content,
        title,
        userId: user.id,
        version: 1,
      },
    })

    return apiSuccess({ note }, 201)
  } catch (error) {
    console.error('[MobileNotesPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to create note', 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return apiError('VALIDATION_ERROR', 'Note id parameter is required', 400)
    }

    let body: { title?: string | null; content?: string }
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const { count } = await db.note.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: {
        content: body.content !== undefined ? body.content : undefined,
        title: body.title !== undefined ? (body.title ? body.title.trim() : null) : undefined,
        version: { increment: 1 },
      },
    })

    if (count === 0) {
      return apiError('NOT_FOUND', 'Note not found or deleted', 404)
    }

    const note = await db.note.findUnique({ where: { id } })
    return apiSuccess({ note })
  } catch (error) {
    console.error('[MobileNotesPatch] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to update note', 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return apiError('VALIDATION_ERROR', 'Note id parameter is required', 400)
    }

    const { count } = await db.note.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    })

    if (count === 0) {
      return apiError('NOT_FOUND', 'Note not found', 404)
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[MobileNotesDelete] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to delete note', 500)
  }
}
