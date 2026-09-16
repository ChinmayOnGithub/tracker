import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createLocalDateTime } from '@/lib/dateUtils'
import { WorkSessionService } from '@/modules/work/services/WorkSessionService'
import { db } from '@/lib/db'
import { ActivityService } from '@/lib/services/ActivityService'
import { WorkSession } from '@/modules/work/types'
import { ActivityLog, ActivityTemplate } from '@prisma/client'

describe('Issue #35: Backdated Work-Session Start Time & Timer Anchor', () => {
  const userId = 'test-user-35'
  const workDate = '2026-09-16'

  describe('createLocalDateTime Canonical Helper', () => {
    it('constructs a local Date object from YYYY-MM-DD and HH:mm', () => {
      const dt = createLocalDateTime('2026-09-16', '09:00')
      expect(dt.getFullYear()).toBe(2026)
      expect(dt.getMonth()).toBe(8) // 0-indexed September
      expect(dt.getDate()).toBe(16)
      expect(dt.getHours()).toBe(9)
      expect(dt.getMinutes()).toBe(0)
      expect(dt.getSeconds()).toBe(0)
    })

    it('handles midnight boundary (00:00) accurately', () => {
      const dt = createLocalDateTime('2026-09-16', '00:00')
      expect(dt.getFullYear()).toBe(2026)
      expect(dt.getMonth()).toBe(8)
      expect(dt.getDate()).toBe(16)
      expect(dt.getHours()).toBe(0)
      expect(dt.getMinutes()).toBe(0)
    })

    it('rejects invalid date format', () => {
      expect(() => createLocalDateTime('16-09-2026', '09:00')).toThrow(/Invalid date format/)
      expect(() => createLocalDateTime('2026/09/16', '09:00')).toThrow(/Invalid date format/)
    })

    it('rejects invalid time format', () => {
      expect(() => createLocalDateTime('2026-09-16', '9am')).toThrow(/Invalid time format/)
      expect(() => createLocalDateTime('2026-09-16', '25:00')).toThrow(/Invalid hours/)
      expect(() => createLocalDateTime('2026-09-16', '09:65')).toThrow(/Invalid minutes/)
    })

    it('parses full ISO string if passed as timeStr', () => {
      const iso = '2026-09-16T09:00:00.000Z'
      const dt = createLocalDateTime('2026-09-16', iso)
      expect(dt.toISOString()).toBe(iso)
    })
  })

  describe('Stopwatch Timer Elapsed Math with Backdated Anchor', () => {
    const computeElapsedSeconds = (
      sessionState: 'idle' | 'running' | 'paused' | 'completed',
      accumulatedSeconds: number,
      currentSegmentStartedAt: string | null,
      nowMs: number
    ): number => {
      if (sessionState === 'running' && currentSegmentStartedAt) {
        const segmentStartMs = new Date(currentSegmentStartedAt).getTime()
        const segmentElapsedSec = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000))
        return accumulatedSeconds + segmentElapsedSec
      }
      return accumulatedSeconds
    }

    it('uses manually entered earlier start time as timer anchor', () => {
      const enteredStart = '09:00'
      const effectiveStart = createLocalDateTime(workDate, enteredStart)
      const now11 = createLocalDateTime(workDate, '11:00')
      const now12 = createLocalDateTime(workDate, '12:00')

      const state = {
        sessionState: 'running' as const,
        accumulatedSeconds: 0,
        currentSegmentStartedAt: effectiveStart.toISOString(),
      }

      // At 11:00 (button-click time), elapsed must already show 2h (7200s), NOT 0s
      const elapsedAt11 = computeElapsedSeconds(
        state.sessionState,
        state.accumulatedSeconds,
        state.currentSegmentStartedAt,
        now11.getTime()
      )
      expect(elapsedAt11).toBe(2 * 3600) // 7200 seconds = 2h

      // At 12:00, elapsed must show 3h (10800s)
      const elapsedAt12 = computeElapsedSeconds(
        state.sessionState,
        state.accumulatedSeconds,
        state.currentSegmentStartedAt,
        now12.getTime()
      )
      expect(elapsedAt12).toBe(3 * 3600) // 10800 seconds = 3h
    })

    it('backdated start followed by pause preserves full elapsed duration', () => {
      const effectiveStart = createLocalDateTime(workDate, '09:00')
      const pauseTime = createLocalDateTime(workDate, '12:00')

      const runningState = {
        sessionState: 'running' as const,
        accumulatedSeconds: 0,
        currentSegmentStartedAt: effectiveStart.toISOString(),
      }

      // Pause at 12:00
      const segmentSec = Math.max(
        0,
        Math.floor((pauseTime.getTime() - new Date(runningState.currentSegmentStartedAt).getTime()) / 1000)
      )
      const pausedState = {
        sessionState: 'paused' as const,
        accumulatedSeconds: runningState.accumulatedSeconds + segmentSec,
        currentSegmentStartedAt: null,
      }

      expect(pausedState.accumulatedSeconds).toBe(3 * 3600) // 10800s

      // At 12:30, timer is frozen at 3h
      const later30m = createLocalDateTime(workDate, '12:30').getTime()
      expect(
        computeElapsedSeconds(
          pausedState.sessionState,
          pausedState.accumulatedSeconds,
          pausedState.currentSegmentStartedAt,
          later30m
        )
      ).toBe(3 * 3600)
    })

    it('pause -> resume after backdated start maintains duration without loss', () => {
      const pausedAccumulated = 3 * 3600 // 10800s from 09:00 to 12:00
      const resumeTime = createLocalDateTime(workDate, '12:30')

      const resumedState = {
        sessionState: 'running' as const,
        accumulatedSeconds: pausedAccumulated,
        currentSegmentStartedAt: resumeTime.toISOString(),
      }

      // At 13:00 (30 mins after resume), total duration is 3h + 30m = 3h 30m = 12600s
      const checkTime = createLocalDateTime(workDate, '13:00').getTime()
      const totalElapsed = computeElapsedSeconds(
        resumedState.sessionState,
        resumedState.accumulatedSeconds,
        resumedState.currentSegmentStartedAt,
        checkTime
      )
      expect(totalElapsed).toBe(3 * 3600 + 1800) // 12600 seconds
    })
  })

  describe('WorkSessionService Server-Side Invariants', () => {
    const originalFind = db.workSession.findFirst
    const originalCreate = db.workSession.create
    const originalUpdate = db.workSession.update
    const originalLogActivity = ActivityService.logActivity
    const originalGetTemplate = ActivityService.getOrCreateDefaultTemplate

    beforeEach(() => {
      db.workSession.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.workSession.findFirst
      ActivityService.getOrCreateDefaultTemplate = mock(() =>
        Promise.resolve({ id: 'tmpl-work-1', name: 'Work Tracker' } as unknown as ActivityTemplate)
      ) as unknown as typeof ActivityService.getOrCreateDefaultTemplate
    })

    afterEach(() => {
      db.workSession.findFirst = originalFind
      db.workSession.create = originalCreate
      db.workSession.update = originalUpdate
      ActivityService.logActivity = originalLogActivity
      ActivityService.getOrCreateDefaultTemplate = originalGetTemplate
    })

    it('WorkSessionService.startSession sets startedAt and currentSegmentStartedAt to requestedStartTime', async () => {
      let createdSessionData: unknown = null
      let loggedActivityData: unknown = null

      db.workSession.create = mock((args?: { data?: unknown }) => {
        createdSessionData = args?.data
        return Promise.resolve({
          id: 'ws-test-1',
          userId,
          date: workDate,
          mode: 'office',
          startedAt: (args?.data as { startedAt: Date }).startedAt,
          endedAt: null,
          durationMinutes: 0,
          loggingMode: 'timer',
          manualMinutes: 0,
        } as unknown as WorkSession)
      }) as unknown as typeof db.workSession.create

      ActivityService.logActivity = mock((args?: unknown) => {
        loggedActivityData = args
        return Promise.resolve({} as unknown as ActivityLog)
      }) as unknown as typeof ActivityService.logActivity

      // Start session with backdated start time: 09:00
      const session = await WorkSessionService.startSession(userId, workDate, 'office', undefined, '09:00')

      expect(session).toBeDefined()
      expect(createdSessionData).toBeDefined()
      const sessionData = createdSessionData as { startedAt: Date; loggingMode: string; date: string }
      expect(sessionData.loggingMode).toBe('timer')
      expect(sessionData.date).toBe(workDate)
      expect(sessionData.startedAt.getHours()).toBe(9)
      expect(sessionData.startedAt.getMinutes()).toBe(0)

      expect(loggedActivityData).toBeDefined()
      const actData = loggedActivityData as {
        payload: {
          currentSegmentStartedAt: string
          inTime: string
          sessionState: string
        }
      }
      expect(actData.payload.sessionState).toBe('running')
      expect(actData.payload.inTime).toBe('09:00')
      const segDate = new Date(actData.payload.currentSegmentStartedAt)
      expect(segDate.getHours()).toBe(9)
      expect(segDate.getMinutes()).toBe(0)
    })

    it('WorkSessionService.startSession defaults to now when requestedStartTime is omitted', async () => {
      let createdSessionData: unknown = null

      db.workSession.create = mock((args?: { data?: unknown }) => {
        createdSessionData = args?.data
        return Promise.resolve({
          id: 'ws-test-2',
          userId,
          date: workDate,
          mode: 'wfh',
          startedAt: new Date(),
          endedAt: null,
          durationMinutes: 0,
          loggingMode: 'timer',
          manualMinutes: 0,
        } as unknown as WorkSession)
      }) as unknown as typeof db.workSession.create

      ActivityService.logActivity = mock(() => Promise.resolve({} as unknown as ActivityLog)) as unknown as typeof ActivityService.logActivity

      const before = Date.now()
      await WorkSessionService.startSession(userId, workDate, 'wfh')
      const after = Date.now()

      const sessionData = createdSessionData as { startedAt: Date }
      expect(sessionData.startedAt.getTime()).toBeGreaterThanOrEqual(before - 100)
      expect(sessionData.startedAt.getTime()).toBeLessThanOrEqual(after + 100)
    })

    it('WorkSessionService.startSession rejects future start times', async () => {
      // Future time: 23:59 on tomorrow
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      expect(
        WorkSessionService.startSession(userId, tomorrow, 'office', undefined, '23:59')
      ).rejects.toThrow(/future/)
    })

    it('WorkSessionService.finishSession accurately computes duration from backdated startedAt', async () => {
      const effectiveStart = new Date(Date.now() - 3 * 3600 * 1000) // 3 hours ago
      let updatedSessionData: unknown = null
      let loggedActivityData: unknown = null

      db.workSession.findFirst = mock(() =>
        Promise.resolve({
          id: 'ws-backdated-finish',
          userId,
          date: workDate,
          mode: 'office',
          startedAt: effectiveStart,
          endedAt: null,
          durationMinutes: 0,
          loggingMode: 'timer',
          manualMinutes: 0,
          deletedAt: null,
        } as unknown as WorkSession)
      ) as unknown as typeof db.workSession.findFirst

      db.workSession.update = mock((args?: { data?: unknown }) => {
        updatedSessionData = args?.data
        return Promise.resolve({} as unknown as WorkSession)
      }) as unknown as typeof db.workSession.update

      db.activityLog.findFirst = mock(() =>
        Promise.resolve({
          id: 'log-1',
          activityId: 'tmpl-work-1',
          payload: {},
        } as unknown as ActivityLog)
      ) as unknown as typeof db.activityLog.findFirst

      ActivityService.logActivity = mock((args?: unknown) => {
        loggedActivityData = args
        return Promise.resolve({} as unknown as ActivityLog)
      }) as unknown as typeof ActivityService.logActivity

      await WorkSessionService.finishSession(userId, 'ws-backdated-finish')

      const sessionData = updatedSessionData as { durationMinutes: number; endedAt: Date }
      expect(sessionData.durationMinutes).toBeGreaterThanOrEqual(179)
      expect(sessionData.durationMinutes).toBeLessThanOrEqual(181) // ~180 mins = 3h

      const actData = loggedActivityData as {
        amount: number
        payload: { sessionState: string; accumulatedSeconds: number }
      }
      expect(actData.payload.sessionState).toBe('completed')
      expect(actData.amount).toBe(3.0)
    })
  })
})
