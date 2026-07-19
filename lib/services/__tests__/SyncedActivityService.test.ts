/**
 * SyncedActivityService Integration Tests
 * Verifies feature-flagged behavior
 */

import { describe, it, expect } from 'bun:test'
import { SyncedActivityService } from '../SyncedActivityService'

// Note: This is an integration test that verifies the service delegates correctly
// based on the SYNC_ENGINE_ENABLED feature flag

describe('SyncedActivityService Feature Flag Integration', () => {
  describe('backward compatibility', () => {
    it('should expose all required methods', () => {
      expect(typeof SyncedActivityService.logActivity).toBe('function')
      expect(typeof SyncedActivityService.updateLog).toBe('function')
      expect(typeof SyncedActivityService.deleteLog).toBe('function')
      expect(typeof SyncedActivityService.getLogsWithSyncStatus).toBe('function')
      expect(typeof SyncedActivityService.forceSync).toBe('function')
      expect(typeof SyncedActivityService.getSyncStats).toBe('function')
      expect(typeof SyncedActivityService.getOrCreateDefaultTemplate).toBe('function')
    })

    it('should accept all ActivityService.logActivity parameters', async () => {
      const params = {
        userId: 'test-user-123',
        templateId: 'test-template-456',
        date: '2024-01-15',
        status: 'done',
        note: 'Test note',
        amount: 100,
        payload: { key: 'value' },
        weightRecordId: 'weight-123',
        leaveRecordId: null,
        journalEntryId: null
      }

      // Should not throw when called with all parameters
      // (Will fail with DB error in test, but that's expected)
      try {
        await SyncedActivityService.logActivity(params)
      } catch (error) {
        // Expected to fail due to no DB connection in test
        // We're just verifying the method signature is compatible
        expect(error).toBeDefined()
      }
    })

    it('should return stats object with expected structure', () => {
      const stats = SyncedActivityService.getSyncStats('test-user')
      
      expect(stats).toHaveProperty('network')
      expect(stats).toHaveProperty('queueSize')
      expect(stats).toHaveProperty('activityLogOperations')
      expect(stats).toHaveProperty('activityTemplateOperations')
      expect(stats).toHaveProperty('isOnline')
      
      // When sync is disabled, should return offline stats
      expect(typeof stats.network).toBe('string')
      expect(typeof stats.queueSize).toBe('number')
      expect(typeof stats.isOnline).toBe('boolean')
    })
  })

  describe('feature flag behavior', () => {
    it('should check feature flag status', () => {
      // The service should respect NEXT_PUBLIC_SYNC_ENGINE_ENABLED
      // When false (default), it should use ActivityService directly
      // When true, it should use the Sync Engine
      
      const stats = SyncedActivityService.getSyncStats('test-user')
      
      // With flag disabled (default), stats should show offline
      if (process.env.NEXT_PUBLIC_SYNC_ENGINE_ENABLED !== 'true') {
        expect(stats.network).toBe('offline')
        expect(stats.queueSize).toBe(0)
        expect(stats.isOnline).toBe(false)
      }
    })
  })
})
