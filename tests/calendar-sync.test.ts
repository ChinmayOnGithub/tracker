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

  it('should handle HTTP 410 Gone error by wiping sync token and falling back to full sync', async () => {
    db.googleCredential.count = mock(() => Promise.resolve(1)) as unknown as typeof db.googleCredential.count

    CalendarRepository.getSyncState = mock(() =>
      Promise.resolve({
        id: 'sync-410',
        userId: 'user-410',
        provider: 'google',
        syncToken: 'expired-token-410',
        channelId: null,
        resourceId: null,
        expiration: null,
        lastSyncAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    )

    let clearedToken = false
    CalendarRepository.updateSyncState = mock((_userId: string, _provider: string, data: Partial<CalendarSyncState>) => {
      if (data.syncToken === null) {
        clearedToken = true
      }
      return Promise.resolve({ ...data } as CalendarSyncState)
    })

    const providerMock = {
      createExternalEvent: mock(() => Promise.resolve('')),
      updateExternalEvent: mock(() => Promise.resolve()),
      deleteExternalEvent: mock(() => Promise.resolve()),
      fullSync: mock(() => Promise.resolve({ eventsCreated: 5, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: 'brand-new-token-after-410' })),
      incrementalSync: mock(() => {
        const error = new Error('Sync token is invalid (HTTP 410)')
        ;(error as unknown as { statusCode: number }).statusCode = 410
        return Promise.reject(error)
      }),
      watch: mock(() => Promise.resolve({ channelId: '', resourceId: '', expiration: new Date() })),
      stopWatch: mock(() => Promise.resolve()),
    }

    calendarProviderRegistry.register('GOOGLE', providerMock)

    const syncResult = await CalendarService.sync('user-410')

    expect(providerMock.incrementalSync.mock.calls.length).toBe(1)
    expect(clearedToken).toBe(true)
    expect(providerMock.fullSync.mock.calls.length).toBe(1)
    expect(syncResult.nextSyncToken).toBe('brand-new-token-after-410')
  })

  it('should ensure and renew watch channel metadata cleanly', async () => {
    db.googleCredential.count = mock(() => Promise.resolve(1)) as unknown as typeof db.googleCredential.count

    CalendarRepository.getSyncState = mock(() => Promise.resolve(null)) // No active channel

    const expirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const providerMock = {
      createExternalEvent: mock(() => Promise.resolve('')),
      updateExternalEvent: mock(() => Promise.resolve()),
      deleteExternalEvent: mock(() => Promise.resolve()),
      fullSync: mock(() => Promise.resolve({ eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: '' })),
      incrementalSync: mock(() => Promise.resolve({ eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: '' })),
      watch: mock(() => Promise.resolve({ channelId: 'chan-uuid-1', resourceId: 'res-id-1', expiration: expirationDate })),
      stopWatch: mock(() => Promise.resolve()),
    }

    calendarProviderRegistry.register('GOOGLE', providerMock)

    let savedChannelId: string | null = null
    CalendarRepository.updateSyncState = mock((_u: string, _p: string, data: Partial<CalendarSyncState>) => {
      savedChannelId = data.channelId || null
      return Promise.resolve({ ...data } as CalendarSyncState)
    })

    const watch = await CalendarService.ensureWatchChannel('user-watch')

    expect(watch?.channelId).toBe('chan-uuid-1')
    expect(watch?.resourceId).toBe('res-id-1')
    expect(savedChannelId as string | null).toBe('chan-uuid-1')
    expect(providerMock.watch.mock.calls.length).toBe(1)
  })
})
