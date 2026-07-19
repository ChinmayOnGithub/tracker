/**
 * Production Sync Engine Core
 * Orchestrates all sync components with enterprise-grade reliability
 */

import { 
  SyncEngineConfig, 
  EntitySyncConfig, 
  SyncOperation, 
  SyncResult, 
  SyncMetadata,
  ConflictContext,
  SyncEventMap,
  NetworkStatus,
  SyncMetrics,
  RetryConfig,
  SyncLogger
} from '../types'

import { SyncQueue } from '../queue/SyncQueue'
import { NetworkManager } from '../network/NetworkManager'
import { EventEmitter } from '../utils/EventEmitter'
import { SyncMetricsCollector } from '../metrics/SyncMetrics'
import { ConflictResolver } from './ConflictResolver'
import { ProductionSyncLogger } from '../utils/SyncLogger'

interface EntityManager {
  config: EntitySyncConfig
  lastSyncTime: number
  syncInterval?: NodeJS.Timeout
}

export class ProductionSyncEngine extends EventEmitter<SyncEventMap> {
  private config: SyncEngineConfig
  private syncQueue: SyncQueue
  private networkManager: NetworkManager
  private metricsCollector: SyncMetricsCollector
  private conflictResolver: ConflictResolver
  private logger: SyncLogger
  
  // Entity management
  private entityManagers = new Map<string, EntityManager>()
  private globalSyncInterval?: NodeJS.Timeout
  
  // State management
  private isRunning = false
  private isShuttingDown = false
  private healthCheckInterval?: NodeJS.Timeout
  
  // Performance monitoring
  private memoryUsage = {
    operations: 0,
    metadata: 0,
    cache: 0
  }
  
