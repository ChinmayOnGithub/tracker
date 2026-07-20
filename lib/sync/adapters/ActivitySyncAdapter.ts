/**
 * Activity Sync Adapter
 * Bridges the sync engine with Activity domain logic
 */

import { SyncOperation, SyncResult, NetworkAdapter, NetworkStatus, ConnectionQuality } from '../types'
import { ActivityLog, ActivityTemplate } from '@/types'

// Activity-specific sync data structures
export interface ActivityLogSync {
  id: string
  activityId: string
  date: string
  logDate?: Date
  note: string | null
  status: string
  amount: number | null
  payload: unknown | null
  userId: string
  lastModified: number
  version: number
}

export interface ActivityTemplateSync {
  id: string
  name: string
  category: string
  type: string
  icon: string
  color: string
  isActive: boolean
  userId: string
  lastModified: number
  version: number
}

export class ActivitySyncAdapter implements NetworkAdapter {
  private baseUrl: string

  constructor(baseUrl = '/api/sync') {
    this.baseUrl = baseUrl
  }

  async push<T>(batch: SyncBatch<T>): Promise<SyncResult<T>[]> {
    try {
      console.log(`[ActivitySyncAdapter] Pushing batch ${batch.id} with ${batch.operations.length} operations`)
      
      const response = await fetch(`${this.baseUrl}/activities/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operations: batch.operations }),
      })

      if (!response.ok) {
        throw new Error(`Push failed: ${response.status} ${response.statusText}`)
      }

      const { results } = await response.json()
      return results as SyncResult<T>[]
    } catch (error) {
      console.error('[ActivitySyncAdapter] Push failed:', error)
      
      // Return failed results for all operations
      return batch.operations.map(operation => ({
        operation,
        success: false,
        error: {
          category: 'network',
          code: 'PUSH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown push error',
          retryable: true
        },
        timing: {
          queuedAt: operation.createdAt,
          startedAt: Date.now(),
          completedAt: Date.now(),
          duration: 0
        }
      }))
    }
  }

  async pull(_entityType: string, lastSyncTime: number): Promise<SyncOperation[]> {
    try {
      console.log(`[ActivitySyncAdapter] Pulling changes since ${new Date(lastSyncTime).toISOString()}`)
      
      const response = await fetch(
        `${this.baseUrl}/activities/pull?since=${lastSyncTime}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status} ${response.statusText}`)
      }

      const { operations } = await response.json()
      return operations as SyncOperation[]
    } catch (error) {
      console.error('[ActivitySyncAdapter] Pull failed:', error)
      return []
    }
  }

  async connect(): Promise<void> {
    // No-op for HTTP adapter
  }

  async disconnect(): Promise<void> {
    // No-op for HTTP adapter
  }

  async isConnected(): Promise<boolean> {
    return await this.isOnline()
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return (await this.isOnline()) ? 'online' : 'offline'
  }

  async ping(): Promise<number> {
    const start = Date.now()
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      if (response.ok) {
        return Date.now() - start
      }
      throw new Error('Health check failed')
    } catch {
      return -1
    }
  }

  async getConnectionQuality(): Promise<ConnectionQuality> {
    const latency = await this.ping()
    return {
      latency: latency > 0 ? latency : 9999,
      bandwidth: 0, // Not implemented
      reliability: latency > 0 ? 1 : 0,
      lastTested: Date.now()
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })
      return response.ok
    } catch {
      return false
    }
  }

  getNetworkStatus() {
    // This would be implemented with more sophisticated network detection
    return (typeof navigator !== 'undefined' && navigator.onLine) ? 'online' : 'offline' as NetworkStatus
  }

  // Activity-specific helper methods

  /**
   * Convert ActivityLog to sync format
   */
  static activityLogToSync(log: ActivityLog, userId: string): ActivityLogSync {
    return {
      id: log.id,
      activityId: log.activityId,
      date: log.date,
      logDate: log.logDate,
      note: log.note,
      status: log.status,
      amount: log.amount,
      payload: log.payload,
      userId,
      lastModified: Date.now(),
      version: 1 // This would come from sync metadata
    }
  }

  /**
   * Convert ActivityTemplate to sync format
   */
  static activityTemplateToSync(template: ActivityTemplate, userId: string): ActivityTemplateSync {
    return {
      id: template.id,
      name: template.name,
      category: template.category,
      type: template.type,
      icon: template.icon,
      color: template.color,
      isActive: template.isActive,
      userId,
      lastModified: Date.now(),
      version: 1 // This would come from sync metadata
    }
  }

  /**
   * Convert sync format back to ActivityLog
   */
  static syncToActivityLog(sync: ActivityLogSync): ActivityLog {
    return {
      id: sync.id,
      activityId: sync.activityId,
      date: sync.date,
      logDate: sync.logDate,
      note: sync.note,
      status: sync.status,
      amount: sync.amount,
      payload: sync.payload,
      createdAt: new Date(), // This would be preserved from original
      updatedAt: new Date(sync.lastModified)
    }
  }

  /**
   * Convert sync format back to ActivityTemplate
   */
  static syncToActivityTemplate(sync: ActivityTemplateSync): Partial<Record<string, unknown>> {
    return {
      id: sync.id,
      name: sync.name,
      category: sync.category,
      type: sync.type as unknown,
      icon: sync.icon,
      color: sync.color,
      isActive: sync.isActive,
      updatedAt: new Date(sync.lastModified)
    }
  }
}