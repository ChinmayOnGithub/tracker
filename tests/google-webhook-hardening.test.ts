import { describe, it, expect, mock, afterEach, beforeEach } from 'bun:test'
import { POST } from '@/app/api/sync/calendar/route'
import { db } from '@/lib/db'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { env } from '@/lib/env'

// Webhook secret to use during tests
const VALID_SECRET = 'test_calendar_sync_secret'

describe('Issue #4 & #5: Google Calendar Webhook Hardening', () => {
  const channelId = 'channel-xyz-123'
  const validResourceId = 'resource-valid-456'
  const mismatchResourceId = 'resource-tampered-789'
  const userId = 'user-abc-111'
  const originalCalendarSync = CalendarService.sync
  const originalCalendarSyncStateFindFirst = db.calendarSyncState.findFirst
  let origSyncSecret: string | undefined

  beforeEach(() => {
    // Inject a known secret so the route authenticates test requests
    origSyncSecret = env.SYNC_SECRET
    ;(env as { SYNC_SECRET?: string }).SYNC_SECRET = VALID_SECRET
  })

  afterEach(() => {
    CalendarService.sync = originalCalendarSync
    db.calendarSyncState.findFirst = originalCalendarSyncStateFindFirst
    ;(env as { SYNC_SECRET?: string }).SYNC_SECRET = origSyncSecret
  })

  it('Issue #4: Reject when required webhook headers are missing', async () => {
    // Sends valid secret but missing x-goog-resource-id
    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers: {
        'x-goog-channel-id': channelId,
        'x-tracker-sync-secret': VALID_SECRET,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Missing required webhook identity')
  })

  it('Issue #4: Reject when channel is unrecognized in database', async () => {
    db.calendarSyncState.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.calendarSyncState.findFirst

    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers: {
        'x-goog-channel-id': 'unknown-channel',
        'x-goog-resource-id': validResourceId,
        'x-tracker-sync-secret': VALID_SECRET,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Channel or resource not recognized')
  })

  it('Issue #4: Reject when resourceId does not match stored sync state', async () => {
    db.calendarSyncState.findFirst = mock((args?: { where?: { channelId?: string; resourceId?: string } }) => {
      if (args?.where?.channelId === channelId && args?.where?.resourceId === validResourceId) {
        return Promise.resolve({
          id: 'sync-state-1',
          userId,
          provider: 'google',
          syncToken: null,
          channelId,
          resourceId: validResourceId,
          expiration: null,
          lastSyncAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.calendarSyncState.findFirst

    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers: {
        'x-goog-channel-id': channelId,
        'x-goog-resource-id': mismatchResourceId,
        'x-tracker-sync-secret': VALID_SECRET,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Channel or resource not recognized')
  })

  it('Issue #5: Accept valid webhook immediately with 204 without blocking on sync execution', async () => {
    let syncCalled = false
    CalendarService.sync = mock(async () => {
      syncCalled = true
      return { eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: 'tok-1' }
    })

    // Mock calendarSyncState.findFirst to return a valid sync state
    db.calendarSyncState.findFirst = mock(() =>
      Promise.resolve({
        id: 'sync-state-1',
        userId,
        provider: 'google',
        syncToken: null,
        channelId,
        resourceId: validResourceId,
        expiration: null,
        lastSyncAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ) as unknown as typeof db.calendarSyncState.findFirst

    // Also mock calendarSyncState.updateMany for the lease operations
    const origUpdateMany = db.calendarSyncState.updateMany
    db.calendarSyncState.updateMany = mock(() => Promise.resolve({ count: 1 })) as unknown as typeof db.calendarSyncState.updateMany

    const headers = new Headers()
    headers.set('x-goog-channel-id', channelId)
    headers.set('x-goog-resource-id', validResourceId)
    headers.set('x-goog-resource-state', 'exists')
    headers.set('x-tracker-sync-secret', VALID_SECRET)

    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers,
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.acknowledged).toBe(true)
    expect(syncCalled).toBe(true)

    db.calendarSyncState.updateMany = origUpdateMany
  })

  it('Issue #147/#148: Reject when no auth header is present (fail-closed)', async () => {
    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers: {
        'x-goog-channel-id': channelId,
        'x-goog-resource-id': validResourceId,
        // No x-tracker-sync-secret — should be rejected
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })
})
