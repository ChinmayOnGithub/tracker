/**
 * React Hook for Sync Engine
 * Provides sync capabilities and status to React components
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { SyncedActivityService } from '@/lib/services/SyncedActivityService'

interface SyncStats {
  network: string
  queueSize: number
  activityLogOperations: number
  activityTemplateOperations: number
  isOnline: boolean
}

interface SyncHookReturn {
  // Sync status
  isOnline: boolean
  isSyncing: boolean
  syncStats: SyncStats
  lastSyncTime: number | null

  // Sync operations
  forceSync: () => Promise<void>
  
  // Activity operations with optimistic updates
  createActivityLog: (data: {
    activityId: string
    date: string
    status: string
    note?: string | null
    amount?: number | null
    payload?: unknown
  }) => Promise<void>

  updateActivityLog: (id: string, data: {
    status?: string
    note?: string | null
    amount?: number | null
    payload?: unknown
  }) => Promise<void>

  deleteActivityLog: (id: string) => Promise<void>
}

export function useSyncEngine(userId: string): SyncHookReturn {
  const [isOnline, setIsOnline] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStats, setSyncStats] = useState<SyncStats>({
    network: 'offline',
    queueSize: 0,
    activityLogOperations: 0,
    activityTemplateOperations: 0,
    isOnline: false
  })
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)

  // Initialize sync engine and set up event listeners
  useEffect(() => {
    let unsubscribeCallbacks: Array<() => void> = []

    const initializeSync = async () => {
      try {
        // Initialize the synced service
        await SyncedActivityService.initialize(userId)

        // Subscribe to sync events
        const unsubscribeNetworkStatus = SyncedActivityService.onSyncEvent(
          'network:statusChanged',
          ({ status }) => {
            setIsOnline(status === 'online')
            updateSyncStats()
          }
        )

        const unsubscribeSyncStarted = SyncedActivityService.onSyncEvent(
          'sync:started',
          () => {
            setIsSyncing(true)
          }
        )

        const unsubscribeSyncCompleted = SyncedActivityService.onSyncEvent(
          'sync:completed',
          () => {
            setIsSyncing(false)
            setLastSyncTime(Date.now())
            updateSyncStats()
          }
        )

        const unsubscribeSyncFailed = SyncedActivityService.onSyncEvent(
          'sync:failed',
          (error) => {
            setIsSyncing(false)
            console.error('[useSyncEngine] Sync failed:', error)
          }
        )

        unsubscribeCallbacks = [
          unsubscribeNetworkStatus,
          unsubscribeSyncStarted,
          unsubscribeSyncCompleted,
          unsubscribeSyncFailed
        ]

        // Initial stats update
        updateSyncStats()
      } catch (error) {
        console.error('[useSyncEngine] Failed to initialize:', error)
      }
    }

    const updateSyncStats = () => {
      const stats = SyncedActivityService.getSyncStats(userId)
      setSyncStats(stats)
      setIsOnline(stats.isOnline)
    }

    initializeSync()

    // Set up periodic stats updates
    const statsInterval = setInterval(updateSyncStats, 5000) // Update every 5 seconds

    return () => {
      // Cleanup subscriptions
      unsubscribeCallbacks.forEach(unsubscribe => unsubscribe())
      clearInterval(statsInterval)
    }
  }, [userId])

  // Force sync operation
  const forceSync = useCallback(async () => {
    try {
      setIsSyncing(true)
      await SyncedActivityService.forceSync(userId)
    } catch (error) {
      console.error('[useSyncEngine] Force sync failed:', error)
      throw error
    } finally {
      setIsSyncing(false)
    }
  }, [userId])

  // Activity operations with optimistic updates
  const createActivityLog = useCallback(async (data: {
    activityId: string
    date: string
    status: string
    note?: string | null
    amount?: number | null
    payload?: unknown
  }) => {
    try {
      await SyncedActivityService.logActivity({
        userId,
        templateId: data.activityId,
        date: data.date,
        status: data.status,
        note: data.note,
        amount: data.amount,
        payload: data.payload
      })
      
      // Update stats after operation
      setSyncStats(SyncedActivityService.getSyncStats(userId))
    } catch (error) {
      console.error('[useSyncEngine] Failed to create activity log:', error)
      throw error
    }
  }, [userId])

  const updateActivityLog = useCallback(async (id: string, data: {
    status?: string
    note?: string | null
    amount?: number | null
    payload?: unknown
  }) => {
    try {
      await SyncedActivityService.updateLog(userId, id, data)
      
      // Update stats after operation
      setSyncStats(SyncedActivityService.getSyncStats(userId))
    } catch (error) {
      console.error('[useSyncEngine] Failed to update activity log:', error)
      throw error
    }
  }, [userId])

  const deleteActivityLog = useCallback(async (id: string) => {
    try {
      await SyncedActivityService.deleteLog(userId, id)
      
      // Update stats after operation
      setSyncStats(SyncedActivityService.getSyncStats(userId))
    } catch (error) {
      console.error('[useSyncEngine] Failed to delete activity log:', error)
      throw error
    }
  }, [userId])

  return {
    isOnline,
    isSyncing,
    syncStats,
    lastSyncTime,
    forceSync,
    createActivityLog,
    updateActivityLog,
    deleteActivityLog
  }
}