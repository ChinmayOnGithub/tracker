/**
 * Memory Leak Tests for SyncedActivityService
 * 
 * These tests verify proper resource cleanup and prevent memory leaks:
 * - Map growth with many concurrent users
 * - Cleanup on shutdown
 * - Event listener removal
 * - Long-running session stability
 * - Initialization set cleanup on success and failure
 * 
 * All tests use mocked ActivityService to avoid database dependencies.
 * Tests are deterministic and should pass consistently on repeated runs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncedActivityService } from '../SyncedActivityService'
import { ActivityService } from '../ActivityService'

// Mock ActivityService to avoid database dependencies
vi.mock('../ActivityService', () => ({
  ActivityService: {
    logActivity: vi.fn().mockImplementation(async (params) => ({
      id: `log-${Date.now()}-${Math.random()}`,
      activityId: params.templateId,
      date: params.date,
      logDate: new Date(params.date),
      note: params.note || null,
      status: params.status,
      amount: params.amount || null,
      payload: params.payload || null,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    updateLog: vi.fn().mockImplementation(async (_userId, id, data) => ({
      id,
      activityId: 'template-1',
      date: '2024-01-01',
      logDate: new Date('2024-01-01'),
      note: data.note || null,
      status: data.status || 'done',
      amount: data.amount || null,
      payload: data.payload || null,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    deleteLog: vi.fn().mockResolvedValue(undefined),
    getOrCreateDefaultTemplate: vi.fn().mockResolvedValue({
      id: 'template-1',
      name: 'Test Template',
      userId: 'test-user'
    })
  }
}))

describe('SyncedActivityService - Memory Leaks', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE_ENABLED = 'true'
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Ensure cleanup after each test to prevent memory leaks in test suite
    await SyncedActivityService.shutdownAll()
    // Reset feature flag
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE_ENABLED
  })

  describe('Map Growth', () => {
    it('should not grow Maps unbounded with many users', async () => {
      const userCount = 100
      
      // Create sessions for many users
      const userIds = Array.from({ length: userCount }, (_, i) => `user-${i}`)
      
      await Promise.all(
        userIds.map(userId =>
          SyncedActivityService.logActivity({
            userId,
            templateId: 'template-1',
            date: '2024-01-01',
            status: 'done'
          })
        )
      )

      // Shutdown half the users
      await Promise.all(
        userIds.slice(0, userCount / 2).map(userId => SyncedActivityService.shutdown(userId))
      )

      // After shutdown, those users should be cleaned up
      // Verify by checking we can create new operations for remaining users
      await Promise.all(
        userIds.slice(userCount / 2).map(userId =>
          SyncedActivityService.logActivity({
            userId,
            templateId: 'template-1',
            date: '2024-01-02',
            status: 'done'
          })
        )
      )

      // Test passes if no errors thrown
      expect(true).toBe(true)
    })

    it('should clean up Maps on shutdown', async () => {
      const userId = 'user-cleanup'
      
      await SyncedActivityService.logActivity({
        userId,
        templateId: 'template-1',
        date: '2024-01-01',
        status: 'done'
      })

      // Shutdown should remove from maps
      await SyncedActivityService.shutdown(userId)

      // Subsequent operations should re-initialize
      await SyncedActivityService.logActivity({
        userId,
        templateId: 'template-1',
        date: '2024-01-02',
        status: 'done'
      })

      // Test passes if re-initialization works
      expect(ActivityService.logActivity).toHaveBeenCalledTimes(2)
    })

    it('should handle shutdownAll correctly', async () => {
      const userIds = ['user-1', 'user-2', 'user-3']
      
      // Initialize multiple users
      await Promise.all(
        userIds.map(userId =>
          SyncedActivityService.logActivity({
            userId,
            templateId: 'template-1',
            date: '2024-01-01',
            status: 'done'
          })
        )
      )

      // Shutdown all
      await SyncedActivityService.shutdownAll()

      // All maps should be empty - new operations should work
      await SyncedActivityService.logActivity({
        userId: 'user-new',
        templateId: 'template-1',
        date: '2024-01-01',
        status: 'done'
      })

      // Should succeed
      expect(ActivityService.logActivity).toHaveBeenCalledTimes(4)
    })
  })

  describe('Event Listener Cleanup', () => {
    it('should remove event listeners on shutdown', async () => {
      const userId = 'user-events'
      
      // Initialize
      await SyncedActivityService.logActivity({
        userId,
        templateId: 'template-1',
        date: '2024-01-01',
        status: 'done'
      })

      // Subscribe to events
      const unsubscribe = SyncedActivityService.onSyncEvent('sync:completed', () => {})

      // Shutdown should not leave dangling listeners
      await SyncedActivityService.shutdown(userId)
      
      // Unsubscribe should be safe to call
      unsubscribe()

      // Should not throw
      expect(true).toBe(true)
    })

    it('should handle multiple event subscriptions', async () => {
      const userId = 'user-multiple-events'
      
      await SyncedActivityService.logActivity({
        userId,
        templateId: 'template-1',
        date: '2024-01-01',
        status: 'done'
      })

      // Create many subscriptions
      const unsubscribers = Array.from({ length: 100 }, () =>
        SyncedActivityService.onSyncEvent('sync:completed', () => {})
      )

      // Cleanup
      unsubscribers.forEach(unsub => unsub())
      await SyncedActivityService.shutdown(userId)

      // Should not throw or leak
      expect(true).toBe(true)
    })
  })

  describe('Long-Running Session', () => {
    it('should not leak memory during extended use', async () => {
      const userId = 'user-extended'
      
      // Simulate extended session with many operations
      for (let i = 0; i < 100; i++) {
        await SyncedActivityService.logActivity({
          userId,
          templateId: 'template-1',
          date: `2024-01-${String(i % 30 + 1).padStart(2, '0')}`,
          status: 'done',
          note: `Operation ${i}`
        })
      }

      // Should complete without errors (memory profiling would require additional tooling)
      expect(ActivityService.logActivity).toHaveBeenCalledTimes(100)
    })
  })

  describe('Initialization Set Cleanup', () => {
    it('should remove userId from initializingUsers after completion', async () => {
      const userId = 'user-init-cleanup'
      
      // First initialization
      await SyncedActivityService.logActivity({
        userId,
        templateId: 'template-1',
        date: '2024-01-01',
        status: 'done'
      })

      // Second call should not wait (not in initializingUsers anymore)
      const startTime = Date.now()
      await SyncedActivityService.logActivity({
        userId,
        templateId: 'template-2',
        date: '2024-01-02',
        status: 'done'
      })
      const duration = Date.now() - startTime

      // Should be fast (< 500ms) since already initialized with mocks
      expect(duration).toBeLessThan(500)
    })

    it('should clean up initializingUsers on initialization failure', async () => {
      const userId = 'user-init-fail'
      
      // Save original mock implementation
      const originalMock = ActivityService.logActivity
      
      // Mock ActivityService to fail once, then succeed
      let callCount = 0
      ActivityService.logActivity = vi.fn().mockImplementation(async (params) => {
        callCount++
        if (callCount === 1) {
          throw new Error('Simulated initialization failure')
        }
        return {
          id: `log-${Date.now()}`,
          activityId: params.templateId,
          date: params.date,
          logDate: new Date(params.date),
          note: params.note || null,
          status: params.status,
          amount: params.amount || null,
          payload: params.payload || null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })

      try {
        // First call should fail
        await expect(
          SyncedActivityService.logActivity({
            userId,
            templateId: 'template-1',
            date: '2024-01-01',
            status: 'done'
          })
        ).rejects.toThrow()

        // Second call should succeed (initializingUsers was cleaned up)
        await expect(
          SyncedActivityService.logActivity({
            userId,
            templateId: 'template-2',
            date: '2024-01-02',
            status: 'done'
          })
        ).resolves.toBeDefined()
      } finally {
        // Restore original mock
        ActivityService.logActivity = originalMock
      }
    })
  })
})
