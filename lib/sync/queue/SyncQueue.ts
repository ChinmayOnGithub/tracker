/**
 * Production Sync Queue Manager
 * Comprehensive queue management with priority scheduling, retry logic, and crash recovery
 */

import { SyncOperation, SyncResult, StorageProvider, SyncEventMap, SyncError, RetryConfig, OperationPriority, SyncLogger } from '../types'
import { EventEmitter } from '../utils/EventEmitter'
import { SyncQueueHelpers } from './SyncQueueHelpers'

interface QueuedOperation extends SyncOperation {
  attempts: number
  lastAttempt?: number
  nextRetry?: number
  addedAt: number
  startedAt?: number
  completedAt?: number
  errors: SyncError[]
}

interface QueueStats {
  total: number
  pending: number
  processing: number
  failed: number
  retrying: number
  byPriority: Record<OperationPriority, number>
  byEntityType: Record<string, number>
  oldestOperationAge: number
  averageWaitTime: number
}

export class SyncQueue extends EventEmitter<SyncEventMap> {
  private queue: QueuedOperation[] = []
  private processingOperations = new Map<string, QueuedOperation>()
  private completedOperations: QueuedOperation[] = []
  private processingBatch = false
  
  private storageProvider: StorageProvider
  private logger?: SyncLogger
  private retryConfig: RetryConfig
  private maxQueueSize: number
  private maxConcurrentOperations: number
  
  // Queue persistence and recovery
  private persistenceEnabled: boolean
  private persistenceInterval?: NodeJS.Timeout
  private recoveryInProgress = false
  
  // Metrics and monitoring
  private stats = {
    totalProcessed: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    totalRetries: 0,
    totalDropped: 0
  }

  constructor(
    storageProvider: StorageProvider,
    options: {
      retryConfig: RetryConfig
      maxQueueSize?: number
      maxConcurrentOperations?: number
      persistenceEnabled?: boolean
      logger?: SyncLogger
    }
  ) {
    super()
    this.storageProvider = storageProvider
    this.retryConfig = options.retryConfig
    this.maxQueueSize = options.maxQueueSize || 10000
    this.maxConcurrentOperations = options.maxConcurrentOperations || 5
    this.persistenceEnabled = options.persistenceEnabled || true
    this.logger = options.logger

    
    if (this.persistenceEnabled) {
      this.setupPersistence()
      this.recoverFromCrash()
    }
  }

  /**
   * Add operation to queue with comprehensive validation and deduplication
   * Fixed: Atomic duplicate check to prevent race conditions
   */
  async enqueue(operation: SyncOperation): Promise<void> {
    try {
      // Validate operation
      this.validateOperation(operation)
      
      // Atomic duplicate check with lock to prevent race condition
      await this.waitForLock(`enqueue:${operation.id}`)
      this.acquireLock(`enqueue:${operation.id}`)
      
      try {
        // Check for duplicates while holding lock
        if (await this.isDuplicate(operation)) {
          this.logger?.warn('SyncQueue duplicate operation rejected', {
            operationId: operation.id,
            clientRequestId: operation.clientRequestId
          })
          throw new Error(`Duplicate operation: ${operation.clientRequestId || operation.id}`)
        }
        
        // Check queue capacity
        if (this.queue.length >= this.maxQueueSize) {
          await this.handleQueueOverflow(operation)
          return
        }
        
        const queuedOperation: QueuedOperation = {
          ...operation,
          attempts: 0,
          addedAt: Date.now(),
          errors: []
        }
        
        // Insert based on priority and creation time
        this.insertByPriority(queuedOperation)
      } finally {
        this.releaseLock(`enqueue:${operation.id}`)
      }
      
      // Persist queue state
      if (this.persistenceEnabled) {
        await this.persistQueue()
      }
      
      this.emit('operation:queued', {
        operation,
        queueSize: this.queue.length
      })
      
      this.logger?.debug('SyncQueue operation enqueued', {
        operationId: operation.id,
        priority: operation.priority,
        queueSize: this.queue.length
      })
      
      // Start processing if not already running
      if (!this.processingBatch) {
        setImmediate(() => this.processBatch())
      }
    } catch (error) {
      this.logger?.error('SyncQueue failed to enqueue operation', error as Error, {
        operationId: operation.id
      })
      throw error
    }
  }

