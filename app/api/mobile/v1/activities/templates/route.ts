import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { TemplateService } from '@/lib/services/TemplateService'
import { createTemplateSchema } from '@/lib/validations/template'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('activeOnly') !== 'false'
    const category = searchParams.get('category') || undefined

    const templates = await TemplateService.getUserTemplates(user.id, {
      activeOnly,
      category,
    })

    return apiSuccess({ templates })
  } catch (error) {
    console.error('[MobileTemplatesGet] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve activity templates', 500)
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

    const parsed = createTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const template = await TemplateService.createTemplate(user.id, parsed.data)

    return apiSuccess({ template }, 201)
  } catch (error) {
    console.error('[MobileTemplatesPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to create activity template', 500)
  }
}
