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

export class GoogleApiError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(message, statusCode, 'GOOGLE_API_ERROR')
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
