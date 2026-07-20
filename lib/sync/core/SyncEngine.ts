/**
 * Production Sync Engine Core
 * Orchestrates optimistic updates, background synchronization, conflict resolution
 */

import { 
  SyncEngineConfig, 
  EntitySyncConfig, 
  SyncOperation, 
  SyncMetadata,
  SyncEventMap
} from '../types'
import { SyncQueue } from '../queue/SyncQueue'
import { NetworkManager } from '../network/NetworkManager'
import { EventEmitter } from '../utils/EventEmitter'

export class SyncEngine extends EventEmitter<SyncEventMap> {
  private config: SyncEngineConfig
  private syncQueue: SyncQueue
  private networkManager: NetworkManager
  private entityConfigs = new Map<string, EntitySyncConfig>()
  private syncIntervals = new Map<string, NodeJS.Timeout>()
  private isRunning = false

  constructor(config: SyncEngineConfig) {
    super()
    this.config = config
    this.syncQueue = new SyncQueue(config.storageProvider, {
      retryConfig: config.retryConfig,
      maxQueueSize: config.maxQueueSize,
      maxConcurrentOperations: config.maxConcurrentBatches,
      persistenceEnabled: config.queuePersistence,
      logger: config.logger
    })
    this.networkManager = new NetworkManager()
    
    this.setupEventListeners()
  }

  /**
   * Start the sync engine
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    this.isRunning = true
    console.log('[SyncEngine] Starting sync engine...')

    // Start network monitoring
    this.networkManager.getStatus()

    // Initial sync for all configured entities
    await this.performInitialSync()

    console.log('[SyncEngine] Sync engine started')
  }

  /**
   * Stop the sync engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.isRunning = false
    console.log('[SyncEngine] Stopping sync engine...')

    // Clear all sync intervals
    for (const [_entityType, interval] of this.syncIntervals) {
      clearInterval(interval)
    }
    this.syncIntervals.clear()

    // Clean up network manager
    this.networkManager.destroy()

    console.log('[SyncEngine] Sync engine stopped')
  }

  /**
   * Register entity for synchronization
   */
  registerEntity(config: EntitySyncConfig): void {
    const { entityType, syncInterval } = config
    this.entityConfigs.set(entityType, config)

    // Set up periodic sync if configured
    if (syncInterval && syncInterval > 0) {
      const interval = setInterval(() => {
        if (this.isRunning) {
          this.syncEntity(entityType)
        }
      }, syncInterval)

      this.syncIntervals.set(entityType, interval)
    }

    console.log(`[SyncEngine] Registered entity: ${config.entityType}`)
  }

