import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: ApiErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

export function apiSuccess<T>(data: T, status: number = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status })
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number = 400,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status }
  )
}

export function apiZodError(error: ZodError): NextResponse<ApiErrorResponse> {
  const issues = error.issues.map((i) => i.message).join('; ')
  const fieldErrors = error.flatten().fieldErrors
  return apiError('VALIDATION_ERROR', issues || 'Validation failed', 400, {
    fieldErrors: fieldErrors as Record<string, unknown>,
  })
}
