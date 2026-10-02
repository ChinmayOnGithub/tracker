import { describe, it, expect } from 'bun:test'
import { OccurrenceService } from '../services/OccurrenceService'
import { CalendarEvent } from '@prisma/client'

describe('Calendar Recurrence & RFC 5545 Engine (#161)', () => {
  const baseEvent: CalendarEvent = {
    id: 'evt-rec-1',
    userId: 'user-1',
    title: 'Daily Standup',
    description: 'Engineering sync',
    start: new Date('2026-10-01T09:00:00.000Z'),
    end: new Date('2026-10-01T09:30:00.000Z'),
    allDay: false,
    color: '#6366f1',
    type: 'MEETING',
    status: 'confirmed',
    externalId: 'g-evt-1',
    externalProvider: 'GOOGLE',
    etag: 'etag-1',
    externalMetadata: {
      rrule: 'FREQ=DAILY;COUNT=5',
    },
    trackerArtifactId: null,
    trackerArtifactType: null,
    deletedAt: null,
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    updatedAt: new Date('2026-10-01T08:00:00.000Z'),
  }

  it('expands daily recurrence with COUNT correctly', () => {
    const rangeStart = new Date('2026-10-01T00:00:00.000Z')
    const rangeEnd = new Date('2026-10-10T23:59:59.000Z')

    const occurrences = OccurrenceService.generateOccurrences([baseEvent], rangeStart, rangeEnd)

    expect(occurrences.length).toBe(5)
    expect(occurrences[0].start.toISOString()).toBe('2026-10-01T09:00:00.000Z')
    expect(occurrences[4].start.toISOString()).toBe('2026-10-05T09:00:00.000Z')
  })

  it('respects BYDAY filters (e.g. weekdays only MO,TU,WE,TH,FR)', () => {
    const weeklyEvent: CalendarEvent = {
      ...baseEvent,
      id: 'evt-rec-byday',
      start: new Date('2026-10-05T10:00:00.000Z'), // Monday
      end: new Date('2026-10-05T11:00:00.000Z'),
      externalMetadata: {
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
      },
    }

    const rangeStart = new Date('2026-10-01T00:00:00.000Z')
    const rangeEnd = new Date('2026-10-20T23:59:59.000Z')

    const occurrences = OccurrenceService.generateOccurrences([weeklyEvent], rangeStart, rangeEnd)

    expect(occurrences.length).toBe(6)
    // Oct 5 (Mon), Oct 7 (Wed), Oct 9 (Fri), Oct 12 (Mon), Oct 14 (Wed), Oct 16 (Fri)
    const dates = occurrences.map((o) => o.start.toISOString().slice(0, 10))
    expect(dates).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
    ])
  })

  it('excludes dates specified in EXDATE exceptions', () => {
    const eventWithExdate: CalendarEvent = {
      ...baseEvent,
      id: 'evt-rec-exdate',
      start: new Date('2026-10-01T09:00:00.000Z'),
      end: new Date('2026-10-01T09:30:00.000Z'),
      externalMetadata: {
        recurrence: [
          'RRULE:FREQ=DAILY;COUNT=5',
          'EXDATE:20261003T090000Z', // Skip Oct 3
        ],
      },
    }

    const rangeStart = new Date('2026-10-01T00:00:00.000Z')
    const rangeEnd = new Date('2026-10-10T23:59:59.000Z')

    const occurrences = OccurrenceService.generateOccurrences([eventWithExdate], rangeStart, rangeEnd)

    const dates = occurrences.map((o) => o.start.toISOString().slice(0, 10))
    expect(dates).not.toContain('2026-10-03')
    expect(dates).toContain('2026-10-01')
    expect(dates).toContain('2026-10-02')
    expect(dates).toContain('2026-10-04')
    expect(dates).toContain('2026-10-05')
    expect(occurrences.length).toBe(4)
  })

  it('bounds occurrences to rangeStart and rangeEnd', () => {
    const rangeStart = new Date('2026-10-03T00:00:00.000Z')
    const rangeEnd = new Date('2026-10-04T23:59:59.000Z')

    const occurrences = OccurrenceService.generateOccurrences([baseEvent], rangeStart, rangeEnd)

    expect(occurrences.length).toBe(2)
    const dates = occurrences.map((o) => o.start.toISOString().slice(0, 10))
    expect(dates).toEqual(['2026-10-03', '2026-10-04'])
  })
})
