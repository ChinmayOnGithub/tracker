/**
 * Synced Activity Service
 * Drop-in replacement for ActivityService with sync capabilities
 * Preserves all existing business logic while adding sync features
 */

import { ActivityService } from './ActivityService'
import { SyncEngine } from '../sync/core/SyncEngine'
import { ActivitySyncService } from '../sync/services/ActivitySyncService'
import { MemoryStorageProvider } from '../sync/storage/MemoryStorageProvider'
import { ActivitySyncAdapter } from '../sync/adapters/ActivitySyncAdapter'
import { ActivityLog } from '@/types'
import { isFeatureEnabled } from '@/lib/feature-flags'

class SyncedActivityServiceImpl {
  private syncEngineByUser = new Map<string, SyncEngine>()
  private activitySyncServiceByUser = new Map<string, ActivitySyncService>()
  private initializingUsers = new Set<string>()

  /**
   * Check if sync is enabled
   */
  private isSyncEnabled(): boolean {
    return isFeatureEnabled('SYNC_ENGINE_ENABLED')
  }

  /**
   * Initialize sync engine for a user (server-side only falls back, client-side uses the engine)
   */
  private async ensureInitialized(userId: string): Promise<void> {
    if (!this.isSyncEnabled()) return

    // Check if already initialized
    if (this.syncEngineByUser.has(userId)) return

    // Prevent concurrent initialization
    if (this.initializingUsers.has(userId)) {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100))
      return this.ensureInitialized(userId)
    }

    this.initializingUsers.add(userId)

    try {
      console.log(`[SyncedActivityService] Initializing sync for user ${userId}`)

      // Create storage provider (using memory for now, can be swapped for IndexedDB/SQLite)
      const storageProvider = new MemoryStorageProvider()

      // Create network adapter
      const networkAdapter = new ActivitySyncAdapter()

      // Create sync engine
      const syncEngine = new SyncEngine({
        batchSize: 10,
        batchTimeoutMs: 30000,
        maxConcurrentBatches: 3,
        retryConfig: {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          strategy: 'exponential',
          jitter: true,
          backoffMultiplier: 2,
          retryableErrors: ['network', 'internal', 'rate_limit']
        },
        networkTimeout: 10000,
        connectionPoolSize: 5,
        maxQueueSize: 1000,
        queuePersistence: true,
        priorityLevels: 5,
        enableOptimisticUpdates: true,
        enableConflictResolution: true,
        enableCompression: false,
        enableEncryption: false,
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        cleanupInterval: 300000, // 5 minutes
        metadataRetention: 86400000, // 24 hours
        metricsInterval: 60000, // 1 minute
        enableDetailedMetrics: true,
        storageProvider,
        networkAdapter
      })

      // Create activity sync service
      const activitySyncService = new ActivitySyncService(syncEngine, userId)

      // Start sync engine
      await syncEngine.start()

      this.syncEngineByUser.set(userId, syncEngine)
      this.activitySyncServiceByUser.set(userId, activitySyncService)

      console.log(`[SyncedActivityService] Sync initialized for user ${userId}`)
    } catch (error) {
      console.error('[SyncedActivityService] Failed to initialize sync:', error)
      // Continue without sync capabilities
    } finally {
      this.initializingUsers.delete(userId)
    }
  }

  /**
   * Create activity log with sync
   * Falls back to original service if sync is unavailable
   */
  async logActivity(params: {
    userId: string
    templateId: string
    date: string
    status: string
    note?: string | null
    amount?: number | null
    payload?: unknown
    weightRecordId?: string | null
    leaveRecordId?: string | null
    journalEntryId?: string | null
  }): Promise<ActivityLog> {
    // If sync is disabled, use original service directly
    if (!this.isSyncEnabled()) {
      return await ActivityService.logActivity(params)
    }

    // Ensure sync is initialized
    await this.ensureInitialized(params.userId)

    // Try sync-enabled operation first
    const activitySyncService = this.activitySyncServiceByUser.get(params.userId)
    if (activitySyncService) {
      try {
        return await activitySyncService.createLog({
          activityId: params.templateId,
          date: params.date,
          status: params.status,
          note: params.note,
          amount: params.amount,
          payload: params.payload
        })
      } catch (error) {
        console.warn('[SyncedActivityService] Sync operation failed, falling back to direct service:', error)
      }
    }

    // Fallback to original service
    return await ActivityService.logActivity(params)
  }

  /**
   * Update activity log with sync
   */
  async updateLog(
    userId: string,
    id: string,
    data: {
      status?: string
      note?: string | null
      amount?: number | null
      payload?: unknown
    }
  ): Promise<ActivityLog> {
    // If sync is disabled, use original service directly
    if (!this.isSyncEnabled()) {
      return await ActivityService.updateLog(userId, id, data)
    }

    // Ensure sync is initialized
    await this.ensureInitialized(userId)

    // Try sync-enabled operation first
    const activitySyncService = this.activitySyncServiceByUser.get(userId)
    if (activitySyncService) {
      try {
        return await activitySyncService.updateLog(id, data)
      } catch (error) {
        console.warn('[SyncedActivityService] Sync update failed, falling back to direct service:', error)
      }
    }

    // Fallback to original service
    return await ActivityService.updateLog(userId, id, data)
  }

  /**
   * Delete activity log with sync
   */
  async deleteLog(userId: string, logId: string): Promise<void> {
    // If sync is disabled, use original service directly
    if (!this.isSyncEnabled()) {
      return await ActivityService.deleteLog(userId, logId)
    }

    // Ensure sync is initialized
    await this.ensureInitialized(userId)

    // Try sync-enabled operation first
    const activitySyncService = this.activitySyncServiceByUser.get(userId)
    if (activitySyncService) {
      try {
        await activitySyncService.deleteLog(logId)
        return
      } catch (error) {
        console.warn('[SyncedActivityService] Sync delete failed, falling back to direct service:', error)
      }
    }

    // Fallback to original service
    return await ActivityService.deleteLog(userId, logId)
  }

  /**
   * Get activity logs with sync status
   */
  async getLogsWithSyncStatus(userId: string, activityId?: string) {
    if (!this.isSyncEnabled()) return []

    await this.ensureInitialized(userId)

    const activitySyncService = this.activitySyncServiceByUser.get(userId)
    if (activitySyncService) {
      try {
        return await activitySyncService.listLogs(activityId)
      } catch (error) {
        console.warn('[SyncedActivityService] Failed to get synced logs:', error)
      }
    }

    return []
  }

  /**
   * Force sync all activity data
   */
  async forceSync(userId: string): Promise<void> {
    if (!this.isSyncEnabled()) return

    await this.ensureInitialized(userId)

    const activitySyncService = this.activitySyncServiceByUser.get(userId)
    if (activitySyncService) {
      await activitySyncService.syncLogs()
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats(userId: string) {
    if (!this.isSyncEnabled()) {
      return {
        network: 'offline',
        queueSize: 0,
        activityLogOperations: 0,
        activityTemplateOperations: 0,
        isOnline: false
      }
    }

    const activitySyncService = this.activitySyncServiceByUser.get(userId)
    if (!activitySyncService) {
      return {
        network: 'offline',
        queueSize: 0,
        activityLogOperations: 0,
        activityTemplateOperations: 0,
        isOnline: false
      }
    }

    return activitySyncService.getSyncStats()
  }

  /**
   * Subscribe to sync events
   */
  onSyncEvent(userId: string, event: string, callback: (data: unknown) => void): () => void {
    if (!this.isSyncEnabled()) {
      return () => {} // No-op unsubscribe
    }

    const syncEngine = this.syncEngineByUser.get(userId)
    if (!syncEngine) {
      return () => {} // No-op unsubscribe
    }

    return syncEngine.on(event as keyof SyncEventMap, callback)
  }

  /**
   * Gracefully shutdown sync for a user
   */
  async shutdown(userId: string): Promise<void> {
    const syncEngine = this.syncEngineByUser.get(userId)
    if (syncEngine) {
      await syncEngine.stop()
      this.syncEngineByUser.delete(userId)
      this.activitySyncServiceByUser.delete(userId)
    }
  }

  /**
   * Gracefully shutdown all sync engines
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.syncEngineByUser.entries()).map(
      ([_userId, syncEngine]) => syncEngine.stop()
    )
    await Promise.all(shutdownPromises)
    this.syncEngineByUser.clear()
    this.activitySyncServiceByUser.clear()
  }

  // Proxy methods that don't need sync (delegate to original service)

  /**
   * Get or create default template (doesn't need sync)
   */
  async getOrCreateDefaultTemplate(
    userId: string,
    type: 'JOURNAL' | 'LEAVE' | 'PERSONAL',
    name: string,
    category: string,
    icon: string,
    color: string
  ) {
    return await ActivityService.getOrCreateDefaultTemplate(
      userId,
      type,
      name,
      category,
      icon,
      color
    )
  }
}

// Export singleton instance
export const SyncedActivityService = new SyncedActivityServiceImpl()