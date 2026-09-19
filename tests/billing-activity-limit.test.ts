import { describe, it, expect } from 'bun:test'
import { calculateEntitlements, SubscriptionSnapshot } from '@/lib/billing/entitlements'

// ---------------------------------------------------------------------------
// Unit tests: FREE_ENTITLEMENTS active_activities limit correction
// ---------------------------------------------------------------------------
describe('FREE entitlements — active_activities limit is 10 (not 100)', () => {
  it('FREE plan has active_activities limit of 10', () => {
    const entitlements = calculateEntitlements(null)
    expect(entitlements.limits.active_activities).toBe(10)
    expect(entitlements.limits.maxActiveActivities).toBe(10)
  })

  it('PRO_MONTHLY plan has active_activities limit of 10000', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const activeSub: SubscriptionSnapshot = {
      id: 'sub_pro',
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(activeSub, now)
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.limits.active_activities).toBe(10000)
    expect(entitlements.limits.maxActiveActivities).toBe(10000)
  })

  it('PRO_ANNUAL plan has active_activities limit of 10000', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const activeSub: SubscriptionSnapshot = {
      id: 'sub_annual',
      plan: 'PRO_ANNUAL',
      status: 'ACTIVE',
      billingInterval: 'annual',
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(activeSub, now)
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.limits.active_activities).toBe(10000)
  })

  it('expired PRO falls back to FREE with active_activities limit of 10', () => {
    const now = new Date('2026-10-05T12:00:00Z')
    const expiredSub: SubscriptionSnapshot = {
      id: 'sub_exp',
      plan: 'PRO_MONTHLY',
      status: 'CANCELLED',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-09-30T23:59:59Z'),
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-09-10T10:00:00Z'),
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(expiredSub, now)
    expect(entitlements.isPro).toBe(false)
    expect(entitlements.limits.active_activities).toBe(10)
    expect(entitlements.limits.maxActiveActivities).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Integration-style tests: createActivityTemplate limit enforcement
// The server action itself is hard to test in isolation (requires DB + session),
// so we test the limit logic end-to-end using the entitlement calculation.
// ---------------------------------------------------------------------------
describe('Activity limit enforcement — boundary conditions', () => {
  it('FREE user at limit (10/10) should be rejected', () => {
    // Simulate the server-side check:
    //   activityLimit = 10 (from FREE entitlements)
    //   activeCount = 10
    //   10 >= 10 -> rejected
    const entitlements = calculateEntitlements(null)
    const activityLimit = entitlements.limits.active_activities
    const activeCount = 10

    expect(activityLimit).toBe(10)
    expect(activeCount >= activityLimit).toBe(true)
  })

  it('FREE user under limit (9/10) should be allowed', () => {
    const entitlements = calculateEntitlements(null)
    const activityLimit = entitlements.limits.active_activities
    const activeCount = 9

    expect(activeCount >= activityLimit).toBe(false)
  })

  it('FREE user at 0 activities should be allowed', () => {
    const entitlements = calculateEntitlements(null)
    const activityLimit = entitlements.limits.active_activities
    const activeCount = 0

    expect(activeCount >= activityLimit).toBe(false)
  })

  it('PRO user at 10 activities is NOT blocked (limit is 10000)', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const activeSub: SubscriptionSnapshot = {
      id: 'sub_pro',
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(activeSub, now)
    const activityLimit = entitlements.limits.active_activities
    const activeCount = 10

    expect(entitlements.isPro).toBe(true)
    expect(activityLimit).toBe(10000)
    expect(activeCount >= activityLimit).toBe(false) // Not at limit
  })

  it('PRO user at 9999 activities is NOT blocked', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const activeSub: SubscriptionSnapshot = {
      id: 'sub_pro',
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(activeSub, now)
    const activityLimit = entitlements.limits.active_activities
    const activeCount = 9999

    expect(activeCount >= activityLimit).toBe(false)
  })

  it('cancel-at-period-end PRO user still has PRO limit until period ends', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const graceSub: SubscriptionSnapshot = {
      id: 'sub_grace',
      plan: 'PRO_MONTHLY',
      status: 'CANCELLED',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-09-30T23:59:59Z'),
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-09-10T10:00:00Z'),
      isIntroductory: false,
    }
    const entitlements = calculateEntitlements(graceSub, now)
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.limits.active_activities).toBe(10000)
  })
})
