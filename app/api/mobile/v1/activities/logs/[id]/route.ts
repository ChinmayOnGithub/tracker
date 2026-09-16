import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { ActivityService } from '@/lib/services/ActivityService'
import { updateLogSchema } from '@/lib/validations/log'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { id } = await context.params
    if (!id) {
      return apiError('VALIDATION_ERROR', 'Missing log ID in path', 400)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = updateLogSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    try {
      const updated = await ActivityService.updateLog(user.id, id, parsed.data)
      const log = {
        id: updated.id,
        activityId: updated.activityId,
        date: updated.logDate.toISOString().split('T')[0],
        status: updated.status,
        note: updated.note,
        amount: updated.amount,
        payload: updated.payload,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      }
      return apiSuccess({ log })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('unauthorized') || msg.includes('not found')) {
        return apiError('FORBIDDEN', 'Log record not found or unauthorized', 403)
      }
      throw err
    }
  } catch (error) {
    console.error('[MobileLogPatch] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to update activity log', 500)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { id } = await context.params
    if (!id) {
      return apiError('VALIDATION_ERROR', 'Missing log ID in path', 400)
    }

    try {
      await ActivityService.deleteLog(user.id, id)
      return apiSuccess({ deleted: true, id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('unauthorized') || msg.includes('not found')) {
        return apiError('FORBIDDEN', 'Log record not found or unauthorized', 403)
      }
      throw err
    }
  } catch (error) {
    console.error('[MobileLogDelete] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to delete activity log', 500)
  }
}
