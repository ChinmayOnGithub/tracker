import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { TemplateService } from '@/lib/services/TemplateService'
import { updateTemplateSchema } from '@/lib/validations/template'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { id } = await params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = updateTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const template = await TemplateService.updateTemplate(user.id, id, parsed.data)
    return apiSuccess({ template })
  } catch (error) {
    console.error('[MobileTemplatePatch] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update template'
    return apiError('INTERNAL_ERROR', message, 500)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { id } = await params
    await TemplateService.deleteTemplate(user.id, id)
    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('[MobileTemplateDelete] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete template'
    return apiError('INTERNAL_ERROR', message, 500)
  }
}
