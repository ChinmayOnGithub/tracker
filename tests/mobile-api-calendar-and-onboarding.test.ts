import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { GET as getCalendarMonth } from '@/app/api/mobile/v1/calendar/month/route'
import { GET as getCalendarWeek } from '@/app/api/mobile/v1/calendar/week/route'
import { GET as getCalendarDay } from '@/app/api/mobile/v1/calendar/day/route'
import { POST as postCalendarSync } from '@/app/api/mobile/v1/calendar/sync/route'
import { GET as getOnboarding, POST as postOnboarding } from '@/app/api/mobile/v1/onboarding/route'
import { POST as postOnboardingComplete } from '@/app/api/mobile/v1/onboarding/complete/route'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { CalendarAggregationService } from '@/modules/calendar/services/CalendarAggregationService'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { OnboardingService, DEFAULT_ONBOARDING_STATE } from '@/lib/services/OnboardingService'
import { User } from '@prisma/client'

describe('Mobile API Calendar & Onboarding Suite (/api/mobile/v1/)', () => {
  const testUserId = 'user-mobile-cal-onboard-test'
  const mockUser: User = {
    id: testUserId,
    username: 'test_cal_user',
    email: 'cal@example.com',
    googleId: 'google-oauth-test-id',
    passwordHash: 'scrypt:test',
    isSuspended: false,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let validToken: string
  const originalFindUnique = db.user.findUnique
  const originalGetMonthSummary = CalendarAggregationService.getMonthSummary
  const originalGetWeekView = CalendarAggregationService.getWeekView
  const originalGetDayView = CalendarAggregationService.getDayView
  const originalSync = CalendarService.sync
  const originalGetState = OnboardingService.getState
  const originalInitialize = OnboardingService.initialize
  const originalSaveState = OnboardingService.saveState
  const originalCreateFirstDayPlan = OnboardingService.createFirstDayPlan

  beforeEach(() => {
    validToken = `Bearer ${signSession(testUserId, 'test_cal_user', 1)}`
    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'test_cal_user' || args?.where?.id === testUserId) {
        return Promise.resolve(mockUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  afterEach(() => {
    db.user.findUnique = originalFindUnique
    CalendarAggregationService.getMonthSummary = originalGetMonthSummary
    CalendarAggregationService.getWeekView = originalGetWeekView
    CalendarAggregationService.getDayView = originalGetDayView
    CalendarService.sync = originalSync
    OnboardingService.getState = originalGetState
    OnboardingService.initialize = originalInitialize
    OnboardingService.saveState = originalSaveState
    OnboardingService.createFirstDayPlan = originalCreateFirstDayPlan
  })

  // --- CALENDAR MONTH ---
  describe('GET /api/mobile/v1/calendar/month', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/month')
      const res = await getCalendarMonth(req)
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns month summaries with default current month', async () => {
      CalendarAggregationService.getMonthSummary = mock(() =>
        Promise.resolve([
          {
            date: '2026-10-01',
            hasMeetings: false,
            meetingCount: 0,
            hasTasks: true,
            taskTotal: 2,
            taskCompleted: 1,
            hasWork: false,
            workDurationMinutes: 0,
          },
        ])
      ) as unknown as typeof CalendarAggregationService.getMonthSummary

      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/month', {
        headers: { Authorization: validToken },
      })
      const res = await getCalendarMonth(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.summaries).toHaveLength(1)
      expect(json.data.summaries[0].date).toBe('2026-10-01')
      expect(json.data.year).toBeDefined()
      expect(json.data.month).toBeDefined()
    })

    it('respects explicit month parameter YYYY-MM', async () => {
      let requestedYear = 0
      let requestedMonth = 0
      CalendarAggregationService.getMonthSummary = mock((_userId, year, month) => {
        requestedYear = year
        requestedMonth = month
        return Promise.resolve([])
      }) as unknown as typeof CalendarAggregationService.getMonthSummary

      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/month?month=2026-11', {
        headers: { Authorization: validToken },
      })
      const res = await getCalendarMonth(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(requestedYear).toBe(2026)
      expect(requestedMonth).toBe(11)
      expect(json.data.year).toBe(2026)
      expect(json.data.month).toBe(11)
    })
  })

  // --- CALENDAR WEEK ---
  describe('GET /api/mobile/v1/calendar/week', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/week')
      const res = await getCalendarWeek(req)
      expect(res.status).toBe(401)
    })

    it('returns week view days with items', async () => {
      CalendarAggregationService.getWeekView = mock(() =>
        Promise.resolve({
          days: [
            {
              date: '2026-10-02',
              events: [
                {
                  id: 'cal-event-1',
                  title: 'Team Sync',
                  start: '2026-10-02T10:00:00Z',
                  end: '2026-10-02T11:00:00Z',
                  allDay: false,
                  color: null,
                  type: 'CALENDAR_EVENT',
                  trackerArtifactId: null,
                  trackerArtifactType: null,
                },
              ],
              workedHours: 0,
              isLeave: false,
            },
          ],
        })
      ) as unknown as typeof CalendarAggregationService.getWeekView

      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/week?startDate=2026-10-02', {
        headers: { Authorization: validToken },
      })
      const res = await getCalendarWeek(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.week.days).toHaveLength(1)
      expect(json.data.week.days[0].events[0].title).toBe('Team Sync')
    })
  })

  // --- CALENDAR DAY ---
  describe('GET /api/mobile/v1/calendar/day', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/day')
      const res = await getCalendarDay(req)
      expect(res.status).toBe(401)
    })

    it('returns day view items', async () => {
      CalendarAggregationService.getDayView = mock(() =>
        Promise.resolve({
          date: '2026-10-02',
          items: [
            {
              id: 'task-1',
              source: 'ACTIVITY_TASK',
              title: 'Review PRs',
              startTime: null,
              endTime: null,
              isAllDay: true,
              isCompleted: true,
            },
          ],
        })
      ) as unknown as typeof CalendarAggregationService.getDayView

      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/day?date=2026-10-02', {
        headers: { Authorization: validToken },
      })
      const res = await getCalendarDay(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.day.items).toHaveLength(1)
      expect(json.data.day.items[0].title).toBe('Review PRs')
    })
  })

  // --- CALENDAR SYNC ---
  describe('POST /api/mobile/v1/calendar/sync', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/sync', { method: 'POST' })
      const res = await postCalendarSync(req)
      expect(res.status).toBe(401)
    })

    it('executes Google Calendar synchronization and returns sync summary', async () => {
      CalendarService.sync = mock((userId) => {
        expect(userId).toBe(testUserId)
        return Promise.resolve({
          syncedAt: new Date(),
          eventsImported: 3,
          eventsExported: 1,
          eventsDeleted: 0,
        })
      }) as unknown as typeof CalendarService.sync

      const req = new Request('http://localhost:3000/api/mobile/v1/calendar/sync', {
        method: 'POST',
        headers: { Authorization: validToken },
      })
      const res = await postCalendarSync(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.synced).toBe(true)
      expect(json.data.result.eventsImported).toBe(3)
    })
  })

  // --- ONBOARDING ---
  describe('Onboarding Routes (/api/mobile/v1/onboarding)', () => {
    const mockState = {
      ...DEFAULT_ONBOARDING_STATE,
      timezone: 'America/New_York',
      workStartTime: '08:30',
      workEndTime: '17:30',
      dailyCapacity: 5,
      focusAreas: ['Engineering', 'Writing'],
      firstDayObjective: 'Ship mobile parity',
      createdAt: new Date().toISOString(),
    }

    it('GET /api/mobile/v1/onboarding initializes or retrieves onboarding state', async () => {
      OnboardingService.getState = mock(() => Promise.resolve(null)) as unknown as typeof OnboardingService.getState
      OnboardingService.initialize = mock((userId) => {
        expect(userId).toBe(testUserId)
        return Promise.resolve(mockState)
      }) as unknown as typeof OnboardingService.initialize

      const req = new Request('http://localhost:3000/api/mobile/v1/onboarding', {
        headers: { Authorization: validToken },
      })
      const res = await getOnboarding(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.state.timezone).toBe('America/New_York')
    })

    it('POST /api/mobile/v1/onboarding validates payload and saves state', async () => {
      OnboardingService.saveState = mock((userId, state) => {
        expect(userId).toBe(testUserId)
        return Promise.resolve(state)
      }) as unknown as typeof OnboardingService.saveState

      const req = new Request('http://localhost:3000/api/mobile/v1/onboarding', {
        method: 'POST',
        headers: {
          Authorization: validToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockState),
      })
      const res = await postOnboarding(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.state.dailyCapacity).toBe(5)
    })

    it('POST /api/mobile/v1/onboarding rejects invalid work time format', async () => {
      const invalidState = { ...mockState, workStartTime: 'invalid-time' }
      const req = new Request('http://localhost:3000/api/mobile/v1/onboarding', {
        method: 'POST',
        headers: {
          Authorization: validToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidState),
      })
      const res = await postOnboarding(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('VALIDATION_ERROR')
    })

    it('POST /api/mobile/v1/onboarding/complete creates first day plan and marks completed', async () => {
      OnboardingService.createFirstDayPlan = mock((userId, state) => {
        expect(userId).toBe(testUserId)
        return Promise.resolve({
          state,
          created: 1,
          activityIds: ['act-first-day-1'],
          activities: [
            {
              id: 'act-first-day-1',
              name: 'Ship mobile parity',
              category: 'Focus',
              type: 'TASK',
            },
          ],
        })
      }) as unknown as typeof OnboardingService.createFirstDayPlan

      OnboardingService.saveState = mock((_userId, state) => {
        expect(state.status).toBe('COMPLETED')
        expect(state.currentStep).toBe(7)
        return Promise.resolve(state)
      }) as unknown as typeof OnboardingService.saveState

      const req = new Request('http://localhost:3000/api/mobile/v1/onboarding/complete', {
        method: 'POST',
        headers: {
          Authorization: validToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockState),
      })
      const res = await postOnboardingComplete(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.state.status).toBe('COMPLETED')
      expect(json.data.plan.activityIds).toContain('act-first-day-1')
    })
  })
})
