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

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND')
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

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict.') {
    super(message, 409, 'CONFLICT')
  }
}

export class GoogleApiError extends AppError {
  constructor(message: string, statusCode = 502, code = 'GOOGLE_API_ERROR') {
    super(message, statusCode, code)
  }
}

/**
 * Maps any error into a safe, client-presentable Server Action error envelope.
 * Guarantees that internal errors, Prisma exceptions, SQL, stack traces, and filesystem paths
 * are never exposed to the client.
 */
export function toSafeActionError(error: unknown): { code: string; message: string } {
  if (error instanceof UnauthorizedError || error instanceof UnauthenticatedError) {
    return {
      code: 'UNAUTHORIZED',
      message: 'Please sign in again.'
    }
  }

  if (error instanceof ForbiddenError || error instanceof AccessDeniedError) {
    return {
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.'
    }
  }

  if (error instanceof ValidationError) {
    return {
      code: 'VALIDATION_ERROR',
      message: error.message
    }
  }

  if (error instanceof ConflictError) {
    return {
      code: 'CONFLICT',
      message: error.message
    }
  }

  if (error instanceof NotFoundError) {
    return {
      code: 'NOT_FOUND',
      message: error.message
    }
  }

  if (error instanceof QuotaExceededError) {
    return {
      code: 'QUOTA_EXCEEDED',
      message: error.message
    }
  }

  if (error instanceof BillingUnavailableError) {
    return {
      code: 'BILLING_UNAVAILABLE',
      message: error.message
    }
  }

  if (
    error instanceof Error &&
    (error.message.includes('Access denied') ||
      error.message.includes('is disabled') ||
      error.message.includes('capability') ||
      error.message.includes('subscription required') ||
      error.message.includes('Subscription required'))
  ) {
    return {
      code: 'FORBIDDEN',
      message: error.message
    }
  }

  console.error('Unhandled server action error:', error)

  return {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.'
  }
}

/**
 * Maps any error into a safe, client-presentable Route Handler error response.
 */
export function toSafeApiError(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (error instanceof UnauthorizedError || error instanceof UnauthenticatedError) {
    return {
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }
    }
  }

  if (error instanceof ForbiddenError || error instanceof AccessDeniedError) {
    return {
      status: 403,
      body: { error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource.' } }
    }
  }

  if (error instanceof NotFoundError) {
    return {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Resource not available to this user.' } }
    }
  }

  if (error instanceof ConflictError) {
    return {
      status: 409,
      body: { error: { code: 'CONFLICT', message: error.message } }
    }
  }

  if (error instanceof ValidationError) {
    return {
      status: 422,
      body: { error: { code: 'VALIDATION_ERROR', message: error.message } }
    }
  }

  if (error instanceof QuotaExceededError) {
    return {
      status: 429,
      body: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }
    }
  }

  console.error('Unhandled API error:', error)

  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected internal error occurred.' } }
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

  const safe = toSafeActionError(error)
  return {
    success: false,
    error: safe.message,
    code: safe.code
  }
}
