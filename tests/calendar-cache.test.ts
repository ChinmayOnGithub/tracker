import { describe, it, expect, beforeEach } from 'bun:test'
import { CalendarCacheService, AgendaData } from '@/modules/calendar/services/CalendarCacheService'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'

describe('CalendarCacheService & Event Reconciliation', () => {
  beforeEach(() => {
    CalendarCacheService.invalidateAll()
  })

  it('should reconcile events by stable ID, updating existing and appending new ones', () => {
    const cached: ParsedCalendarEvent[] = [
      {
        id: 'evt-1',
        summary: 'Team Standup',
        start: '2026-09-01T09:00:00.000Z',
        end: '2026-09-01T09:30:00.000Z',
        isAllDay: false,
      },
      {
        id: 'evt-2',
        summary: 'Lunch with Client',
        start: '2026-09-01T12:00:00.000Z',
        end: '2026-09-01T13:00:00.000Z',
        isAllDay: false,
      },
    ]

    const fresh: ParsedCalendarEvent[] = [
      {
        id: 'evt-1',
        summary: 'Team Standup (Rescheduled)',
        start: '2026-09-01T09:30:00.000Z',
        end: '2026-09-01T10:00:00.000Z',
        isAllDay: false,
      },
      {
        id: 'evt-3',
        summary: '1:1 with Manager',
        start: '2026-09-01T15:00:00.000Z',
        end: '2026-09-01T15:45:00.000Z',
        isAllDay: false,
      },
    ]

    const reconciled = CalendarCacheService.reconcileEvents(cached, fresh)

    expect(reconciled.length).toBe(3)
    const evt1 = reconciled.find(e => e.id === 'evt-1')
    expect(evt1?.summary).toBe('Team Standup (Rescheduled)')
    expect(evt1?.start).toBe('2026-09-01T09:30:00.000Z')

    const evt2 = reconciled.find(e => e.id === 'evt-2')
    expect(evt2?.summary).toBe('Lunch with Client')

    const evt3 = reconciled.find(e => e.id === 'evt-3')
    expect(evt3?.summary).toBe('1:1 with Manager')
  })

  it('should correctly reconcile full agenda structures without duplicating items', () => {
    const cached: AgendaData = {
      today: [
        { id: 'g-1', summary: 'Product Review', start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z', isAllDay: false },
      ],
      tomorrow: [],
      upcoming: [],
    }

    const fresh: AgendaData = {
      today: [
        { id: 'g-1', summary: 'Product Review (Updated Room)', start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z', isAllDay: false },
        { id: 'g-2', summary: 'Design Sync', start: '2026-09-01T14:00:00.000Z', end: '2026-09-01T14:30:00.000Z', isAllDay: false },
      ],
      tomorrow: [
        { id: 'g-3', summary: 'Sprint Planning', start: '2026-09-02T10:00:00.000Z', end: '2026-09-02T11:30:00.000Z', isAllDay: false },
      ],
      upcoming: [],
    }

    const reconciled = CalendarCacheService.reconcileAgenda(cached, fresh)

    expect(reconciled.today.length).toBe(2)
    expect(reconciled.today[0].summary).toBe('Product Review (Updated Room)')
    expect(reconciled.tomorrow.length).toBe(1)
    expect(reconciled.tomorrow[0].summary).toBe('Sprint Planning')
  })

  it('should store and retrieve agendas in warm memory cache', async () => {
    const todayStr = '2026-09-01'
    const testAgenda: AgendaData = {
      today: [
        { id: 'evt-cached', summary: 'Cached Morning Workout', start: '2026-09-01T07:00:00.000Z', end: '2026-09-01T08:00:00.000Z', isAllDay: false },
      ],
      tomorrow: [],
      upcoming: [],
    }

    // 1. Initial check - cache miss
    const miss = await CalendarCacheService.getCachedAgenda(todayStr)
    expect(miss.data).toBeNull()
    expect(miss.isStale).toBe(true)

    // 2. Save into cache
    await CalendarCacheService.saveCachedAgenda(todayStr, testAgenda)

    // 3. Re-read - cache hit and fresh
    const hit = await CalendarCacheService.getCachedAgenda(todayStr)
    expect(hit.data).not.toBeNull()
    expect(hit.data?.today[0].summary).toBe('Cached Morning Workout')
    expect(hit.isStale).toBe(false)
  })

  it('should invalidate cache when invalidateAll is invoked', async () => {
    const todayStr = '2026-09-01'
    await CalendarCacheService.saveCachedAgenda(todayStr, {
      today: [],
      tomorrow: [],
      upcoming: [],
    })

    const before = await CalendarCacheService.getCachedAgenda(todayStr)
    expect(before.data).not.toBeNull()

    CalendarCacheService.invalidateAll()

    const after = await CalendarCacheService.getCachedAgenda(todayStr)
    expect(after.data).toBeNull()
  })
})
