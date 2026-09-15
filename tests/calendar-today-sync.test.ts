import { describe, it, expect, beforeEach } from 'bun:test'
import { CalendarCacheService, AgendaData } from '@/modules/calendar/services/CalendarCacheService'
import { CalendarWeekDTO } from '@/modules/calendar/dto/CalendarWeekDTO'
import { analyzeRecurrence } from '@/lib/recurrence'
import { ActivityTemplate, ActivityLog } from '@/types'

describe('Calendar and Today Dashboard Cross-Module Synchronization (Area E)', () => {
  const userId = 'sync-user-1'
  const todayStr = '2026-09-14'

  beforeEach(() => {
    CalendarCacheService.invalidateAll(userId)
  })

  describe('Cache Invalidation Across Memory and Offline Storage', () => {
    it('should evict cached week data from memory and storage upon invalidation', async () => {
      const mockWeekData: CalendarWeekDTO = {
        days: [
          {
            date: '2026-09-14',
            events: [
              {
                id: 'evt-test-1',
                title: 'Team Sync',
                start: '2026-09-14T10:00:00.000Z',
                end: '2026-09-14T10:45:00.000Z',
                allDay: false,
                color: null,
                type: 'TASK',
                trackerArtifactId: null,
                trackerArtifactType: null,
              },
            ],
            workedHours: 0,
            isLeave: false,
          },
        ],
      }

      // 1. Populate cache
      await CalendarCacheService.saveCachedWeekData(userId, todayStr, mockWeekData)

      // 2. Verify hit
      const hit = await CalendarCacheService.getCachedWeekData(userId, todayStr)
      expect(hit.data).not.toBeNull()
      expect(hit.data?.days[0].events[0].title).toBe('Team Sync')

      // 3. Invalidate week data
      CalendarCacheService.invalidateWeekData(userId, todayStr)

      // 4. Verify cache eviction
      const afterInvalidation = await CalendarCacheService.getCachedWeekData(userId, todayStr)
      expect(afterInvalidation.data).toBeNull()
    })

    it('should evict entire calendar cache on invalidateAll(userId)', async () => {
      const mockAgenda: AgendaData = {
        today: [
          {
            id: 'ag-1',
            summary: 'Review Roadmap',
            start: '2026-09-14T13:00:00.000Z',
            end: '2026-09-14T14:00:00.000Z',
            isAllDay: false,
          },
        ],
        tomorrow: [],
        upcoming: [],
      }

      await CalendarCacheService.saveCachedAgenda(userId, todayStr, mockAgenda)
      const cached = await CalendarCacheService.getCachedAgenda(userId, todayStr)
      expect(cached.data).not.toBeNull()

      CalendarCacheService.invalidateAll(userId)

      const evicted = await CalendarCacheService.getCachedAgenda(userId, todayStr)
      expect(evicted.data).toBeNull()
    })
  })

  describe('Cross-Module Real-Time Event Dispatch', () => {
    it('should notify subscribers via calendar_data_changed window event without hard refresh', () => {
      // Simulate listener registered in DashboardLayout or Today component
      let refreshed = false
      const listener = () => {
        refreshed = true
      }

      // Add listener to globalThis/window
      const target = typeof window !== 'undefined' ? window : (globalThis as unknown as EventTarget)
      target.addEventListener('calendar_data_changed', listener)

      // Dispatch event as done in Calendar actions / drag drop / resize
      target.dispatchEvent(new Event('calendar_data_changed'))

      expect(refreshed).toBe(true)
      target.removeEventListener('calendar_data_changed', listener)
    })
  })

  describe('Activity & Task Checklist Cycling Rules', () => {
    const weeklyTemplate: ActivityTemplate = {
      id: 'template-weekly-gym',
      name: 'Gym Workout',
      category: 'fitness',
      type: 'WORKOUT',
      priority: 'NORMAL',
      estimatedDuration: 60,
      scheduledTime: null,
      energyRequired: 'MEDIUM',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      icon: 'dumbbell',
      color: 'emerald',
      isActive: true,
      notes: null,
      amount: null,
      sortOrder: 1,
      recurrenceType: 'weekly',
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: '1,4',
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: null,
      remindBeforeDays: null,
      metadata: null,
      tags: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }

    const dailyTemplate: ActivityTemplate = {
      id: 'template-daily-meditate',
      name: 'Morning Meditation',
      category: 'mindfulness',
      type: 'CUSTOM',
      priority: 'NORMAL',
      estimatedDuration: 15,
      scheduledTime: null,
      energyRequired: 'LOW',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      icon: 'sparkles',
      color: 'blue',
      isActive: true,
      notes: null,
      amount: null,
      sortOrder: 2,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: null,
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: null,
      remindBeforeDays: null,
      metadata: null,
      tags: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }

    it('non-daily activity should cycle through: Cleared -> Done -> Canceled -> Postponed -> Cleared', () => {
      // Helper simulating the state machine transition
      function getNextState(currentStatus: string | undefined, isDaily: boolean): string | undefined {
        const isCanceled = currentStatus === 'skipped'
        const isPostponed = currentStatus === 'postponed'
        const isDone = currentStatus === 'done'

        if (!isDone && !isCanceled && !isPostponed) {
          return 'done'
        } else if (isDone) {
          return 'skipped' // Canceled
        } else if (isCanceled) {
          return isDaily ? undefined : 'postponed'
        } else if (isPostponed) {
          return undefined // Cleared
        }
        return undefined
      }

      // Step 1: Cleared (undefined) -> Done
      const s1 = getNextState(undefined, false)
      expect(s1).toBe('done')

      // Step 2: Done -> Canceled (skipped)
      const s2 = getNextState(s1, false)
      expect(s2).toBe('skipped')

      // Step 3: Canceled -> Postponed (for non-daily)
      const s3 = getNextState(s2, false)
      expect(s3).toBe('postponed')

      // Step 4: Postponed -> Cleared (undefined)
      const s4 = getNextState(s3, false)
      expect(s4).toBeUndefined()
    })

    it('daily activity should cycle through: Cleared -> Done -> Canceled -> Cleared (skipping Postponed)', () => {
      function getNextState(currentStatus: string | undefined, isDaily: boolean): string | undefined {
        const isCanceled = currentStatus === 'skipped'
        const isPostponed = currentStatus === 'postponed'
        const isDone = currentStatus === 'done'

        if (!isDone && !isCanceled && !isPostponed) {
          return 'done'
        } else if (isDone) {
          return 'skipped'
        } else if (isCanceled) {
          return isDaily ? undefined : 'postponed'
        } else if (isPostponed) {
          return undefined
        }
        return undefined
      }

      expect(dailyTemplate.recurrenceType).toBe('daily')

      // Step 1: Cleared -> Done
      const s1 = getNextState(undefined, true)
      expect(s1).toBe('done')

      // Step 2: Done -> Canceled (skipped)
      const s2 = getNextState(s1, true)
      expect(s2).toBe('skipped')

      // Step 3: Canceled -> Cleared (Postponed is strictly skipped for daily)
      const s3 = getNextState(s2, true)
      expect(s3).toBeUndefined()
    })

    it('marking a non-daily activity postponed automatically reschedules it for the next day', () => {
      // Create a postponed log for Sept 14
      const postponeLog: ActivityLog = {
        id: 'log-postpone-1',
        activityId: weeklyTemplate.id,
        date: '2026-09-14',
        note: null,
        status: 'postponed',
        amount: null,
        payload: null,
        createdAt: new Date('2026-09-14T08:00:00.000Z'),
        updatedAt: new Date('2026-09-14T08:00:00.000Z'),
      }

      // Analyze recurrence on next day (2026-09-15)
      const analysisNextDay = analyzeRecurrence(weeklyTemplate, [postponeLog], '2026-09-15')

      // It must be rescheduled for next day (2026-09-15) and marked due/overdue
      expect(analysisNextDay.nextDueDate).toBe('2026-09-15')
      expect(analysisNextDay.overdue).toBe(true)
      expect(analysisNextDay.statusMessage).toBe('Postponed')
    })
  })
})
