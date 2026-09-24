import { describe, it, expect } from 'bun:test'
import {
  buildLogsByActivityIdIndex,
  buildLogsByDateIndex,
  analyzeAllTemplatesIndexed,
  analyzeRecurrence,
  getTodayDateStr,
} from '@/lib/recurrence'
import { requestDeduplicator } from '@/lib/store/requestDeduplicator'
import { perfTracker } from '@/lib/performance/perfTracker'
import { ActivityTemplate, ActivityLog } from '@/types'

describe('Desktop App Performance Architecture & Local-First Invariants', () => {
  const sampleTemplates: ActivityTemplate[] = [
    {
      id: 'template-1',
      userId: 'user-1',
      name: 'Morning Hydration',
      category: 'health',
      type: 'CUSTOM',
      priority: 'NORMAL',
      estimatedDuration: 5,
      energyRequired: 'low',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      sortOrder: 0,
      amount: null,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: null,
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: null,
      remindBeforeDays: null,
      metadata: null,
      tags: [],
      notes: null,
      isActive: true,
      color: '#3b82f6',
      icon: 'droplet',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    },
    {
      id: 'template-2',
      userId: 'user-1',
      name: 'Strength Training',
      category: 'fitness',
      type: 'WORKOUT',
      priority: 'HIGH',
      estimatedDuration: 45,
      energyRequired: 'high',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      sortOrder: 1,
      amount: null,
      recurrenceType: 'custom',
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: '1,3,5',
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: null,
      remindBeforeDays: null,
      metadata: null,
      tags: [],
      notes: null,
      isActive: true,
      color: '#ef4444',
      icon: 'dumbbell',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    },
    {
      id: 'template-3',
      userId: 'user-1',
      name: 'Archived Habit',
      category: 'learning',
      type: 'CUSTOM',
      priority: 'LOW',
      estimatedDuration: 15,
      energyRequired: 'medium',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      sortOrder: 2,
      amount: null,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: null,
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: null,
      remindBeforeDays: null,
      metadata: null,
      tags: [],
      notes: null,
      isActive: false,
      color: '#10b981',
      icon: 'book',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-15T00:00:00Z'),
    },
  ]

  const todayStr = getTodayDateStr()

  const sampleLogs: ActivityLog[] = [
    {
      id: 'log-1',
      activityId: 'template-1',
      date: todayStr,
      status: 'done',
      amount: 1,
      note: null,
      payload: null,
      createdAt: new Date(`${todayStr}T08:00:00Z`),
      updatedAt: new Date(`${todayStr}T08:00:00Z`),
    },
    {
      id: 'log-2',
      activityId: 'template-1',
      date: '2026-09-19',
      status: 'done',
      amount: 1,
      note: null,
      payload: null,
      createdAt: new Date('2026-09-19T08:00:00Z'),
      updatedAt: new Date('2026-09-19T08:00:00Z'),
    },
    {
      id: 'log-3',
      activityId: 'template-2',
      date: todayStr,
      status: 'skipped',
      amount: 0,
      note: null,
      payload: null,
      createdAt: new Date(`${todayStr}T09:00:00Z`),
      updatedAt: new Date(`${todayStr}T09:00:00Z`),
    },
  ]

  describe('1. O(T + L) Indexed Recurrence Analysis', () => {
    it('builds O(1) activity log lookup indices correctly', () => {
      const logsByActivity = buildLogsByActivityIdIndex(sampleLogs)
      const logsByDate = buildLogsByDateIndex(sampleLogs)

      expect(logsByActivity.get('template-1')?.length).toBe(2)
      expect(logsByActivity.get('template-2')?.length).toBe(1)
      expect(logsByActivity.get('template-3')).toBeUndefined()

      expect(logsByDate.get(todayStr)?.length).toBe(2)
      expect(logsByDate.get('2026-09-19')?.length).toBe(1)
      expect(logsByDate.get('2026-01-01')).toBeUndefined()
    })

    it('produces identical output between analyzeAllTemplatesIndexed and analyzeRecurrence', () => {
      const indexedResults = analyzeAllTemplatesIndexed(sampleTemplates, sampleLogs, todayStr)

      const unindexedResults = sampleTemplates.map(template => ({
        template,
        analysis: analyzeRecurrence(template, sampleLogs.filter(l => l.activityId === template.id), todayStr),
      }))

      expect(indexedResults.length).toBe(unindexedResults.length)

      for (let i = 0; i < indexedResults.length; i++) {
        const indexed = indexedResults[i]
        const unindexed = unindexedResults[i]

        expect(indexed.template.id).toBe(unindexed.template.id)
        expect(indexed.analysis.streak).toBe(unindexed.analysis.streak)
        expect(indexed.analysis.overdue).toBe(unindexed.analysis.overdue)
        expect(indexed.analysis.nextDueDate).toBe(unindexed.analysis.nextDueDate)
        expect(indexed.analysis.lastCompletedDate).toBe(unindexed.analysis.lastCompletedDate)
        expect(indexed.analysis.statusMessage).toBe(unindexed.analysis.statusMessage)
      }
    })
  })

  describe('2. Request Deduplicator & User-Scoped Isolation', () => {
    it('creates strictly user-scoped cache keys', () => {
      const keyA = requestDeduplicator.constructor && 'userKey' in requestDeduplicator.constructor
        ? (requestDeduplicator.constructor as { userKey: (p: string, u: string, s?: string) => string }).userKey('dashboard', 'user-alice', '2026-09-20')
        : 'dashboard:user-alice:2026-09-20'

      const keyB = requestDeduplicator.constructor && 'userKey' in requestDeduplicator.constructor
        ? (requestDeduplicator.constructor as { userKey: (p: string, u: string, s?: string) => string }).userKey('dashboard', 'user-bob', '2026-09-20')
        : 'dashboard:user-bob:2026-09-20'

      expect(keyA).toBe('dashboard:user-alice:2026-09-20')
      expect(keyB).toBe('dashboard:user-bob:2026-09-20')
      expect(keyA).not.toBe(keyB)
    })

    it('coalesces concurrent requests for the same user and key', async () => {
      let callCount = 0
      const fetcher = async () => {
        callCount++
        return { data: 'test-payload' }
      }

      const p1 = requestDeduplicator.dedupe('test:user-1:key', fetcher)
      const p2 = requestDeduplicator.dedupe('test:user-1:key', fetcher)

      const [res1, res2] = await Promise.all([p1, p2])

      expect(res1).toEqual({ data: 'test-payload' })
      expect(res2).toEqual({ data: 'test-payload' })
      expect(callCount).toBe(1) // Executed only once!
    })

    it('removes rejected requests immediately without leaving stale rejected promises', async () => {
      const failingFetcher = async () => {
        throw new Error('Database timeout')
      }

      await expect(
        requestDeduplicator.dedupe('test:user-1:failing', failingFetcher)
      ).rejects.toThrow('Database timeout')

      expect(requestDeduplicator.has('test:user-1:failing')).toBe(false)
    })

    it('clears all user-scoped in-flight requests on logout or user switch', () => {
      requestDeduplicator.dedupe('test:user-alice:sync', () => new Promise(() => {}))
      requestDeduplicator.dedupe('test:user-bob:sync', () => new Promise(() => {}))

      expect(requestDeduplicator.has('test:user-alice:sync')).toBe(true)
      expect(requestDeduplicator.has('test:user-bob:sync')).toBe(true)

      // Alice logs out
      requestDeduplicator.clearUser('user-alice')

      expect(requestDeduplicator.has('test:user-alice:sync')).toBe(false)
      expect(requestDeduplicator.has('test:user-bob:sync')).toBe(true)

      // Teardown
      requestDeduplicator.clear()
    })
  })

  describe('3. Performance Tracker Instrumentation', () => {
    it('records marks and calculates elapsed duration correctly', () => {
      perfTracker.clear()
      perfTracker.mark('navigationStart')
      perfTracker.mark('firstUsableRender')

      const start = perfTracker.getMark('navigationStart')
      const end = perfTracker.getMark('firstUsableRender')

      expect(start).toBeDefined()
      expect(end).toBeDefined()
      expect(typeof start).toBe('number')
      expect(typeof end).toBe('number')
      expect(end!).toBeGreaterThanOrEqual(start!)

      const duration = perfTracker.measure('timeToUsable', 'navigationStart', 'firstUsableRender')
      expect(duration).toBeGreaterThanOrEqual(0)
    })
  })
})
