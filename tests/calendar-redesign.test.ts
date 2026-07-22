import { describe, it, expect, mock } from 'bun:test'
import { OccurrenceService } from '@/modules/calendar/services/OccurrenceService'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { CalendarRepository } from '@/modules/calendar/repositories/CalendarRepository'
import { CalendarEvent, CalendarEventType } from '@prisma/client'

describe('Calendar Module Redesign (Phase 1)', () => {
  describe('OccurrenceService', () => {
    it('should generate single event occurrences if they fall inside the range', () => {
      const mockEvent: CalendarEvent = {
        id: 'evt-1',
        userId: 'user-1',
        title: 'Single Event',
        description: 'Single event description',
        start: new Date('2026-07-23T10:00:00.000Z'),
        end: new Date('2026-07-23T11:00:00.000Z'),
        allDay: false,
        type: CalendarEventType.MEETING,
        status: 'confirmed',
        color: 'blue',
        trackerArtifactId: null,
        trackerArtifactType: null,
        externalId: null,
        externalProvider: null,
        etag: null,
        externalMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      const rangeStart = new Date('2026-07-23T00:00:00.000Z')
      const rangeEnd = new Date('2026-07-23T23:59:59.000Z')

      const occurrences = OccurrenceService.generateOccurrences([mockEvent], rangeStart, rangeEnd)
      expect(occurrences.length).toBe(1)
      expect(occurrences[0].eventId).toBe('evt-1')
      expect(occurrences[0].title).toBe('Single Event')
    })

    it('should not return single event occurrences if they fall outside the range', () => {
      const mockEvent: CalendarEvent = {
        id: 'evt-1',
        userId: 'user-1',
        title: 'Single Event',
        description: 'Single event description',
        start: new Date('2026-07-24T10:00:00.000Z'),
        end: new Date('2026-07-24T11:00:00.000Z'),
        allDay: false,
        type: CalendarEventType.MEETING,
        status: 'confirmed',
        color: 'blue',
        trackerArtifactId: null,
        trackerArtifactType: null,
        externalId: null,
        externalProvider: null,
        etag: null,
        externalMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      const rangeStart = new Date('2026-07-23T00:00:00.000Z')
      const rangeEnd = new Date('2026-07-23T23:59:59.000Z')

      const occurrences = OccurrenceService.generateOccurrences([mockEvent], rangeStart, rangeEnd)
      expect(occurrences.length).toBe(0)
    })

    it('should generate multiple occurrences for a DAILY recurrence rule', () => {
      const mockEvent: CalendarEvent = {
        id: 'evt-2',
        userId: 'user-1',
        title: 'Daily Meeting',
        description: 'Everyday description',
        start: new Date('2026-07-23T09:00:00.000Z'),
        end: new Date('2026-07-23T10:00:00.000Z'),
        allDay: false,
        type: CalendarEventType.MEETING,
        status: 'confirmed',
        color: 'green',
        trackerArtifactId: null,
        trackerArtifactType: null,
        externalId: null,
        externalProvider: null,
        etag: null,
        externalMetadata: { rrule: 'FREQ=DAILY' },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      const rangeStart = new Date('2026-07-23T00:00:00.000Z')
      const rangeEnd = new Date('2026-07-25T23:59:59.000Z') // 3 Days range

      const occurrences = OccurrenceService.generateOccurrences([mockEvent], rangeStart, rangeEnd)
      expect(occurrences.length).toBe(3)
      expect(occurrences[0].id).toBe('evt-2-2026-07-23')
      expect(occurrences[1].id).toBe('evt-2-2026-07-24')
      expect(occurrences[2].id).toBe('evt-2-2026-07-25')
    })
  })

  describe('CalendarService Task Scheduling', () => {
    it('should schedule tasks by creating a CalendarEvent in repository', async () => {
      const createdEvents: CalendarEvent[] = []
      
      // Mock repository calls
      CalendarRepository.findEventByArtifact = mock(() => Promise.resolve(null))
      CalendarRepository.createEvent = mock((userId, data) => {
        const evt = { id: 'evt-mock', userId, ...data } as unknown as CalendarEvent
        createdEvents.push(evt)
        return Promise.resolve(evt)
      })

      const taskEvent = await CalendarService.scheduleTask(
        'user-1',
        'task-1',
        'Finish Calendar Module',
        new Date('2026-07-23T14:00:00.000Z'),
        new Date('2026-07-23T15:00:00.000Z'),
        'indigo'
      )

      expect(taskEvent.trackerArtifactId).toBe('task-1')
      expect(taskEvent.trackerArtifactType).toBe('task')
      expect(taskEvent.title).toBe('Finish Calendar Module')
      expect(createdEvents.length).toBe(1)
    })
  })
})
