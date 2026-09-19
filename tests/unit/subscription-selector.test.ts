import { describe, it, expect } from 'bun:test'
import { selectCanonicalSubscription, SubscriptionCandidate } from '@/lib/billing/subscriptionSelector'

describe('Subscription Selector Unit Suite — Canonical Decision Engine', () => {
  const baseNow = new Date('2026-09-19T12:00:00.000Z')

  it('returns null when input is empty or null', () => {
    expect(selectCanonicalSubscription([], baseNow)).toBeNull()
    expect(selectCanonicalSubscription(null as unknown as SubscriptionCandidate[], baseNow)).toBeNull()
  })

  it('filters out soft-deleted subscriptions completely', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-deleted',
        userId: 'u1',
        plan: 'PRO_ANNUAL',
        status: 'ACTIVE',
        deletedAt: new Date('2026-09-01T00:00:00.000Z')
      }
    ]
    expect(selectCanonicalSubscription(subs, baseNow)).toBeNull()
  })

  it('returns the single candidate when only one non-deleted subscription exists', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-1',
        userId: 'u1',
        plan: 'FREE',
        status: 'ACTIVE'
      }
    ]
    expect(selectCanonicalSubscription(subs, baseNow)?.id).toBe('sub-1')
  })

  it('prioritizes ACTIVE or AUTHENTICATED subscriptions with valid currentPeriodEnd', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-pending',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'PENDING'
      },
      {
        id: 'sub-active',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-19T12:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-active')
  })

  it('prioritizes PRO_ANNUAL over PRO_MONTHLY when both are active', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-monthly',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-19T12:00:00.000Z'
      },
      {
        id: 'sub-annual',
        userId: 'u1',
        plan: 'PRO_ANNUAL',
        status: 'ACTIVE',
        currentPeriodEnd: '2027-09-19T12:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-annual')
  })

  it('selects latest currentPeriodEnd among multiple active subscriptions of same plan', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-active-short',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-09-25T12:00:00.000Z'
      },
      {
        id: 'sub-active-long',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-25T12:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-active-long')
  })

  it('supports AUTHENTICATED status with unexpired currentPeriodEnd', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-auth',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'AUTHENTICATED',
        currentPeriodEnd: '2026-10-19T12:00:00.000Z'
      },
      {
        id: 'sub-halted',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'HALTED'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-auth')
  })

  it('prioritizes CANCELLED subscriptions in grace period over delinquent or pending', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-grace',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'CANCELLED',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-10-01T00:00:00.000Z' // Future relative to baseNow
      },
      {
        id: 'sub-halted',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'HALTED'
      },
      {
        id: 'sub-created',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'CREATED'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-grace')
  })

  it('ignores expired CANCELLED subscriptions and selects delinquent or pending', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-expired-cancel',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'CANCELLED',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-09-01T00:00:00.000Z' // In the past relative to baseNow
      },
      {
        id: 'sub-past-due',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'PAST_DUE',
        currentPeriodEnd: '2026-09-18T00:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-past-due')
  })

  it('prioritizes HALTED or PAST_DUE over CREATED or PENDING', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-pending',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'PENDING'
      },
      {
        id: 'sub-halted',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'HALTED'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-halted')
  })

  it('selects CREATED or PENDING when no higher tier exists', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-created',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'CREATED',
        createdAt: '2026-09-19T10:00:00.000Z'
      },
      {
        id: 'sub-pending',
        userId: 'u1',
        plan: 'PRO_ANNUAL',
        status: 'PENDING',
        createdAt: '2026-09-19T11:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-pending')
  })

  it('uses createdAt as secondary tie-breaker when currentPeriodEnd is identical', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-older',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-19T12:00:00.000Z',
        createdAt: '2026-09-10T12:00:00.000Z'
      },
      {
        id: 'sub-newer',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-19T12:00:00.000Z',
        createdAt: '2026-09-15T12:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-newer')
  })

  it('safely handles malformed date strings or null values without throwing', () => {
    const subs: SubscriptionCandidate[] = [
      {
        id: 'sub-malformed',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: 'not-a-date',
        createdAt: null
      },
      {
        id: 'sub-valid',
        userId: 'u1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-10-19T12:00:00.000Z',
        createdAt: '2026-09-15T12:00:00.000Z'
      }
    ]
    const chosen = selectCanonicalSubscription(subs, baseNow)
    expect(chosen?.id).toBe('sub-valid')
  })
})
