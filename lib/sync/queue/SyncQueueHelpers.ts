/**
 * Sync Queue Helper Methods
 * Supporting functions for queue management and error handling
 */

import { SyncError, ErrorCategory, RetryConfig, OperationPriority, SyncOperation } from '../types'

interface QueuedOperation extends SyncOperation {
  attempts: number
  lastAttempt?: number
  nextRetry?: number
  addedAt: number
  startedAt?: number
  completedAt?: number
  errors: SyncError[]
}

export class SyncQueueHelpers {
  /**
   * Classify errors for appropriate handling
   */
  static classifyError(error: Error): SyncError {
    let category: ErrorCategory = 'unknown'
    let retryable = true
    let retryAfter: number | undefined
    
    const message = error.message.toLowerCase()
    
    if (error.name === 'AbortError' || message.includes('timeout')) {
      category = 'network'
    } else if (message.includes('unauthorized') || message.includes('forbidden')) {
      category = 'authorization'
      retryable = false
    } else if (message.includes('conflict') || message.includes('version')) {
      category = 'conflict'
    } else if (message.includes('validation') || message.includes('invalid')) {
      category = 'validation'
      retryable = false
    } else if (message.includes('rate limit') || message.includes('too many requests')) {
      category = 'rate_limit'
      // Extract retry-after if available
      const retryMatch = message.match(/retry after (\d+)/i)
      if (retryMatch) {
        retryAfter = parseInt(retryMatch[1]) * 1000
      }
    } else if (message.includes('network') || message.includes('fetch')) {
      category = 'network'
    } else if (message.includes('internal') || message.includes('server error')) {
      category = 'internal'
    }
    
    return {
      category,
      code: error.name,
      message: error.message,
      retryable,
      retryAfter,
      cause: error
    }
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  static calculateRetryDelay(operation: QueuedOperation, error: SyncError, retryConfig: RetryConfig): number {
    // Use server-suggested delay if available
    if (error.retryAfter) {
      return error.retryAfter
    }
    
    const { baseDelay, maxDelay, strategy, backoffMultiplier, jitter } = retryConfig
    let delay: number
    
    switch (strategy) {
      case 'exponential':
        delay = baseDelay * Math.pow(backoffMultiplier, operation.attempts - 1)
        break
      case 'linear':
        delay = baseDelay * operation.attempts
        break
      case 'fixed':
      default:
        delay = baseDelay
        break
    }
    
    // Apply max delay cap
    delay = Math.min(delay, maxDelay)
    
    // Add jitter to prevent thundering herd
    if (jitter) {
      const jitterAmount = delay * 0.1 * Math.random()
      delay += jitterAmount
    }
    
    return Math.floor(delay)
  }

  /**
   * Get numeric priority value for sorting
   */
  static getPriorityValue(priority: OperationPriority): number {
    const priorities = { 'realtime': 5, 'urgent': 4, 'high': 3, 'normal': 2, 'low': 1 }
    return priorities[priority] || 2
  }

  /**
   * Validate operation structure
   */
  static validateOperation(operation: SyncOperation): void {
    if (!operation.id || !operation.entityType || !operation.entityId) {
      throw new Error('Invalid operation: missing required fields')
    }
    
    if (!['create', 'update', 'delete'].includes(operation.type)) {
      throw new Error(`Invalid operation type: ${operation.type}`)
    }
    
    if (!operation.priority || !['realtime', 'urgent', 'high', 'normal', 'low'].includes(operation.priority)) {
      throw new Error(`Invalid operation priority: ${operation.priority}`)
    }
  }

  /**
   * Generate deterministic operation ID for idempotency
   */
  static generateOperationId(entityType: string, entityId: string, version: number): string {
    return `${entityType}:${entityId}:${version}:${Date.now()}`
  }

  /**
   * Check if operation should be retried
   */
  static shouldRetry(operation: QueuedOperation, error: SyncError, retryConfig: RetryConfig): boolean {
    const maxRetries = operation.maxRetries || retryConfig.maxAttempts
    
    return operation.attempts < maxRetries && 
           error.retryable && 
           retryConfig.retryableErrors.includes(error.category)
  }
}