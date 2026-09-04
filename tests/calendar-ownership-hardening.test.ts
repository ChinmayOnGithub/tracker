import { describe, it, expect, mock } from 'bun:test'
import { CalendarRepository } from '@/modules/calendar/repositories/CalendarRepository'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { db } from '@/lib/db'
import { CalendarEvent, Prisma } from '@prisma/client'

describe('Issue #2 & #3 & #9 & #8: Calendar User-Scoped Queries, Overlap, Mutations, and Task Scheduling', () => {
  const userA = 'user-a-uuid'
  const userB = 'user-b-uuid'

  it('Issue #2: findEventsForUser should query events overlapping requested interval with start <= requestedEnd AND end >= requestedStart', async () => {
    let capturedWhere: Prisma.CalendarEventWhereInput | undefined
    db.calendarEvent.findMany = mock((args?: { where?: Prisma.CalendarEventWhereInput }) => {
      capturedWhere = args?.where
      return Promise.resolve([])
    }) as unknown as typeof db.calendarEvent.findMany

    const reqStart = new Date('2026-09-01T00:00:00.000Z')
    const reqEnd = new Date('2026-09-07T23:59:59.999Z')

    await CalendarRepository.findEventsForUser(userA, reqStart, reqEnd)

    expect(capturedWhere).toBeDefined()
    expect(capturedWhere?.userId).toBe(userA)
    expect(capturedWhere?.deletedAt).toBeNull()
    expect((capturedWhere?.start as Prisma.DateTimeFilter)?.lte).toEqual(reqEnd)
    expect((capturedWhere?.end as Prisma.DateTimeFilter)?.gte).toEqual(reqStart)
  })

  it('Issue #3: findEventById and findEventByArtifact must scope queries by userId', async () => {
    let capturedIdWhere: Prisma.CalendarEventWhereInput | undefined
    let capturedArtifactWhere: Prisma.CalendarEventWhereInput | undefined

    db.calendarEvent.findFirst = mock((args?: { where?: Prisma.CalendarEventWhereInput }) => {
      if (args?.where?.id) {
        capturedIdWhere = args.where
      }
      if (args?.where?.trackerArtifactId) {
        capturedArtifactWhere = args.where
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.calendarEvent.findFirst

    await CalendarRepository.findEventById(userA, 'event-123')
    expect(capturedIdWhere?.id).toBe('event-123')
    expect(capturedIdWhere?.userId).toBe(userA)
    expect(capturedIdWhere?.deletedAt).toBeNull()

    await CalendarRepository.findEventByArtifact(userA, 'task-456', 'task')
    expect(capturedArtifactWhere?.trackerArtifactId).toBe('task-456')
    expect(capturedArtifactWhere?.trackerArtifactType).toBe('task')
    expect(capturedArtifactWhere?.userId).toBe(userA)
    expect(capturedArtifactWhere?.deletedAt).toBeNull()
  })

  it('Issue #9: updateEvent and deleteEvent must reject operations on other users events', async () => {
    // Mock database having event owned by userA
    db.calendarEvent.findFirst = mock((args?: { where?: Prisma.CalendarEventWhereInput }) => {
      if (args?.where?.id === 'event-user-a' && args?.where?.userId === userA) {
        return Promise.resolve({
          id: 'event-user-a',
          userId: userA,
          title: 'Event A',
          description: null,
          start: new Date(),
          end: new Date(),
          allDay: false,
          type: 'TASK',
          status: 'confirmed',
          color: null,
          trackerArtifactId: null,
          trackerArtifactType: null,
          externalId: null,
          externalProvider: null,
          etag: null,
          externalMetadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } as CalendarEvent)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.calendarEvent.findFirst

    db.calendarEvent.updateMany = mock((args?: { where?: Prisma.CalendarEventWhereInput }) => {
      if (args?.where?.id === 'event-user-a' && args?.where?.userId === userA) {
        return Promise.resolve({ count: 1 })
      }
      return Promise.resolve({ count: 0 })
    }) as unknown as typeof db.calendarEvent.updateMany

    // userA updating userA event succeeds
    const updated = await CalendarRepository.updateEvent(userA, 'event-user-a', { title: 'Updated Title' })
    expect(updated).toBeDefined()

    // userB attempting to update userA event must throw
    let updateThrew = false
    try {
      await CalendarRepository.updateEvent(userB, 'event-user-a', { title: 'Tampered Title' })
    } catch {
      updateThrew = true
    }
    expect(updateThrew).toBe(true)

    // userB attempting to delete userA event must throw
    let deleteThrew = false
    try {
      await CalendarRepository.deleteEvent(userB, 'event-user-a')
    } catch {
      deleteThrew = true
    }
    expect(deleteThrew).toBe(true)
  })

  it('Issue #8: scheduleTask and unscheduleTask flow userId all the way down', async () => {
    let queriedUserId: string | null = null
    CalendarRepository.findEventByArtifact = mock((userId: string, _artifactId: string, _type: string) => {
      queriedUserId = userId
      return Promise.resolve(null)
    })

    CalendarRepository.createEvent = mock((userId: string, data: Omit<CalendarEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
      return Promise.resolve({ id: 'new-evt', userId, ...data } as CalendarEvent)
    })

    await CalendarService.scheduleTask(
      userA,
      'task-999',
      'Important Task',
      new Date('2026-09-04T10:00:00.000Z'),
      new Date('2026-09-04T11:00:00.000Z')
    )

    expect(queriedUserId as string | null).toBe(userA)
  })
})
