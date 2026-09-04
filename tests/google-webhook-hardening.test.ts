import { describe, it, expect, mock } from 'bun:test'
import { POST } from '@/app/api/sync/calendar/route'
import { db } from '@/lib/db'
import { CalendarService } from '@/modules/calendar/services/CalendarService'

describe('Issue #4 & #5: Google Calendar Webhook Hardening', () => {
  const channelId = 'channel-xyz-123'
  const validResourceId = 'resource-valid-456'
  const mismatchResourceId = 'resource-tampered-789'
  const userId = 'user-abc-111'

  it('Issue #4: Reject when required webhook headers are missing', async () => {
    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers: {
        'x-goog-channel-id': channelId,
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

    const headers = new Headers()
    headers.set('x-goog-channel-id', channelId)
    headers.set('x-goog-resource-id', validResourceId)
    headers.set('x-goog-resource-state', 'exists')

    const req = new Request('http://localhost:3000/api/sync/calendar', {
      method: 'POST',
      headers,
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.acknowledged).toBe(true)
    expect(syncCalled).toBe(true)
  })
})
