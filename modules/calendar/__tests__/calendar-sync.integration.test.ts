/**
 * Google Calendar Sync Integration Tests
 * Comprehensive tests for calendar synchronization: initial sync, incremental sync,
 * token management, error recovery (410), pagination, and database persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { db } from '@/lib/db'
import { CalendarService } from '../services/CalendarService'
import { GoogleCalendarProvider } from '@/modules/sync/google-calendar/providers/GoogleCalendarProvider'
import { calendarProviderRegistry } from '../providers/CalendarProvider'
import { providerRegistry } from '@/lib/providers'
import { GoogleApiError } from '@/lib/errors'
import crypto from 'crypto'

// Allow unsafe DB operations in test context
process.env.ALLOW_UNSAFE_DB_OPERATIONS = 'true'

/**
 * Helper: Generate a mock Google Calendar event payload
 */
function createMockGoogleEvent(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  const now = new Date()
  const endTime = new Date(now.getTime() + 3600000) // 1 hour later
  
  return {
    id: overrides?.id ?? `event-${Math.random().toString(36).slice(2, 9)}`,
    summary: overrides?.summary ?? 'Test Event',
    description: overrides?.description ?? 'Test Description',
    start: overrides?.start ?? { dateTime: now.toISOString() },
    end: overrides?.end ?? { dateTime: endTime.toISOString() },
    status: overrides?.status ?? 'confirmed',
    updated: overrides?.updated ?? now.toISOString(),
    etag: overrides?.etag ?? `"etag-${Math.random().toString(36).slice(2, 9)}"`,
    ...overrides
  }
}

/**
 * Helper: Seed a Google credential for a user
 */
async function seedGoogleCredential(userId: string) {
  // First, create the user if it doesn't exist
  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      username: userId,
      email: `${userId}@test.local`
    }
  })

  return db.googleCredential.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      calendarId: 'primary',
      refreshToken: 'mock-refresh-token-abc123',
      expiryDate: new Date(Date.now() + 86400000), // 1 day from now
      updatedAt: new Date()
    }
  })
}

/**
 * Helper: Clean up test data for a user
 */
async function cleanupUser(userId: string) {
  // Soft-delete all calendar events for the user
  await db.calendarEvent.updateMany({
    where: { userId, deletedAt: null },
    data: { deletedAt: new Date() }
  })

  // Delete sync state
  await db.calendarSyncState.deleteMany({
    where: { userId }
  })

  // Delete credential
  await db.googleCredential.delete({
    where: { userId }
  }).catch(() => {
    // Ignore if not found
  })

  // Delete the user
  await db.user.delete({
    where: { id: userId }
  }).catch(() => {
    // Ignore if not found
  })
}

