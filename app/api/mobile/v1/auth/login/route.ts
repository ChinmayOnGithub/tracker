import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { z } from 'zod'

const loginSchema = z
  .object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required').optional(),
    pin: z.string().min(1, 'PIN is required').optional(),
  })
  .refine((data) => Boolean(data.password || data.pin), {
    message: 'Password or PIN is required',
    path: ['password'],
  })

export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
        400
      )
    }

    const secret = (parsed.data.password || parsed.data.pin || '').trim()
    const result = await AuthService.login(parsed.data.username, secret)
    if (!result.success) {
      return apiError('UNAUTHENTICATED', result.error, 401)
    }

    return apiSuccess({
      token: result.token,
      user: result.user,
    })
  } catch (error) {
    console.error('[MobileAuthLogin] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Internal server error during authentication', 500)
  }
}
