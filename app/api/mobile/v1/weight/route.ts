import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { db } from '@/lib/db'
import { logWeight, deleteWeightRecord } from '@/app/actions/weight'
import { z } from 'zod'

const logWeightInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  weight: z.number().min(20).max(500),
  notes: z.string().max(500).optional().nullable(),
  consentToCreateActivity: z.boolean().optional(),
})

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const rawDays = searchParams.get('days') || '30'
    const days = parseInt(rawDays, 10)
    if (isNaN(days) || days <= 0 || days > 730) {
      return apiError('VALIDATION_ERROR', 'Days must be an integer between 1 and 730', 400)
    }
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    since.setUTCDate(since.getUTCDate() - days)

    const records = await db.weightRecord.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    })

    return apiSuccess({ records })
  } catch (error) {
    console.error('[MobileWeight GET] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve weight records', 500)
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

    const parsed = logWeightInputSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
        400
      )
    }

    const { date, weight, notes, consentToCreateActivity } = parsed.data
    const result = await logWeight(date, weight, notes, { consentToCreateActivity })

    if (!result.success || !('record' in result)) {
      return apiError(
        'VALIDATION_ERROR',
        result.error || 'Failed to log weight',
        400,
        result as Record<string, unknown>
      )
    }

    return apiSuccess({ record: result.record })
  } catch (error) {
    console.error('[MobileWeight POST] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to log weight'
    return apiError('INTERNAL_ERROR', message, 500)
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
      return apiError('VALIDATION_ERROR', 'Weight record ID is required', 400)
    }

    const result = await deleteWeightRecord(id)
    if (!result.success) {
      return apiError('VALIDATION_ERROR', result.error || 'Failed to delete weight record', 400)
    }

    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('[MobileWeight DELETE] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete weight record'
    return apiError('INTERNAL_ERROR', message, 500)
  }
}
