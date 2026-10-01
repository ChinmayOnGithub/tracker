import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { JournalService } from '@/modules/journal/server'
import { ActivityService } from '@/lib/services/ActivityService'
import { db } from '@/lib/db'
import { todayYMD } from '@/lib/dateUtils'
import { upsertJournalSchema } from '@/lib/validations'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') || todayYMD()

    if (!DATE_REGEX.test(dateStr)) {
      return apiError('VALIDATION_ERROR', 'Date must be formatted as YYYY-MM-DD', 400)
    }

    const entry = await JournalService.getByDate(user.id, dateStr)
    return apiSuccess({ entry })
  } catch (error) {
    console.error('[MobileJournalGet] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve journal entry', 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = upsertJournalSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const { date, ...fields } = parsed.data

    const cleanNoteText = fields.content
      ? fields.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      : ''

    const entry = await db.$transaction(async (tx) => {
      const savedEntry = await JournalService.upsert(user.id, date, fields, tx)

      const template = await ActivityService.getOrCreateDefaultTemplate(
        user.id,
        'JOURNAL',
        'Daily Journal',
        'personal',
        'BookOpen',
        'amber',
        tx
      )

      await ActivityService.logActivity(
        {
          userId: user.id,
          templateId: template.id,
          date,
          status: 'done',
          journalEntryId: savedEntry.id,
          note: cleanNoteText ? cleanNoteText.substring(0, 100) + '...' : '',
        },
        tx
      )

      return savedEntry
    })

    return apiSuccess({ entry }, 200)
  } catch (error) {
    console.error('[MobileJournalPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to save journal entry', 500)
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
      return apiError('VALIDATION_ERROR', 'Journal entry id query parameter is required', 400)
    }

    const result = await JournalService.delete(user.id, id)
    if (!result.success) {
      return apiError('NOT_FOUND', result.error || 'Journal entry not found', 404)
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[MobileJournalDelete] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to delete journal entry', 500)
  }
}
