import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { CalendarRepository } from '@/modules/calendar/repositories/CalendarRepository'
import { GoogleCalendarService } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { calendarProviderRegistry } from '@/modules/calendar/providers/CalendarProvider'
import { db } from '@/lib/db'
import { CalendarSyncState } from '@prisma/client'

interface MockCallTracker {
  mock?: {
    calls: unknown[][]
  }
}

describe('Google Calendar Sync (Phase 2)', () => {
  beforeEach(() => {
    const mockList = GoogleCalendarService.listEventsWithSyncToken as unknown as MockCallTracker
    if (mockList && mockList.mock) {
      mockList.mock.calls.length = 0
    }
  })

  it('should trigger incremental sync when syncToken is present', async () => {
    db.googleCredential.count = mock(() => Promise.resolve(1)) as unknown as typeof db.googleCredential.count

    CalendarRepository.getSyncState = mock(() =>
      Promise.resolve({
        id: 'sync-1',
        userId: 'user-1',
        provider: 'google',
        syncToken: 'old-sync-token',
        channelId: null,
        resourceId: null,
        expiration: null,
        lastSyncAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    )

    const providerMock = {
      createExternalEvent: mock(() => Promise.resolve('')),
      updateExternalEvent: mock(() => Promise.resolve()),
      deleteExternalEvent: mock(() => Promise.resolve()),
      fullSync: mock(() => Promise.resolve({ eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: 'new-token' })),
      incrementalSync: mock(() => Promise.resolve({ eventsCreated: 1, eventsUpdated: 2, eventsDeleted: 0, nextSyncToken: 'next-token' })),
      watch: mock(() => Promise.resolve({ channelId: '', resourceId: '', expiration: new Date() })),
      stopWatch: mock(() => Promise.resolve()),
    }

    calendarProviderRegistry.register('GOOGLE', providerMock)

    CalendarRepository.updateSyncState = mock(() => Promise.resolve({} as CalendarSyncState))

    const syncResult = await CalendarService.sync('user-1')

    expect(syncResult.nextSyncToken).toBe('next-token')
    expect(providerMock.incrementalSync.mock.calls.length).toBe(1)
    expect(providerMock.fullSync.mock.calls.length).toBe(0)
  })

  it('should fall back to full sync when syncToken is absent', async () => {
    db.googleCredential.count = mock(() => Promise.resolve(1)) as unknown as typeof db.googleCredential.count
    CalendarRepository.getSyncState = mock(() => Promise.resolve(null))

    const providerMock = {
      createExternalEvent: mock(() => Promise.resolve('')),
      updateExternalEvent: mock(() => Promise.resolve()),
      deleteExternalEvent: mock(() => Promise.resolve()),
      fullSync: mock(() => Promise.resolve({ eventsCreated: 4, eventsUpdated: 1, eventsDeleted: 0, nextSyncToken: 'new-full-token' })),
      incrementalSync: mock(() => Promise.resolve({ eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: null })),
      watch: mock(() => Promise.resolve({ channelId: '', resourceId: '', expiration: new Date() })),
      stopWatch: mock(() => Promise.resolve()),
    }

    calendarProviderRegistry.register('GOOGLE', providerMock)
    CalendarRepository.updateSyncState = mock(() => Promise.resolve({} as CalendarSyncState))

    const syncResult = await CalendarService.sync('user-2')

    expect(syncResult.nextSyncToken).toBe('new-full-token')
    expect(providerMock.fullSync.mock.calls.length).toBe(1)
    expect(providerMock.incrementalSync.mock.calls.length).toBe(0)
  })
})
