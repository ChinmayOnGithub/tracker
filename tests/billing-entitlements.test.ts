import { describe, it, expect } from 'bun:test'
import { calculateEntitlements, SubscriptionSnapshot } from '@/lib/billing/entitlements'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { db } from '@/lib/db'

describe('Server-Authoritative Entitlements Engine', () => {
  it('should resolve unauthenticated or unsubscribed user to default FREE entitlements', () => {
    const entitlements = calculateEntitlements(null)

    expect(entitlements.plan).toBe('FREE')
    expect(entitlements.isPro).toBe(false)
    expect(entitlements.features.premiumVault).toBe(false)
    expect(entitlements.features.advancedCalendar).toBe(false)
    expect(entitlements.features.advancedJournal).toBe(false)
    expect(entitlements.limits.maxVaultFiles).toBe(10)
    expect(entitlements.subscription).toBeNull()
  })

  it('should grant active PRO_MONTHLY user complete pro entitlements and feature access', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const activeSub: SubscriptionSnapshot = {
      id: 'sub_123',
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: true
    }

    const entitlements = calculateEntitlements(activeSub, now)

    expect(entitlements.plan).toBe('PRO_MONTHLY')
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.features.premiumVault).toBe(true)
    expect(entitlements.features.advancedCalendar).toBe(true)
    expect(entitlements.features.advancedJournal).toBe(true)
    expect(entitlements.limits.maxVaultFiles).toBe(10000)
    expect(entitlements.subscription?.status).toBe('ACTIVE')
    expect(entitlements.subscription?.isIntroductory).toBe(true)
  })

  it('should grant active PRO_ANNUAL user complete pro entitlements', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const activeSub: SubscriptionSnapshot = {
      id: 'sub_456',
      plan: 'PRO_ANNUAL',
      status: 'ACTIVE',
      billingInterval: 'annual',
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false
    }

    const entitlements = calculateEntitlements(activeSub, now)

    expect(entitlements.plan).toBe('PRO_ANNUAL')
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.features.premiumVault).toBe(true)
  })

  it('should retain Pro access for cancelled subscription while current period has not ended (cancel-at-period-end)', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const cancelledPendingSub: SubscriptionSnapshot = {
      id: 'sub_cancelled',
      plan: 'PRO_MONTHLY',
      status: 'CANCELLED',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-09-30T23:59:59Z'), // Future relative to now
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-09-10T10:00:00Z'),
      isIntroductory: false
    }

    const entitlements = calculateEntitlements(cancelledPendingSub, now)

    // User must STILL have full Pro access until currentPeriodEnd!
    expect(entitlements.plan).toBe('PRO_MONTHLY')
    expect(entitlements.isPro).toBe(true)
    expect(entitlements.features.premiumVault).toBe(true)
    expect(entitlements.subscription?.cancelAtPeriodEnd).toBe(true)
  })

  it('should revoke Pro access and fallback to FREE when cancelled subscription period ends', () => {
    const now = new Date('2026-10-05T12:00:00Z')
    const expiredSub: SubscriptionSnapshot = {
      id: 'sub_expired',
      plan: 'PRO_MONTHLY',
      status: 'CANCELLED',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-09-30T23:59:59Z'), // In the past relative to now
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-09-10T10:00:00Z'),
      isIntroductory: false
    }

    const entitlements = calculateEntitlements(expiredSub, now)

    expect(entitlements.plan).toBe('FREE')
    expect(entitlements.isPro).toBe(false)
    expect(entitlements.features.premiumVault).toBe(false)
    expect(entitlements.limits.maxVaultFiles).toBe(10)
  })

  it('should downgrade halted or past-due subscriptions immediately to FREE', () => {
    const now = new Date('2026-09-19T12:00:00Z')
    const haltedSub: SubscriptionSnapshot = {
      id: 'sub_halted',
      plan: 'PRO_MONTHLY',
      status: 'HALTED',
      billingInterval: 'monthly',
      currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false
    }

    const entitlements = calculateEntitlements(haltedSub, now)
    expect(entitlements.plan).toBe('FREE')
    expect(entitlements.isPro).toBe(false)
  })

  it('should correctly validate vault storage capacity limits based on entitlements', async () => {
    const originalFindMany = db.subscription.findMany
    try {
      // Mock db.subscription.findMany to return empty (Free plan)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findMany = async () => []

      const capacityUnder = await EntitlementService.checkVaultCapacity('user_test', 5)
      expect(capacityUnder.allowed).toBe(true)
      expect(capacityUnder.maxFiles).toBe(10)
      expect(capacityUnder.isPro).toBe(false)

      const capacityOver = await EntitlementService.checkVaultCapacity('user_test', 10)
      expect(capacityOver.allowed).toBe(false)
      expect(capacityOver.maxFiles).toBe(10);

      // Mock active pro subscription — findMany returns array with one ACTIVE record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findMany = async () => ([
        {
          id: 'sub_pro',
          userId: 'user_test',
          plan: 'PRO_MONTHLY',
          status: 'ACTIVE',
          billingInterval: 'monthly',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 86400000),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          isIntroductory: false,
          provider: 'RAZORPAY',
          providerSubscriptionId: 'sub_pro_123',
          billingCustomerId: null,
          trialStart: null,
          trialEnd: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        }
      ])

      const capacityPro = await EntitlementService.checkVaultCapacity('user_test', 50)
      expect(capacityPro.allowed).toBe(true)
      expect(capacityPro.isPro).toBe(true)
      expect(capacityPro.maxFiles).toBe(10000)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findMany = originalFindMany
    }
  })
})
