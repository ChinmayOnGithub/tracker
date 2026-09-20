export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHENTICATED')
  }
}

export class AccessDeniedError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'ACCESS_DENIED')
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Quota exceeded') {
    super(message, 429, 'QUOTA_EXCEEDED')
  }
}

export class BillingUnavailableError extends AppError {
  constructor(message = 'Billing service is temporarily unavailable') {
    super(message, 503, 'BILLING_UNAVAILABLE')
  }
}

export class GoogleApiError extends AppError {
  constructor(message: string, statusCode = 502, code = 'GOOGLE_API_ERROR') {
    super(message, statusCode, code)
  }
}

export function handleActionError(error: unknown): { success: false; error: string; code: string } {
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
      code: error.code
    }
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return {
    success: false,
    error: message,
    code: 'UNEXPECTED_ERROR'
  }
}