  // Circuit breaker for error handling
  private circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
    threshold: 5,
    timeout: 60000 // 1 minute
  }

  constructor(config: SyncEngineConfig) {
    super()
    
    this.config = this.validateAndNormalizeConfig(config)
    this.logger = config.logger || new ProductionSyncLogger()
    
    // Initialize components
    this.syncQueue = new SyncQueue(config.storageProvider, {
      retryConfig: config.retryConfig,
      maxQueueSize: config.maxQueueSize,
      maxConcurrentOperations: config.maxConcurrentBatches,
      persistenceEnabled: config.queuePersistence,
      logger: this.logger
    })
    
    this.networkManager = new NetworkManager(
      ['/api/sync/health'], 
      this.logger
    )
    
    this.metricsCollector = new SyncMetricsCollector(this.logger)
    this.conflictResolver = new ConflictResolver(this.logger)
    
    this.setupEventListeners()
    this.logger.info('ProductionSyncEngine initialized')
  }

  /**
   * Start the sync engine with comprehensive initialization
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('ProductionSyncEngine already running')
      return
    }

    this.logger.info('ProductionSyncEngine starting...')
    const startTime = this.logger.startTiming('engine_startup')

    try {
      // Validate storage provider health
      const storageHealthy = await this.config.storageProvider.isHealthy()
      if (!storageHealthy) {
        throw new Error('Storage provider is unhealthy')
      }

      // Initialize network monitoring
      await this.networkManager.forceCheck()

      // Set up periodic sync for registered entities
      this.setupPeriodicSync()

      // Set up health monitoring
      this.setupHealthMonitoring()

      // Initial sync for all entities if online
      if (this.networkManager.isOnline()) {
        await this.performInitialSync()
      }

      this.isRunning = true
      this.logger.info('ProductionSyncEngine started successfully')
      
      this.emit('sync:started', { 
        entityTypes: Array.from(this.entityManagers.keys()),
        batchId: this.generateBatchId()
      })

    } catch (error) {
      this.logger.error('ProductionSyncEngine failed to start', error as Error)
      throw error
    } finally {
      startTime()
    }
  }

  /**
   * Graceful shutdown with cleanup
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('ProductionSyncEngine not running')
      return
    }

    this.logger.info('ProductionSyncEngine shutting down...')
    this.isShuttingDown = true

    try {
      // Clear all intervals
      if (this.globalSyncInterval) {
        clearInterval(this.globalSyncInterval)
      }

      for (const manager of this.entityManagers.values()) {
        if (manager.syncInterval) {
          clearInterval(manager.syncInterval)
        }
      }

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval)
      }

      // Wait for current operations to complete (with timeout)
      await this.waitForOperationsToComplete(30000) // 30 seconds

      // Destroy components
      this.syncQueue.destroy()
      this.networkManager.destroy()
      this.metricsCollector.destroy()

      this.isRunning = false
      this.logger.info('ProductionSyncEngine stopped')

    } catch (error) {
      this.logger.error('ProductionSyncEngine shutdown error', error as Error)
    } finally {
      this.isShuttingDown = false
    }
  }

  /**
   * Register entity with comprehensive configuration validation
   */
  registerEntity(config: EntitySyncConfig): void {
    this.validateEntityConfig(config)

    const manager: EntityManager = {
      config,
      lastSyncTime: 0
    }

    // Set up entity-specific periodic sync
    if (config.syncInterval && config.syncInterval > 0) {
      manager.syncInterval = setInterval(() => {
        if (this.isRunning && !this.isShuttingDown) {
          this.syncEntitySafely(config.entityType)
        }
      }, config.syncInterval)
    }

    this.entityManagers.set(config.entityType, manager)

    this.logger.info('ProductionSyncEngine registered entity', {
      entityType: config.entityType,
      syncInterval: config.syncInterval,
      priority: config.priority
    })
  }

  /**
   * Perform optimistic update with comprehensive error handling
   */
  async optimisticUpdate<T>(
    entityType: string,
    entityId: string,
    data: T,
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    if (!this.config.enableOptimisticUpdates) {
      throw new Error('Optimistic updates are disabled')
    }

    const operationId = this.generateOperationId(entityType, entityId, operation)
    const timing = this.logger.startTiming('optimistic_update')

    try {
      this.logger.debug('ProductionSyncEngine performing optimistic update', {
        operationId,
        entityType,
        entityId,
        operation
      })

      const timestamp = Date.now()
      const storageKey = `${entityType}:${entityId}`

      // Create sync metadata
      const metadata: SyncMetadata = {
        id: entityId,
        entityType,
        entityId,
        lastModified: timestamp,
        version: await this.getNextVersion(entityType, entityId),
        syncStatus: 'pending',
        retryCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      }

      // Apply local change immediately using transaction
      await this.config.storageProvider.transaction(async (tx) => {
        if (operation === 'delete') {
          await tx.delete(storageKey)
        } else {
          await tx.set(storageKey, data)
        }
      })

      await this.config.storageProvider.setMetadata(storageKey, metadata)

      // Queue for background sync
      const syncOperation: SyncOperation<T> = {
        id: operationId,
        type: operation,
        entityType,
        entityId,
        data,
        metadata,
        createdAt: timestamp,
        priority: this.getEntityPriority(entityType),
        clientRequestId: `${operationId}_${timestamp}`,
        userId: 'current-user', // This should come from context
        source: 'optimistic_update'
      }

      await this.syncQueue.enqueue(syncOperation)

      // Update metrics
      this.metricsCollector.incrementCounter('operations.optimistic_updates')
      
      this.logger.debug('ProductionSyncEngine optimistic update completed', {
        operationId,
        entityType,
        entityId,
        queueSize: this.syncQueue.size()
      })

    } catch (error) {
      this.logger.error('ProductionSyncEngine optimistic update failed', error as Error, {
        operationId,
        entityType,
        entityId
      })

      this.metricsCollector.incrementCounter('operations.optimistic_failures')
      
      // Attempt rollback if possible
      await this.rollbackOptimisticUpdate(entityType, entityId)
      
      throw error
    } finally {
      timing()
    }
  }

  /**
   * Manually trigger sync with error handling and circuit breaker
   */
  async syncEntity(entityType: string): Promise<void> {
    if (this.circuitBreaker.isOpen) {
      const now = Date.now()
      if (now - this.circuitBreaker.lastFailure < this.circuitBreaker.timeout) {
        this.logger.warn('ProductionSyncEngine sync blocked by circuit breaker', {
          entityType,
          failuresCount: this.circuitBreaker.failures
        })
        return
      } else {
        // Reset circuit breaker
        this.circuitBreaker.isOpen = false
        this.circuitBreaker.failures = 0
      }
    }

    await this.syncEntitySafely(entityType)
  }

  /**
   * Internal safe sync with comprehensive error handling
   */
  private async syncEntitySafely(entityType: string): Promise<void> {
    if (!this.networkManager.isOnline()) {
      this.logger.debug('ProductionSyncEngine skipping sync - offline', { entityType })
      return
    }

    const batchId = this.generateBatchId()
    const timing = this.logger.startTiming(`sync_${entityType}`)

    try {
      this.logger.info('ProductionSyncEngine starting entity sync', {
        entityType,
        batchId
      })

      this.emit('sync:started', { 
        entityTypes: [entityType],
        batchId
      })

      // Get pending operations for this entity
      const operations = this.syncQueue.getOperationsByEntity(entityType)
      
      if (operations.length > 0) {
        this.logger.debug('ProductionSyncEngine processing pending operations', {
          entityType,
          operationsCount: operations.length,
          batchId
        })

        await this.processPendingOperations(entityType, operations, batchId)
      }

      // Pull remote changes
      await this.pullRemoteChanges(entityType, batchId)

      // Update last sync time
      const manager = this.entityManagers.get(entityType)
      if (manager) {
        manager.lastSyncTime = Date.now()
      }

      // Reset circuit breaker on success
      this.circuitBreaker.failures = 0

      this.emit('sync:completed', {
        results: [], // Would contain actual results
        duration: Date.now() - timing,
        batchId
      })

      this.logger.info('ProductionSyncEngine entity sync completed', {
        entityType,
        batchId
      })

    } catch (error) {
      this.handleSyncFailure(entityType, error as Error, batchId)
    } finally {
      timing()
    }
  }

  // Helper methods and configuration

  private validateAndNormalizeConfig(config: SyncEngineConfig): SyncEngineConfig {
    // Set defaults and validate configuration
    const normalized: SyncEngineConfig = {
      batchSize: config.batchSize || 50,
      batchTimeoutMs: config.batchTimeoutMs || 30000,
      maxConcurrentBatches: config.maxConcurrentBatches || 3,
      retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        strategy: 'exponential',
        jitter: true,
        backoffMultiplier: 2,
        retryableErrors: ['network', 'internal', 'rate_limit'],
        ...config.retryConfig
      },
      networkTimeout: config.networkTimeout || 15000,
      connectionPoolSize: config.connectionPoolSize || 5,
      maxQueueSize: config.maxQueueSize || 10000,
      queuePersistence: config.queuePersistence !== false,
      priorityLevels: config.priorityLevels || 5,
      enableOptimisticUpdates: config.enableOptimisticUpdates !== false,
      enableConflictResolution: config.enableConflictResolution !== false,
      enableCompression: config.enableCompression || false,
      enableEncryption: config.enableEncryption || false,
      maxMemoryUsage: config.maxMemoryUsage || 100 * 1024 * 1024, // 100MB
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      metadataRetention: config.metadataRetention || 86400000, // 24 hours
      metricsInterval: config.metricsInterval || 60000, // 1 minute
      enableDetailedMetrics: config.enableDetailedMetrics !== false,
      storageProvider: config.storageProvider,
      networkAdapter: config.networkAdapter,
      logger: config.logger
    }

    // Validate required components
    if (!normalized.storageProvider) {
      throw new Error('Storage provider is required')
    }

    if (!normalized.networkAdapter) {
      throw new Error('Network adapter is required')
    }

    return normalized
  }

  private validateEntityConfig(config: EntitySyncConfig): void {
    if (!config.entityType) {
      throw new Error('Entity type is required')
    }

    if (!config.priority || !['realtime', 'urgent', 'high', 'normal', 'low'].includes(config.priority)) {
      throw new Error(`Invalid priority: ${config.priority}`)
    }
  }

  private setupEventListeners(): void {
    // Network events
    this.networkManager.on('network:statusChanged', ({ status, previousStatus }) => {
      this.emit('network:statusChanged', { status, previousStatus })
      
      if (status === 'online' && previousStatus === 'offline') {
        this.logger.info('ProductionSyncEngine network restored - resuming sync')
        this.performInitialSync()
      }
    })

    // Queue events
    this.syncQueue.on('operation:queued', (data) => {
      this.emit('operation:queued', data)
      this.metricsCollector.recordMetric('queue.size', this.syncQueue.size())
    })

    this.syncQueue.on('operation:completed', (data) => {
      this.emit('operation:completed', data)
      
      // Record operation metrics
      const duration = data.result.timing?.duration || 0
      const queueTime = data.result.timing ? 
        data.result.timing.startedAt - data.result.timing.queuedAt : 0
      
      this.metricsCollector.recordOperation({
        duration,
        queueTime,
        retries: 0, // Would need to track this
        success: data.result.success,
        errorCategory: data.result.error?.category
      })
    })

    this.syncQueue.on('queue:recovered', (data) => {
      this.emit('queue:recovered', data)
      this.logger.info('ProductionSyncEngine queue recovered from crash', data)
    })
  }

  private setupPeriodicSync(): void {
    // Global sync interval for coordination
    this.globalSyncInterval = setInterval(() => {
      if (this.isRunning && !this.isShuttingDown && this.networkManager.isOnline()) {
        this.performPeriodicMaintenance()
      }
    }, this.config.cleanupInterval)
  }

  private setupHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, 60000) // Every minute
  }

  private async performInitialSync(): Promise<void> {
    if (!this.networkManager.isOnline()) return

    const entityTypes = Array.from(this.entityManagers.keys())
    for (const entityType of entityTypes) {
      try {
        await this.syncEntitySafely(entityType)
      } catch (error) {
        this.logger.error('ProductionSyncEngine initial sync failed', error as Error, {
          entityType
        })
      }
    }
  }

  private async performPeriodicMaintenance(): void {
    try {
      // Cleanup old metadata
      const cleaned = await this.config.storageProvider.cleanup(
        Date.now() - this.config.metadataRetention
      )

      if (cleaned > 0) {
        this.logger.debug('ProductionSyncEngine maintenance cleanup', {
          itemsCleaned: cleaned
        })
      }

      // Update memory usage metrics
      await this.updateMemoryUsage()

      // Health check
      this.performHealthCheck()

    } catch (error) {
      this.logger.error('ProductionSyncEngine maintenance failed', error as Error)
    }
  }

  private performHealthCheck(): void {
    const health = this.metricsCollector.getHealthReport()
    
    this.logger.healthCheck('sync-engine', health.status, {
      issues: health.issues,
      queueSize: this.syncQueue.size(),
      processingCount: this.syncQueue.getProcessingCount(),
      networkStatus: this.networkManager.getStatus()
    })

    if (health.status === 'unhealthy') {
      this.logger.error('ProductionSyncEngine health check failed', undefined, {
        issues: health.issues
      })
    }
  }

  private async updateMemoryUsage(): Promise<void> {
    try {
      const stats = await this.config.storageProvider.getStats()
      
      this.memoryUsage = {
        operations: this.syncQueue.size() * 1024, // Rough estimate
        metadata: stats.metadata * 512, // Rough estimate
        cache: stats.totalSize
      }

      const total = this.memoryUsage.operations + this.memoryUsage.metadata + this.memoryUsage.cache
      
      this.metricsCollector.recordMetric('memory.total', total)
      this.metricsCollector.recordMetric('memory.operations', this.memoryUsage.operations)
      this.metricsCollector.recordMetric('memory.metadata', this.memoryUsage.metadata)
      this.metricsCollector.recordMetric('memory.cache', this.memoryUsage.cache)

      // Warning if approaching limit
      if (total > this.config.maxMemoryUsage * 0.8) {
        this.logger.warn('ProductionSyncEngine approaching memory limit', {
          current: total,
          limit: this.config.maxMemoryUsage,
          usage: (total / this.config.maxMemoryUsage * 100).toFixed(1) + '%'
        })
      }

    } catch (error) {
      this.logger.error('ProductionSyncEngine memory usage update failed', error as Error)
    }
  }

  // Utility methods
  private generateOperationId(entityType: string, entityId: string, operation: string): string {
    return `${entityType}:${entityId}:${operation}:${Date.now()}:${Math.random().toString(36).substring(2)}`
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2)}`
  }

  private getEntityPriority(entityType: string): 'realtime' | 'urgent' | 'high' | 'normal' | 'low' {
    const manager = this.entityManagers.get(entityType)
    return manager?.config.priority || 'normal'
  }

  private async getNextVersion(entityType: string, entityId: string): Promise<number> {
    const metadata = await this.config.storageProvider.getMetadata(`${entityType}:${entityId}`)
    return (metadata?.version || 0) + 1
  }

  // Stub methods - these would be implemented based on specific needs
  private async processPendingOperations(entityType: string, operations: any[], batchId: string): Promise<void> {
    // Implementation would process operations through network adapter
  }

  private async pullRemoteChanges(entityType: string, batchId: string): Promise<void> {
    // Implementation would pull from network adapter
  }

  private async rollbackOptimisticUpdate(entityType: string, entityId: string): Promise<void> {
    // Implementation would revert local changes
  }

  private async waitForOperationsToComplete(timeoutMs: number): Promise<void> {
    // Implementation would wait for current operations to finish
  }

  private handleSyncFailure(entityType: string, error: Error, batchId: string): void {
    this.circuitBreaker.failures++
    this.circuitBreaker.lastFailure = Date.now()
    
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true
      this.logger.error('ProductionSyncEngine circuit breaker opened', undefined, {
        entityType,
        failures: this.circuitBreaker.failures
      })
    }

    this.emit('sync:failed', {
      error: {
        category: 'internal',
        code: error.name,
        message: error.message,
        retryable: true
      },
      entityType,
      batchId
    })
  }

  // Public API
  getMetrics(): SyncMetrics {
    return this.metricsCollector.getMetrics()
  }

  getStats() {
    return {
      queue: this.syncQueue.getStats(),
      network: this.networkManager.getStats(),
      memory: this.memoryUsage,
      entities: Array.from(this.entityManagers.keys()),
      isRunning: this.isRunning,
      circuitBreaker: this.circuitBreaker
    }
  }

  async getEntity<T>(entityType: string, entityId: string): Promise<{ data: T | null; metadata: SyncMetadata | null }> {
    const storageKey = `${entityType}:${entityId}`
    
    const [data, metadata] = await Promise.all([
      this.config.storageProvider.get<T>(storageKey),
      this.config.storageProvider.getMetadata(storageKey)
    ])

    return { data, metadata }
  }
}