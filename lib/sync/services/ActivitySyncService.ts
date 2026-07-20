/**
 * Activity Sync Service
 * Provides synchronized Activity operations with optimistic updates
 */

import { SyncEngine } from '../core/SyncEngine'
import { ConflictResolution, ConflictContext } from '../types'
import { ActivityLog } from '@/types'
import { ActivitySyncAdapter, ActivityLogSync, ActivityTemplateSync } from '../adapters/ActivitySyncAdapter'
import { ActivityService } from '@/lib/services/ActivityService'

export class ActivitySyncService {
  private syncEngine: SyncEngine
  private userId: string

  constructor(syncEngine: SyncEngine, userId: string) {
    this.syncEngine = syncEngine
    this.userId = userId

    // Register activity entities for synchronization
    this.registerSyncEntities()
  }

  private registerSyncEntities(): void {
    // Register ActivityLog entity
    this.syncEngine.registerEntity({
      entityType: 'activityLog',
      syncInterval: 30000, // 30 seconds
      priority: 'high', // High priority
      conflictResolver: (context: ConflictContext) =>
        this.resolveActivityLogConflict(context as ConflictContext<ActivityLogSync>),
      enableRealtime: true
    })

    // Register ActivityTemplate entity
    this.syncEngine.registerEntity({
      entityType: 'activityTemplate',
      syncInterval: 60000, // 1 minute
      priority: 'high', // High priority
      conflictResolver: (context: ConflictContext) =>
        this.resolveActivityTemplateConflict(context as ConflictContext<ActivityTemplateSync>),
      enableRealtime: true
    })
  }

  /**
   * Create activity log with optimistic update
   */
  async createLog(data: {
    activityId: string
    date: string
    status: string
    note?: string | null
    amount?: number | null
    payload?: unknown
  }): Promise<ActivityLog> {
    // Generate temporary ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`
    
    // Create optimistic ActivityLog object
    const optimisticLog: ActivityLog = {
      id: tempId,
      activityId: data.activityId,
      date: data.date,
      note: data.note || null,
      status: data.status,
      amount: data.amount || null,
      payload: data.payload || null,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Convert to sync format
    const syncData = ActivitySyncAdapter.activityLogToSync(optimisticLog, this.userId)

    try {
      // Apply optimistic update immediately
      await this.syncEngine.optimisticUpdate(
        'activityLog',
        tempId,
        syncData,
        'create'
      )

      // Return optimistic result immediately for UI responsiveness
      return optimisticLog
    } catch (error) {
      console.error('[ActivitySyncService] Failed to create log optimistically:', error)
      
      // Fallback to direct service call
      const log = await ActivityService.logActivity({
        userId: this.userId,
        templateId: data.activityId,
        date: data.date,
        status: data.status,
        note: data.note,
        amount: data.amount,
        payload: data.payload
      })
      return {
        ...log,
        date: log.logDate.toISOString().split('T')[0]
      }
    }
  }

  /**
   * Update activity log with optimistic update
   */
  async updateLog(
    id: string,
    data: {
      status?: string
      note?: string | null
      amount?: number | null
      payload?: unknown
    }
  ): Promise<ActivityLog> {
    // Get existing log
    const { data: existingData } = await this.syncEngine.getEntity<ActivityLogSync>('activityLog', id)
    
    if (!existingData) {
      throw new Error('Activity log not found')
    }

    // Create updated data
    const updatedSync: ActivityLogSync = {
      ...existingData,
      status: data.status ?? existingData.status,
      note: data.note !== undefined ? data.note : existingData.note,
      amount: data.amount !== undefined ? data.amount : existingData.amount,
      payload: data.payload !== undefined ? data.payload : existingData.payload,
      lastModified: Date.now(),
      version: existingData.version + 1
    }

    try {
      // Apply optimistic update
      await this.syncEngine.optimisticUpdate(
        'activityLog',
        id,
        updatedSync,
        'update'
      )

      // Convert back to ActivityLog for return
      return ActivitySyncAdapter.syncToActivityLog(updatedSync)
    } catch (error) {
      console.error('[ActivitySyncService] Failed to update log optimistically:', error)
      
      // Fallback to direct service call
      const log = await ActivityService.updateLog(this.userId, id, data)
      return {
        ...log,
        date: log.logDate.toISOString().split('T')[0]
      }
    }
  }

  /**
   * Delete activity log with optimistic update
   */
  async deleteLog(id: string): Promise<void> {
    try {
      // Apply optimistic delete
      await this.syncEngine.optimisticUpdate(
        'activityLog',
        id,
        null,
        'delete'
      )
    } catch (error) {
      console.error('[ActivitySyncService] Failed to delete log optimistically:', error)
      
      // Fallback to direct service call
      await ActivityService.deleteLog(this.userId, id)
    }
  }

  /**
   * Get activity log with sync metadata
   */
  async getLog(id: string): Promise<{ log: ActivityLog | null; syncStatus: string }> {
    const { data, metadata } = await this.syncEngine.getEntity<ActivityLogSync>('activityLog', id)
    
    return {
      log: data ? ActivitySyncAdapter.syncToActivityLog(data) : null,
      syncStatus: metadata?.syncStatus || 'unknown'
    }
  }

  /**
   * List all activity logs with sync status
   */
  async listLogs(activityId?: string): Promise<Array<{ log: ActivityLog; syncStatus: string }>> {
    const entities = await this.syncEngine.listEntities<ActivityLogSync>('activityLog')
    
    return entities
      .filter(({ data }) => !activityId || data.activityId === activityId)
      .map(({ data, metadata }) => ({
        log: ActivitySyncAdapter.syncToActivityLog(data),
        syncStatus: metadata?.syncStatus || 'unknown'
      }))
      .sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime())
  }