  /**
   * Remove operation from queue with cancellation support
   */
  async dequeue(operationId: string): Promise<boolean> {
    const index = this.queue.findIndex(op => op.id === operationId)
    if (index === -1) {
      // Check if it's currently processing
      if (this.processingOperations.has(operationId)) {
        const op = this.processingOperations.get(operationId)!
        if (op.cancellationToken && !op.cancellationToken.aborted) {
          this.logger?.info('SyncQueue requesting operation cancellation', { operationId })
          return true
        }
      }
      return false
    }

    const operation = this.queue.splice(index, 1)[0]
    
    if (this.persistenceEnabled) {
      await this.persistQueue()
    }
    
    this.emit('operation:cancelled', {
      operation,
      reason: 'Dequeued by request'
    })
    
    return true
  }

  /**
   * Process operations in batches with concurrency control
   */
  private async processBatch(): Promise<void> {
    if (this.processingBatch || this.queue.length === 0) {
      return
    }

    this.processingBatch = true
    
    try {
      while (this.queue.length > 0 && this.processingOperations.size < this.maxConcurrentOperations) {
        const operation = this.getNextReadyOperation()
        if (!operation) break
        
        // Move to processing
        this.removeFromQueue(operation)
        this.processingOperations.set(operation.id, operation)
        
        // Process asynchronously
        this.processOperation(operation).catch(error => {
          this.logger?.error('SyncQueue uncaught processing error', error, {
            operationId: operation.id
          })
        })
      }
    } finally {
      this.processingBatch = false
      
      // Schedule next batch if there are more operations
      if (this.queue.length > 0) {
        const nextReadyTime = this.getNextReadyTime()
        if (nextReadyTime > 0) {
          setTimeout(() => this.processBatch(), Math.min(nextReadyTime - Date.now(), 60000))
        }
      }
    }
  }

  /**
   * Execute a single operation (stub - should be overridden by network adapter)
   * For base SyncQueue, this delegates to a hypothetical network adapter
   */
  protected async executeOperation(_operation: QueuedOperation): Promise<SyncResult> {
    // This is intentionally a stub since SyncQueue is typically used with
    // a network adapter that handles actual execution
    // Subclasses or adapters should override this
    throw new Error('executeOperation must be implemented by subclass or adapter')
  }

