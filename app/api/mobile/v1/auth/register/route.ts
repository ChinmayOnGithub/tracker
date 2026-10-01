import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { z } from 'zod'

const registerSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
        400
      )
    }

    const result = await AuthService.register(parsed.data.username, parsed.data.password)
    if (!result.success) {
      return apiError('VALIDATION_ERROR', result.error, 400)
    }

    return apiSuccess({
      token: result.token,
      user: result.user,
    })
  } catch (error) {
    console.error('[MobileAuthRegister] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Internal server error during registration', 500)
  }
}