  /**
   * Force sync activity logs
   */
  async syncLogs(): Promise<void> {
    await this.syncEngine.syncEntity('activityLog')
  }

  /**
   * Get sync statistics for activities
   */
  getSyncStats() {
    const stats = this.syncEngine.getStats()
    return {
      network: stats.network,
      queueSize: stats.queue.total,
      activityLogOperations: stats.queue.byEntityType['activityLog'] || 0,
      activityTemplateOperations: stats.queue.byEntityType['activityTemplate'] || 0,
      isOnline: stats.network === 'online'
    }
  }

  // Conflict resolution strategies

  /**
   * Resolve conflicts in activity logs
   * Strategy: Latest timestamp wins, but preserve important status changes
   */
  private async resolveActivityLogConflict(
    context: ConflictContext<ActivityLogSync>
  ): Promise<{ resolution: ConflictResolution; data?: ActivityLogSync }> {
    const { localData, remoteData } = context

    // If timestamps are close (within 5 seconds), prefer status changes
    const timeDiff = Math.abs(localData.lastModified - remoteData.lastModified)
    
    if (timeDiff < 5000) {
      // Prefer completion status over other statuses
      const completionStatuses = ['done', 'paid', 'completed']
      const localIsCompletion = completionStatuses.includes(localData.status)
      const remoteIsCompletion = completionStatuses.includes(remoteData.status)
      
      if (localIsCompletion && !remoteIsCompletion) {
        return { resolution: 'local' }
      }
      
      if (!localIsCompletion && remoteIsCompletion) {
        return { resolution: 'remote' }
      }
    }

    // Default: latest timestamp wins
    if (localData.lastModified > remoteData.lastModified) {
      return { resolution: 'local' }
    } else if (remoteData.lastModified > localData.lastModified) {
      return { resolution: 'remote' }
    } else {
      // Same timestamp: merge data, prefer non-null values
      const mergedData: ActivityLogSync = {
        ...remoteData,
        note: localData.note || remoteData.note,
        amount: localData.amount ?? remoteData.amount,
        payload: localData.payload || remoteData.payload,
        version: Math.max(localData.version, remoteData.version) + 1,
        lastModified: Date.now()
      }
      
      return { resolution: 'merge', data: mergedData }
    }
  }

  /**
   * Resolve conflicts in activity templates
   * Strategy: Latest timestamp wins, but preserve user customizations
   */
  private async resolveActivityTemplateConflict(
    context: ConflictContext<ActivityTemplateSync>
  ): Promise<{ resolution: ConflictResolution; data?: ActivityTemplateSync }> {
    const { localData, remoteData } = context

    // Templates are usually user-specific, so prefer local changes
    // unless remote has significant updates
    if (localData.lastModified > remoteData.lastModified) {
      return { resolution: 'local' }
    }

    // If remote is newer, check if it's a significant change
    const significantFields = ['name', 'category', 'isActive']
    const hasSignificantChanges = significantFields.some(
      field => localData[field as keyof ActivityTemplateSync] !== remoteData[field as keyof ActivityTemplateSync]
    )

    if (hasSignificantChanges) {
      // Merge user customizations with remote updates
      const mergedData: ActivityTemplateSync = {
        ...remoteData,
        // Preserve user customizations
        name: localData.name, // User likely customized the name
        color: localData.color, // User likely customized the color
        icon: localData.icon, // User likely customized the icon
        version: Math.max(localData.version, remoteData.version) + 1,
        lastModified: Date.now()
      }
      
      return { resolution: 'merge', data: mergedData }
    }

    return { resolution: 'remote' }
  }
}