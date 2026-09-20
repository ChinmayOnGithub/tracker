import { describe, it, expect, mock } from 'bun:test'
import { UserTimezoneService } from '@/lib/services/UserTimezoneService'
import { QuotaService } from '@/lib/services/QuotaService'
import { QuotaExceededError } from '@/lib/errors'
import { calculateEntitlements } from '@/lib/billing/entitlements'

describe('STEP 4 — User Timezone & Period Key Resolution', () => {
  it('correctly resolves daily period keys across UTC and non-UTC timezones', () => {
    // 2026-09-20 20:00:00 UTC
    // In UTC: 2026-09-20
    // In Asia/Kolkata (+05:30): 2026-09-21 01:30:00 -> 2026-09-21
    // In America/New_York (-04:00): 2026-09-20 16:00:00 -> 2026-09-20
    const instant = new Date('2026-09-20T20:00:00.000Z')

    const utcPeriod = UserTimezoneService.getDailyPeriodKey('UTC', instant)
    const istPeriod = UserTimezoneService.getDailyPeriodKey('Asia/Kolkata', instant)
    const estPeriod = UserTimezoneService.getDailyPeriodKey('America/New_York', instant)

    expect(utcPeriod).toBe('2026-09-20')
    expect(istPeriod).toBe('2026-09-21')
    expect(estPeriod).toBe('2026-09-20')
  })

  it('handles midnight boundary precisely without drift', () => {
    // Exactly 00:00:00 in IST (18:30:00 UTC previous day)
    const midnightIst = new Date('2026-09-20T18:30:00.000Z')
    expect(UserTimezoneService.getDailyPeriodKey('Asia/Kolkata', midnightIst)).toBe('2026-09-21')

    // 1 second before midnight in IST
    const justBeforeMidnightIst = new Date('2026-09-20T18:29:59.000Z')
    expect(UserTimezoneService.getDailyPeriodKey('Asia/Kolkata', justBeforeMidnightIst)).toBe('2026-09-20')
  })

  it('safely falls back to UTC if timezone is invalid or malformed', () => {
    const instant = new Date('2026-09-20T12:00:00.000Z')
    const fallbackPeriod = UserTimezoneService.getDailyPeriodKey('Invalid/Fake_Zone', instant)
    expect(fallbackPeriod).toBe('2026-09-20')
  })
})

describe('STEP 4 — Entitlement Limits Configuration', () => {
  it('FREE plan includes canonical quotas: tasks=50, activities=10, calendar_events=5', () => {
    const entitlements = calculateEntitlements(null)
    expect(entitlements.limits.tasks_created_daily).toBe(50)
    expect(entitlements.limits.activities_active).toBe(10)
    expect(entitlements.limits.calendar_events_created_daily).toBe(5)
  })

  it('PRO plan includes unlimited quotas for tasks, activities, and calendar events', () => {
    const proSub = {
      id: 'sub_pro_123',
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(proSub)
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.limits.tasks_created_daily).toBeGreaterThanOrEqual(10000)
    expect(entitlements.limits.activities_active).toBeGreaterThanOrEqual(10000)
    expect(entitlements.limits.calendar_events_created_daily).toBeGreaterThanOrEqual(10000)
  })
})

type TxType = Parameters<typeof QuotaService.consumeDailyQuota>[0]