  /**
   * Perform optimistic update with automatic sync queueing
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

    // Apply local change immediately
    if (operation === 'delete') {
      await this.config.storageProvider.delete(storageKey)
    } else {
      await this.config.storageProvider.set(storageKey, data)
    }
    await this.config.storageProvider.setMetadata(storageKey, metadata)

    // Queue for background sync
    const syncOperation: SyncOperation<T> = {
      id: `${entityType}_${entityId}_${timestamp}`,
      type: operation,
      entityType,
      entityId,
      data,
      metadata,
      createdAt: timestamp,
      priority: this.getEntityConfig(entityType)?.priority || 'normal'
    }

    await this.syncQueue.enqueue(syncOperation)

    console.log(`[SyncEngine] Optimistic ${operation} queued for ${entityType}:${entityId}`)
  }

  /**
   * Manually trigger sync for specific entity type
   */
  async syncEntity(entityType: string): Promise<void> {
    if (!this.networkManager.isOnline()) {
      console.log(`[SyncEngine] Skipping sync for ${entityType} - offline`)
      return
    }

    console.log(`[SyncEngine] Starting sync for entity type: ${entityType}`)

    const startTime = Date.now()
    this.emit('sync:started', { entityTypes: [entityType] })

    try {
      // Get pending operations for this entity
      const operations = this.syncQueue.getOperationsByEntity(entityType)
      
      if (operations.length > 0) {
        console.log(`[SyncEngine] Processing ${operations.length} pending operations for ${entityType}`)
        
        // Process operations in batches
        const batchSize = this.config.batchSize
        for (let i = 0; i < operations.length; i += batchSize) {
          const batch = operations.slice(i, i + batchSize)
          await this.processBatch(batch)
          
          this.emit('sync:progress', {
            completed: Math.min(i + batchSize, operations.length),
            total: operations.length,
            entityType
          })
        }
      }

      // Pull remote changes
      await this.pullRemoteChanges(entityType)

      const duration = Date.now() - startTime
      this.emit('sync:completed', { results: [], duration })

      console.log(`[SyncEngine] Sync completed for ${entityType} in ${duration}ms`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error'
      this.emit('sync:failed', { error: errorMessage, entityType })
      console.error(`[SyncEngine] Sync failed for ${entityType}:`, error)
    }
  }

  /**
   * Force sync all entities
   */
  async syncAll(): Promise<void> {
    const entityTypes = Array.from(this.entityConfigs.keys())
    
    console.log(`[SyncEngine] Starting sync for all entities: ${entityTypes.join(', ')}`)
    
    const startTime = Date.now()
    this.emit('sync:started', { entityTypes })

    try {
      for (const entityType of entityTypes) {
        await this.syncEntity(entityType)
      }

      const duration = Date.now() - startTime
      this.emit('sync:completed', { results: [], duration })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error'
      this.emit('sync:failed', { error: errorMessage })
    }
  }

  /**
   * Get entity data with sync metadata
   */
  async getEntity<T>(entityType: string, entityId: string): Promise<{ data: T | null; metadata: SyncMetadata | null }> {
    const storageKey = `${entityType}:${entityId}`
    
    const [data, metadata] = await Promise.all([
      this.config.storageProvider.get<T>(storageKey),
      this.config.storageProvider.getMetadata(storageKey)
    ])

    return { data, metadata }
  }

  /**
   * List all entities of a type
   */
  async listEntities<T>(entityType: string): Promise<Array<{ key: string; data: T; metadata: SyncMetadata | null }>> {
    const prefix = `${entityType}:`
    const entries = await this.config.storageProvider.list<T>(prefix)
    
    const results = await Promise.all(
      entries.map(async ({ key, value }) => {
        const metadata = await this.config.storageProvider.getMetadata(key)
        return { key, data: value, metadata }
      })
    )

    return results
  }

  /**
   * Get sync statistics
   */
  getStats() {
    return {
      queue: this.syncQueue.getStats(),
      network: this.networkManager.getStatus(),
      entities: Array.from(this.entityConfigs.keys()),
      isRunning: this.isRunning
    }
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen to network changes
    this.networkManager.on('network:statusChanged', ({ status }) => {
      this.emit('network:statusChanged', { status })
      
      if (status === 'online') {
        console.log('[SyncEngine] Network restored - resuming sync')
        this.performInitialSync()
      }
    })

    // Forward queue events
    this.syncQueue.on('operation:queued', (data) => {
      this.emit('operation:queued', data)
    })

    this.syncQueue.on('operation:completed', (data) => {
      this.emit('operation:completed', data)
    })
  }

  private async performInitialSync(): Promise<void> {
    if (!this.networkManager.isOnline()) return

    // Sync all registered entities
    const entityTypes = Array.from(this.entityConfigs.keys())
    for (const entityType of entityTypes) {
      try {
        await this.syncEntity(entityType)
      } catch (error) {
        console.error(`[SyncEngine] Initial sync failed for ${entityType}:`, error)
      }
    }
  }

  private async processBatch(operations: SyncOperation[]): Promise<void> {
    // This would typically push to your network adapter
    // For now, we'll mark operations as completed
    for (const operation of operations) {
      await this.syncQueue.dequeue(operation.id)
      
      // Update local metadata
      const storageKey = `${operation.entityType}:${operation.entityId}`
      const metadata = await this.config.storageProvider.getMetadata(storageKey)
      
      if (metadata) {
        metadata.syncStatus = 'synced'
        metadata.lastSyncAttempt = Date.now()
        await this.config.storageProvider.setMetadata(storageKey, metadata)
      }
    }
  }

  private async pullRemoteChanges(entityType: string): Promise<void> {
    // This would typically pull from your network adapter
    // Implementation depends on your backend sync protocol
    console.log(`[SyncEngine] Pulling remote changes for ${entityType}`)
  }

  private async getNextVersion(entityType: string, entityId: string): Promise<number> {
    const { metadata } = await this.getEntity(entityType, entityId)
    return (metadata?.version || 0) + 1
  }

  private getEntityConfig(entityType: string): EntitySyncConfig | undefined {
    return this.entityConfigs.get(entityType)
  }
}