  /**
   * Process a single operation with timeout and error handling
   * Fixed: Ensures operations are removed from processingOperations on all exit paths
   */
  private async processOperation(operation: QueuedOperation): Promise<void> {
    const startTime = Date.now()
    operation.startedAt = startTime
    
    try {
      // Execute the operation with timeout
      const timeout = operation.timeout || this.retryConfig.maxDelay || 30000
      const result = await Promise.race([
        this.executeOperation(operation),
        new Promise<SyncResult>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), timeout)
        )
      ])

      // Success path
      if (result.success) {
        operation.completedAt = Date.now()
        this.stats.totalSuccessful++
        this.processingOperations.delete(operation.id) // Clean up processing map
        this.addToCompleted(operation)
        
        this.emit('operation:completed', {
          operation,
          result,
          duration: Date.now() - startTime
        })
        
        this.logger?.info('SyncQueue operation completed', {
          operationId: operation.id,
          duration: Date.now() - startTime
        })
      } else {
        // Operation executed but failed
        await this.handleOperationFailure(operation, new Error(result.error?.message || 'Operation failed'))
      }
    } catch (error) {
      // Execution error
      await this.handleOperationFailure(operation, error instanceof Error ? error : new Error(String(error)))
    } finally {
      // Ensure we always remove from processing map on any exit path
      if (this.processingOperations.has(operation.id)) {
        this.processingOperations.delete(operation.id)
      }
      
      // Continue processing queue
      setImmediate(() => this.processBatch())
    }
  }

  /**
   * Handle operation failure with sophisticated retry logic
   */
  private async handleOperationFailure(operation: QueuedOperation, error: Error): Promise<void> {
    operation.attempts++
    this.stats.totalFailed++
    
    // Import helpers for error classification
    const { SyncQueueHelpers } = await import('./SyncQueueHelpers')
    
    // Classify the error
    const syncError = SyncQueueHelpers.classifyError(error)
    operation.errors.push(syncError)
    
    this.logger?.warn('SyncQueue operation failed', {
      operationId: operation.id,
      attempt: operation.attempts,
      errorCategory: syncError.category,
      error: syncError.message
    })
    
    // Check if we should retry
    const _maxRetries = operation.maxRetries || this.retryConfig.maxAttempts
    const shouldRetry = SyncQueueHelpers.shouldRetry(operation, syncError, this.retryConfig)
    
    if (shouldRetry) {
      // Calculate retry delay
      const delay = SyncQueueHelpers.calculateRetryDelay(operation, syncError, this.retryConfig)
      operation.nextRetry = Date.now() + delay
      operation.lastAttempt = Date.now()
      
      this.stats.totalRetries++
      
      // Remove from processing and re-queue
      this.processingOperations.delete(operation.id)
      this.insertByPriority(operation)
      
      if (this.persistenceEnabled) {
        await this.persistQueue()
      }
      
      this.emit('operation:failed', {
        operation,
        error: syncError,
        willRetry: true
      })
      
      this.logger?.info('SyncQueue operation scheduled for retry', {
        operationId: operation.id,
        retryIn: delay,
        attempt: operation.attempts + 1
      })
      
    } else {
      // Max retries reached or non-retryable error
      operation.completedAt = Date.now()
      this.processingOperations.delete(operation.id)
      this.addToCompleted(operation)
      
      this.emit('operation:failed', {
        operation,
        error: syncError,
        willRetry: false
      })
      
      this.logger?.error('SyncQueue operation permanently failed', undefined, {
        operationId: operation.id,
        attempts: operation.attempts,
        errorCategory: syncError.category,
        finalError: syncError.message
      })
    }
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    try {
      await this.storageProvider.set('sync:queue', this.queue)
    } catch (error) {
      console.error('[SyncQueue] Failed to persist queue:', error)
    }
  }

  /**
   * Load queue from storage
   */
  private async loadPersistedQueue(): Promise<void> {
    try {
      const persistedQueue = await this.storageProvider.get<QueuedOperation[]>('sync:queue')
      if (persistedQueue) {
        this.queue = persistedQueue
        console.log(`[SyncQueue] Loaded ${this.queue.length} operations from storage`)
      }
    } catch (error) {
      console.error('[SyncQueue] Failed to load persisted queue:', error)
    }
  }

  /**
   * Clear all operations
   */
  async clear(): Promise<void> {
    this.queue = []
    await this.persistQueue()
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const byEntityType = new Map<string, number>()
    const byStatus = new Map<string, number>()
    
    for (const op of this.queue) {
      byEntityType.set(op.entityType, (byEntityType.get(op.entityType) || 0) + 1)
      
      const status = op.attempts === 0 ? 'pending' : 'retrying'
      byStatus.set(status, (byStatus.get(status) || 0) + 1)
    }

    return {
      total: this.queue.length,
      byEntityType: Object.fromEntries(byEntityType),
      byStatus: Object.fromEntries(byStatus),
      processing: this.processing
    }
  }

  // Queue management helper methods

  private validateOperation(_operation: SyncOperation): void {
    // Validation would be implemented here
    // For now, we accept all operations
  }

  private async isDuplicate(operation: SyncOperation): Promise<boolean> {
    // Check by client request ID
    if (operation.clientRequestId) {
      const existing = this.queue.find(op => op.clientRequestId === operation.clientRequestId) ||
                      Array.from(this.processingOperations.values()).find(op => op.clientRequestId === operation.clientRequestId)
      
      if (existing) return true
    }
    
    // Check by operation ID
    const existingById = this.queue.find(op => op.id === operation.id) ||
                        this.processingOperations.has(operation.id)
    
    return !!existingById
  }

  private insertByPriority(operation: QueuedOperation): void {
    const priority = SyncQueueHelpers.getPriorityValue(operation.priority)
    let insertIndex = this.queue.length
    
    // Find insertion point based on priority and age
    for (let i = 0; i < this.queue.length; i++) {
      const queuedPriority = SyncQueueHelpers.getPriorityValue(this.queue[i].priority)
      
      if (queuedPriority < priority) {
        insertIndex = i
        break
      } else if (queuedPriority === priority) {
        // Same priority: order by age (older first)
        if (operation.createdAt < this.queue[i].createdAt) {
          insertIndex = i
          break
        }
      }
    }
    
    this.queue.splice(insertIndex, 0, operation)
  }

  private removeFromQueue(operation: QueuedOperation): void {
    const index = this.queue.findIndex(op => op.id === operation.id)
    if (index !== -1) {
      this.queue.splice(index, 1)
    }
  }

  private getNextReadyOperation(): QueuedOperation | null {
    const now = Date.now()
    
    for (const operation of this.queue) {
      if (!operation.nextRetry || operation.nextRetry <= now) {
        // Check for cancellation
        if (operation.cancellationToken?.aborted) {
          this.removeFromQueue(operation)
          this.emit('operation:cancelled', {
            operation,
            reason: 'Cancelled by token'
          })
          continue
        }
        
        return operation
      }
    }
    
    return null
  }

  private getNextReadyTime(): number {
    const now = Date.now()
    let nextTime = Number.MAX_SAFE_INTEGER
    
    for (const operation of this.queue) {
      if (operation.nextRetry && operation.nextRetry > now) {
        nextTime = Math.min(nextTime, operation.nextRetry)
      }
    }
    
    return nextTime === Number.MAX_SAFE_INTEGER ? 0 : nextTime
  }

  private addToCompleted(operation: QueuedOperation): void {
    this.completedOperations.push(operation)
    
    // Keep only recent completed operations (last 1000)
    if (this.completedOperations.length > 1000) {
      this.completedOperations = this.completedOperations.slice(-1000)
    }
  }

  private async handleQueueOverflow(operation: SyncOperation): Promise<void> {
    // Drop lowest priority operations to make space
    const lowPriorityOps = this.queue
      .filter(op => op.priority === 'low')
      .sort((a, b) => a.addedAt - b.addedAt) // Oldest first
    
    if (lowPriorityOps.length > 0) {
      const dropped = this.queue.splice(this.queue.indexOf(lowPriorityOps[0]), 1)[0]
      this.stats.totalDropped++
      
      this.logger?.warn('SyncQueue dropped operation due to overflow', {
        droppedId: dropped.id,
        newOperationId: operation.id
      })
      
      this.insertByPriority({ ...operation, attempts: 0, addedAt: Date.now(), errors: [] })
      
      this.emit('queue:overflow', {
        droppedOperations: 1,
        queueSize: this.queue.length
      })
    } else {
      throw new Error('Queue is full and no low-priority operations to drop')
    }
  }

  // Persistence and crash recovery
  private setupPersistence(): void {
    // Periodically persist queue state
    this.persistenceInterval = setInterval(async () => {
      try {
        await this.persistQueue()
      } catch (error) {
        this.logger?.error('SyncQueue persistence failed', error as Error)
      }
    }, 30000) // Every 30 seconds
  }

  private async persistQueue(): Promise<void> {
    try {
      const queueState = {
        queue: this.queue,
        processing: Array.from(this.processingOperations.values()),
        stats: this.stats,
        timestamp: Date.now()
      }
      
      await this.storageProvider.set('sync:queue:state', queueState)
    } catch (error) {
      this.logger?.error('SyncQueue failed to persist state', error as Error)
      throw error
    }
  }

  private async recoverFromCrash(): Promise<void> {
    if (this.recoveryInProgress) return
    
    this.recoveryInProgress = true
    
    try {
      const queueState = await this.storageProvider.get<{
        queue: QueuedOperation[]
        processing: QueuedOperation[]
        stats: unknown
        timestamp: number
      }>('sync:queue:state')
      
      if (!queueState) {
        this.logger?.info('SyncQueue no previous state found, starting fresh')
        return
      }
      
      const age = Date.now() - queueState.timestamp
      this.logger?.info('SyncQueue recovering from crash', {
        queueSize: queueState.queue.length,
        processingSize: queueState.processing.length,
        age: age
      })
      
      // Restore queue
      this.queue = queueState.queue || []
      
      // Move processing operations back to queue for retry
      const processingOps = queueState.processing || []
      for (const op of processingOps) {
        // Reset processing state
        delete op.startedAt
        this.insertByPriority(op)
      }
      
      // Restore stats
      this.stats = { ...this.stats, ...queueState.stats }
      
      this.emit('queue:recovered', {
        operationCount: this.queue.length,
        oldestOperation: this.queue.length > 0 
          ? Math.min(...this.queue.map(op => op.addedAt))
          : Date.now()
      })
      
      this.logger?.info('SyncQueue recovery completed', {
        recoveredOperations: this.queue.length
      })
      
    } catch (error) {
      this.logger?.error('SyncQueue recovery failed', error as Error)
    } finally {
      this.recoveryInProgress = false
    }
  }

  // Public API methods

  size(): number {
    return this.queue.length
  }

  getProcessingCount(): number {
    return this.processingOperations.size
  }

  getOperationsByEntity(entityType: string): QueuedOperation[] {
    return this.queue.filter(op => op.entityType === entityType)
  }

  async clearEntity(entityType: string, entityId?: string): Promise<void> {
    const before = this.queue.length
    
    this.queue = this.queue.filter(op => {
      if (op.entityType !== entityType) return true
      if (entityId && op.entityId !== entityId) return true
      return false
    })
    
    if (this.persistenceEnabled) {
      await this.persistQueue()
    }
    
    const removed = before - this.queue.length
    this.logger?.info('SyncQueue cleared entity operations', {
      entityType,
      entityId,
      removedCount: removed
    })
  }

  async clear(): Promise<void> {
    this.queue.length = 0
    this.processingOperations.clear()
    this.completedOperations.length = 0
    
    if (this.persistenceEnabled) {
      await this.persistQueue()
    }
  }

  getStats(): QueueStats {
    const now = Date.now()
    
    const byPriority: Record<OperationPriority, number> = {
      realtime: 0, urgent: 0, high: 0, normal: 0, low: 0
    }
    const byEntityType: Record<string, number> = {}
    
    let oldestAge = 0
    let totalWaitTime = 0
    
    for (const op of this.queue) {
      byPriority[op.priority]++
      byEntityType[op.entityType] = (byEntityType[op.entityType] || 0) + 1
      
      const age = now - op.addedAt
      oldestAge = Math.max(oldestAge, age)
      totalWaitTime += age
    }
    
    return {
      total: this.queue.length + this.processingOperations.size,
      pending: this.queue.filter(op => !op.nextRetry || op.nextRetry <= now).length,
      processing: this.processingOperations.size,
      failed: this.queue.filter(op => op.attempts > 0).length,
      retrying: this.queue.filter(op => op.nextRetry && op.nextRetry > now).length,
      byPriority,
      byEntityType,
      oldestOperationAge: oldestAge,
      averageWaitTime: this.queue.length > 0 ? totalWaitTime / this.queue.length : 0
    }
  }

  destroy(): void {
    this.logger?.info('SyncQueue shutting down')
    
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval)
    }
    
    // Cancel all processing operations
    for (const [_id, operation] of this.processingOperations) {
      if (operation.cancellationToken && !operation.cancellationToken.aborted) {
        // Signal cancellation would be handled by the AbortController
      }
    }
    
    this.removeAllListeners()
  }
}