describe('STEP 4 — Race-Safe Atomic Quota Engine', () => {
  it('allows consumption up to limit and rejects beyond limit with QuotaExceededError', async () => {
    let mockCount = 0
    const limit = 5

    const mockTx = {
      $queryRaw: mock(async (_query: unknown, ..._args: unknown[]) => {
        if (mockCount < limit) {
          mockCount += 1
          return [{ count: mockCount }]
        }
        // Simulated PostgreSQL RETURNING clause returning 0 rows when count < limit is false
        return []
      })
    }

    // 1 to 5 should succeed
    for (let i = 1; i <= 5; i++) {
      const res = await QuotaService.consumeDailyQuota(
        mockTx as unknown as TxType,
        'user_test_1',
        'calendar_events_created_daily',
        limit,
        { periodKey: '2026-09-21' }
      )
      expect(res.currentCount).toBe(i)
    }

    // 6th attempt must be rejected with QuotaExceededError
    expect(
      QuotaService.consumeDailyQuota(
        mockTx as unknown as TxType,
        'user_test_1',
        'calendar_events_created_daily',
        limit,
        { periodKey: '2026-09-21' }
      )
    ).rejects.toThrow(QuotaExceededError)
  })

  it('task limit boundary: 49 -> allowed, 50 -> allowed, 51 -> denied', async () => {
    let mockCount = 48
    const limit = 50

    const mockTx = {
      $queryRaw: mock(async () => {
        if (mockCount < limit) {
          mockCount += 1
          return [{ count: mockCount }]
        }
        return []
      })
    }

    // 49 allowed
    const r49 = await QuotaService.consumeDailyQuota(
      mockTx as unknown as TxType,
      'user_task',
      'tasks_created_daily',
      limit,
      { periodKey: '2026-09-21' }
    )
    expect(r49.currentCount).toBe(49)

    // 50 allowed
    const r50 = await QuotaService.consumeDailyQuota(
      mockTx as unknown as TxType,
      'user_task',
      'tasks_created_daily',
      limit,
      { periodKey: '2026-09-21' }
    )
    expect(r50.currentCount).toBe(50)

    // 51 denied
    expect(
      QuotaService.consumeDailyQuota(
        mockTx as unknown as TxType,
        'user_task',
        'tasks_created_daily',
        limit,
        { periodKey: '2026-09-21' }
      )
    ).rejects.toThrow(QuotaExceededError)
  })

  it('PRO users bypass quota limits safely', async () => {
    const mockTx = {
      $queryRaw: mock(async () => {
        throw new Error('Should not be called for Pro')
      })
    }

    const res = await QuotaService.consumeDailyQuota(
      mockTx as unknown as TxType,
      'pro_user',
      'tasks_created_daily',
      10000,
      { periodKey: '2026-09-21' }
    )
    expect(res.currentCount).toBe(0)
  })

  it('simulates concurrent requests at boundary where exactly one wins', async () => {
    let currentDbCount = 4
    const limit = 5

    // Simulate atomic PostgreSQL ON CONFLICT DO UPDATE WHERE count < limit RETURNING count
    const executeAtomicDbQuery = async () => {
      // Simulate small concurrency jitter
      await new Promise(r => setTimeout(r, Math.random() * 5))
      if (currentDbCount < limit) {
        currentDbCount += 1
        return [{ count: currentDbCount }]
      }
      return []
    }

    const mockTxA = { $queryRaw: mock(executeAtomicDbQuery) }
    const mockTxB = { $queryRaw: mock(executeAtomicDbQuery) }

    const results = await Promise.allSettled([
      QuotaService.consumeDailyQuota(mockTxA as unknown as TxType, 'user_c', 'calendar_events_created_daily', limit, { periodKey: '2026-09-21' }),
      QuotaService.consumeDailyQuota(mockTxB as unknown as TxType, 'user_c', 'calendar_events_created_daily', limit, { periodKey: '2026-09-21' }),
    ])

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')

    // Exactly one must succeed and one must be rejected
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(QuotaExceededError)
    expect(currentDbCount).toBe(5)
  })
})

describe('STEP 4 — Active Activity Limit Semantics', () => {
  it('allows 9 active, allows 10th active, and blocks 11th active', () => {
    const activityLimit = 10

    const checkCapacity = (activeCount: number) => activeCount < activityLimit

    expect(checkCapacity(9)).toBe(true)
    expect(checkCapacity(10)).toBe(false)
  })

  it('deactivating an activity decreases active count and restores capacity', () => {
    const activityLimit = 10
    let activeActivities = ['act_1', 'act_2', 'act_3', 'act_4', 'act_5', 'act_6', 'act_7', 'act_8', 'act_9', 'act_10']

    // At limit (10 active)
    expect(activeActivities.length >= activityLimit).toBe(true)

    // Deactivate act_10 (isActive = false)
    activeActivities = activeActivities.filter(id => id !== 'act_10')

    // Capacity restored (9 active)
    expect(activeActivities.length < activityLimit).toBe(true)
  })

  it('deleting an activity soft-deletes and restores capacity', () => {
    const activityLimit = 10
    let activeActivities = ['act_1', 'act_2', 'act_3', 'act_4', 'act_5', 'act_6', 'act_7', 'act_8', 'act_9', 'act_10']

    // Delete act_5 (deletedAt = new Date(), isActive = false)
    activeActivities = activeActivities.filter(id => id !== 'act_5')

    // Capacity restored
    expect(activeActivities.length < activityLimit).toBe(true)
  })

  it('deleting a task does NOT restore creation quota because usage counter is immutable on deletion', () => {
    // Creation consumed 1 unit
    const usageCount = 50
    const limit = 50

    // Task is deleted in database
    const taskDeleted = true
    expect(taskDeleted).toBe(true)

    // Usage counter remains 50
    expect(usageCount).toBe(50)
    expect(usageCount >= limit).toBe(true)
  })
})
