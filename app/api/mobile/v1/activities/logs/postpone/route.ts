import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { postponeOneTimeTask, unpostponeOneTimeTask } from '@/app/actions/log'

const postponeRequestSchema = z.object({
  templateId: z.string().min(1).max(128),
  currentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  existingLogId: z.string().min(1).max(128).optional().nullable(),
})

const unpostponeRequestSchema = z.object({
  templateId: z.string().min(1).max(128),
  logId: z.string().min(1).max(128),
  originalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
})

/**
 * POST /api/mobile/v1/activities/logs/postpone
 * Postpone a one_time task: marks 'postponed' on current date, updates targetDate to next day.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Authentication required', 401)
    }

    const body = await request.json()
    const parsed = postponeRequestSchema.safeParse(body)

    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const { templateId, currentDate, existingLogId } = parsed.data

    const result = await postponeOneTimeTask(templateId, currentDate, existingLogId)

    if (!result.success) {
      return apiError('CONFLICT', result.error || 'Failed to postpone task', 400)
    }

    return apiSuccess({ nextDate: result.nextDate })
  } catch (error) {
    console.error('[MobilePostpone] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to postpone task', 500)
  }
}

/**
 * DELETE /api/mobile/v1/activities/logs/postpone
 * Un-postpone a one_time task: soft-deletes postponed log, reverts targetDate to original date.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const body = {
      templateId: searchParams.get('templateId'),
      logId: searchParams.get('logId'),
      originalDate: searchParams.get('originalDate'),
    }

    const parsed = unpostponeRequestSchema.safeParse(body)

    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const { templateId, logId, originalDate } = parsed.data

    const result = await unpostponeOneTimeTask(templateId, logId, originalDate)

    if (!result.success) {
      return apiError('CONFLICT', result.error || 'Failed to un-postpone task', 400)
    }

    return apiSuccess({ restored: true })
  } catch (error) {
    console.error('[MobileUnpostpone] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to un-postpone task', 500)
  }
}