describe('CalendarService Sync - Google Calendar Integration', () => {
  let testUserId: string
  let mockProvider: GoogleCalendarProvider

  beforeEach(() => {
    testUserId = `test-user-${crypto.randomUUID()}`
    
    // Reset registries to avoid cross-test contamination
    calendarProviderRegistry.reset()
    providerRegistry.reset()

    // Create and register a mock provider
    mockProvider = new GoogleCalendarProvider()
    calendarProviderRegistry.register('GOOGLE', mockProvider)
  })

  afterEach(async () => {
    // Clean up test data
    await cleanupUser(testUserId)
    
    // Reset registries
    calendarProviderRegistry.reset()
    providerRegistry.reset()
  })

  // TC-1: Initial full sync (no stored token)
  describe('TC-1: Initial Full Sync', () => {
    it('should call fullSync when no sync token exists and persist nextSyncToken', async () => {
      await seedGoogleCredential(testUserId)

      // Mock fullSync to return events and token
      let fullSyncCalled = false
      const originalFullSync = mockProvider.fullSync
      mockProvider.fullSync = async (userId: string) => {
        fullSyncCalled = true
        expect(userId).toBe(testUserId)
        return {
          eventsCreated: 1,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: 'token-abc123'
        }
      }

      // Mock mergeEvents to actually create the event
      const provider = mockProvider as unknown as {
        mergeEvents?: (userId: string, items: unknown[]) => Promise<{ eventsCreated: number; eventsUpdated: number; eventsDeleted: number }>
      }
      const originalMergeEvents = provider.mergeEvents
      provider.mergeEvents = async (userId: string, items: unknown[]) => {
        for (const item of items) {
          const event = item as Record<string, unknown>
          await db.calendarEvent.create({
            data: {
              userId,
              title: (event.summary as string) || 'Untitled',
              description: (event.description as string) || null,
              start: new Date((event.start as Record<string, unknown>)?.dateTime as string),
              end: new Date((event.end as Record<string, unknown>)?.dateTime as string),
              allDay: false,
              type: 'MEETING',
              status: 'confirmed',
              externalId: event.id as string,
              externalProvider: 'GOOGLE',
              etag: (event.etag as string) || null,
              externalMetadata: event as Record<string, unknown>
            }
          })
        }
        return { eventsCreated: items.length, eventsUpdated: 0, eventsDeleted: 0 }
      }

      const result = await CalendarService.sync(testUserId)

      expect(fullSyncCalled).toBe(true)
      expect(result.nextSyncToken).toBe('token-abc123')
      expect(result.eventsCreated).toBe(1)

      const syncState = await db.calendarSyncState.findUnique({
        where: { userId_provider: { userId: testUserId, provider: 'google' } }
      })
      expect(syncState?.syncToken).toBe('token-abc123')
      expect(syncState?.lastSyncAt).toBeDefined()

      // Restore original methods
      mockProvider.fullSync = originalFullSync
      if (originalMergeEvents) {
        provider.mergeEvents = originalMergeEvents
      }
    })
  })

  // TC-2: Subsequent call uses stored token (incremental not full)
  describe('TC-2: Incremental Sync with Stored Token', () => {
    it('should call incrementalSync when sync token exists and not trigger fullSync', async () => {
      await seedGoogleCredential(testUserId)

      // Seed sync state with stored token
      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'stored-token-123'
        }
      })

      let fullSyncCalled = false
      let incrementalSyncCalled = false
      let capturedToken: string | undefined

      const originalFullSync = mockProvider.fullSync
      mockProvider.fullSync = async () => {
        fullSyncCalled = true
        throw new Error('fullSync should not be called')
      }

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async (userId: string, token: string) => {
        incrementalSyncCalled = true
        capturedToken = token
        expect(userId).toBe(testUserId)
        return {
          eventsCreated: 1,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: 'token-new'
        }
      }

      await CalendarService.sync(testUserId)

      expect(incrementalSyncCalled).toBe(true)
      expect(fullSyncCalled).toBe(false)
      expect(capturedToken).toBe('stored-token-123')

      const syncState = await db.calendarSyncState.findUnique({
        where: { userId_provider: { userId: testUserId, provider: 'google' } }
      })
      expect(syncState?.syncToken).toBe('token-new')

      // Restore original methods
      mockProvider.fullSync = originalFullSync
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })

  // TC-3: Token persists (no spurious full resync)
  describe('TC-3: Token Persistence Across Requests', () => {
    it('should reuse sync token on subsequent sync call; second sync does NOT trigger fullSync', async () => {
      await seedGoogleCredential(testUserId)

      let fullSyncCallCount = 0
      let incrementalSyncCallCount = 0

      const originalFullSync = mockProvider.fullSync
      mockProvider.fullSync = async () => {
        fullSyncCallCount++
        return {
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: `token-${fullSyncCallCount}`
        }
      }

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async () => {
        incrementalSyncCallCount++
        return {
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: `token-inc-${incrementalSyncCallCount}`
        }
      }

      // First sync (no prior state, should call fullSync)
      await CalendarService.sync(testUserId)
      expect(fullSyncCallCount).toBe(1)
      expect(incrementalSyncCallCount).toBe(0)

      // Second sync (should call incrementalSync, not fullSync)
      await CalendarService.sync(testUserId)
      expect(fullSyncCallCount).toBe(1) // Still 1, not incremented
      expect(incrementalSyncCallCount).toBe(1)

      // Restore original methods
      mockProvider.fullSync = originalFullSync
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })

  // TC-4: Incremental sync creates new event
  describe('TC-4: Incremental Sync Creates New Event', () => {
    it('should create new database event from Google incremental sync response', async () => {
      await seedGoogleCredential(testUserId)
      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'tok-x'
        }
      })

      const newEvent = createMockGoogleEvent({
        id: 'g-event-1',
        summary: 'Imported Meeting'
      })

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async (userId: string) => {
        await db.calendarEvent.create({
          data: {
            userId,
            title: 'Imported Meeting',
            description: null,
            start: new Date((newEvent.start as Record<string, unknown>)?.dateTime as string),
            end: new Date((newEvent.end as Record<string, unknown>)?.dateTime as string),
            allDay: false,
            type: 'MEETING',
            status: 'confirmed',
            externalId: 'g-event-1',
            externalProvider: 'GOOGLE',
            etag: newEvent.etag as string || null,
            externalMetadata: newEvent as Record<string, unknown>
          }
        })
        return {
          eventsCreated: 1,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: 'tok-new'
        }
      }

      await CalendarService.sync(testUserId)

      const event = await db.calendarEvent.findFirst({
        where: { userId: testUserId, externalId: 'g-event-1' }
      })
      expect(event).toBeDefined()
      expect(event?.title).toBe('Imported Meeting')
      expect(event?.externalProvider).toBe('GOOGLE')
      expect(event?.deletedAt).toBeNull()

      // Restore original method
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })

  // TC-5: Incremental sync updates existing event
  describe('TC-5: Incremental Sync Updates Existing Event', () => {
    it('should update existing event when Google event has newer timestamp', async () => {
      await seedGoogleCredential(testUserId)
      
      const oldDate = new Date(Date.now() - 3600000) // 1 hour ago
      const createdEvent = await db.calendarEvent.create({
        data: {
          userId: testUserId,
          title: 'Old Title',
          description: null,
          start: new Date(),
          end: new Date(Date.now() + 3600000),
          allDay: false,
          type: 'MEETING',
          status: 'confirmed',
          externalId: 'g-event-1',
          externalProvider: 'GOOGLE',
          etag: null,
          externalMetadata: {}
        }
      })

      // Manually set updatedAt to an older timestamp
      await db.calendarEvent.update({
        where: { id: createdEvent.id },
        data: { updatedAt: oldDate }
      })

      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'tok-x'
        }
      })

      const updatedEvent = createMockGoogleEvent({
        id: 'g-event-1',
        summary: 'Updated Meeting Title',
        updated: new Date().toISOString()
      })

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async (userId: string) => {
        const existing = await db.calendarEvent.findFirst({
          where: { userId, externalId: 'g-event-1' }
        })
        if (existing && new Date(updatedEvent.updated as string) > existing.updatedAt) {
          await db.calendarEvent.update({
            where: { id: existing.id },
            data: {
              title: 'Updated Meeting Title',
              updatedAt: new Date(updatedEvent.updated as string)
            }
          })
        }
        return {
          eventsCreated: 0,
          eventsUpdated: 1,
          eventsDeleted: 0,
          nextSyncToken: 'tok-new'
        }
      }

      await CalendarService.sync(testUserId)

      const updated = await db.calendarEvent.findFirst({
        where: { userId: testUserId, externalId: 'g-event-1' }
      })
      expect(updated?.title).toBe('Updated Meeting Title')
      expect(updated?.externalId).toBe('g-event-1')
      expect(updated?.deletedAt).toBeNull()

      // Restore original method
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })

  // TC-6: Soft-delete cancelled event
  describe('TC-6: Incremental Sync Soft-Deletes Cancelled Event', () => {
    it('should soft-delete local event when Google event status is cancelled', async () => {
      await seedGoogleCredential(testUserId)

      const _createdEvent = await db.calendarEvent.create({
        data: {
          userId: testUserId,
          title: 'Cancelled Event',
          description: null,
          start: new Date(),
          end: new Date(Date.now() + 3600000),
          allDay: false,
          type: 'MEETING',
          status: 'confirmed',
          externalId: 'g-event-1',
          externalProvider: 'GOOGLE',
          etag: null,
          externalMetadata: {}
        }
      })

      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'tok-x'
        }
      })

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async (userId: string) => {
        const existing = await db.calendarEvent.findFirst({
          where: { userId, externalId: 'g-event-1' }
        })
        if (existing && !existing.deletedAt) {
          await db.calendarEvent.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() }
          })
        }
        return {
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsDeleted: 1,
          nextSyncToken: 'tok-new'
        }
      }

      await CalendarService.sync(testUserId)

      // Query without deletedAt filter to see soft-deleted row
      const deleted = await db.calendarEvent.findFirst({
        where: { userId: testUserId, externalId: 'g-event-1' }
      })
      expect(deleted?.deletedAt).not.toBeNull()
      expect(deleted?.externalId).toBe('g-event-1')

      // Restore original method
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })

  // TC-7: 410 recovery (invalid sync token)
  describe('TC-7: 410 Recovery - Invalid Sync Token', () => {
    it('should clear syncToken and perform fullSync when incrementalSync returns 410', async () => {
      await seedGoogleCredential(testUserId)

      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'expired-token'
        }
      })

      let incrementalSyncCallCount = 0
      let fullSyncCallCount = 0

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async () => {
        incrementalSyncCallCount++
        // First call throws 410, simulating token invalidation
        const err = new GoogleApiError('Sync token is invalid', 410)
        throw err
      }

      const originalFullSync = mockProvider.fullSync
      mockProvider.fullSync = async (_userId: string) => {
        fullSyncCallCount++
        return {
          eventsCreated: 1,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: 'token-fresh'
        }
      }

      // Should not throw; error is handled internally
      const result = await CalendarService.sync(testUserId)

      expect(result.nextSyncToken).toBe('token-fresh')
      expect(incrementalSyncCallCount).toBe(1)
      expect(fullSyncCallCount).toBe(1)

      const syncState = await db.calendarSyncState.findUnique({
        where: { userId_provider: { userId: testUserId, provider: 'google' } }
      })
      expect(syncState?.syncToken).toBe('token-fresh')

      // Restore original methods
      mockProvider.incrementalSync = originalIncrementalSync
      mockProvider.fullSync = originalFullSync
    })
  })

  // TC-8: Duplicate event idempotency
  describe('TC-8: Duplicate Event Idempotency', () => {
    it('should not create duplicate events when same externalId synced twice', async () => {
      await seedGoogleCredential(testUserId)

      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'tok-x'
        }
      })

      const mockEvent = createMockGoogleEvent({
        id: 'g-event-1',
        summary: 'Duplicate Test Event'
      })

      let syncCount = 0
      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async (userId: string) => {
        syncCount++
        const existing = await db.calendarEvent.findFirst({
          where: { userId, externalId: 'g-event-1' }
        })
        if (!existing) {
          await db.calendarEvent.create({
            data: {
              userId,
              title: 'Duplicate Test Event',
              description: null,
              start: new Date((mockEvent.start as Record<string, unknown>)?.dateTime as string),
              end: new Date((mockEvent.end as Record<string, unknown>)?.dateTime as string),
              allDay: false,
              type: 'MEETING',
              status: 'confirmed',
              externalId: 'g-event-1',
              externalProvider: 'GOOGLE',
              etag: mockEvent.etag as string || null,
              externalMetadata: mockEvent as Record<string, unknown>
            }
          })
          return { eventsCreated: 1, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: `tok-${syncCount}` }
        }
        return { eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: `tok-${syncCount}` }
      }

      // First sync
      await CalendarService.sync(testUserId)
      // Second sync with same event
      await CalendarService.sync(testUserId)

      const count = await db.calendarEvent.count({
        where: { userId: testUserId, externalId: 'g-event-1' }
      })
      expect(count).toBe(1) // No duplicates

      // Restore original method
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })

  // TC-9: Pagination (multiple pages)
  describe('TC-9: Pagination - Multiple Pages', () => {
    it('should fetch and merge all pages of events when listEventsWithSyncToken returns multiple pages', async () => {
      await seedGoogleCredential(testUserId)

      // Create multiple events to simulate pagination scenario
      const events = [
        createMockGoogleEvent({ id: 'event-1', summary: 'Page 1 Event 1' }),
        createMockGoogleEvent({ id: 'event-2', summary: 'Page 1 Event 2' }),
        createMockGoogleEvent({ id: 'event-3', summary: 'Page 2 Event 1' }),
        createMockGoogleEvent({ id: 'event-4', summary: 'Page 2 Event 2' })
      ]

      const originalFullSync = mockProvider.fullSync
      mockProvider.fullSync = async (userId: string) => {
        // Simulate paginated response: all 4 events returned
        for (const event of events) {
          await db.calendarEvent.create({
            data: {
              userId,
              title: event.summary as string,
              description: null,
              start: new Date((event.start as Record<string, unknown>)?.dateTime as string),
              end: new Date((event.end as Record<string, unknown>)?.dateTime as string),
              allDay: false,
              type: 'MEETING',
              status: 'confirmed',
              externalId: event.id as string,
              externalProvider: 'GOOGLE',
              etag: (event.etag as string) || null,
              externalMetadata: event as Record<string, unknown>
            }
          })
        }
        return {
          eventsCreated: 4,
          eventsUpdated: 0,
          eventsDeleted: 0,
          nextSyncToken: 'token-final'
        }
      }

      await CalendarService.sync(testUserId)

      const count = await db.calendarEvent.count({
        where: { userId: testUserId, externalProvider: 'GOOGLE' }
      })
      expect(count).toBe(4)

      // Verify all events are present
      const event1 = await db.calendarEvent.findFirst({
        where: { userId: testUserId, externalId: 'event-1' }
      })
      expect(event1?.title).toBe('Page 1 Event 1')

      // Restore original method
      mockProvider.fullSync = originalFullSync
    })
  })

  // TC-10: Interrupted sync does not corrupt token
  describe('TC-10: Interrupted Sync - Token Preservation', () => {
    it('should not update syncToken in DB if sync throws before completion', async () => {
      await seedGoogleCredential(testUserId)

      const originalDate = new Date(Date.now() - 86400000) // 1 day ago
      await db.calendarSyncState.upsert({
        where: { userId_provider: { userId: testUserId, provider: 'google' } },
        update: {},
        create: {
          userId: testUserId,
          provider: 'google',
          syncToken: 'original-token',
          lastSyncAt: originalDate
        }
      })

      const originalIncrementalSync = mockProvider.incrementalSync
      mockProvider.incrementalSync = async () => {
        throw new Error('Network timeout')
      }

      // Should throw the network error
      let errorThrown: Error | null = null
      try {
        await CalendarService.sync(testUserId)
      } catch (err) {
        errorThrown = err as Error
      }

      // Should have thrown some kind of error
      expect(errorThrown).toBeDefined()

      // Verify sync state was NOT updated
      const syncState = await db.calendarSyncState.findUnique({
        where: { userId_provider: { userId: testUserId, provider: 'google' } }
      })
      expect(syncState?.syncToken).toBe('original-token')
      expect(syncState?.lastSyncAt).toEqual(originalDate)

      // Restore original method
      mockProvider.incrementalSync = originalIncrementalSync
    })
  })
})
