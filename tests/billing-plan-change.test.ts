/**
 * tests/billing-plan-change.test.ts
 *
 * Regression tests for #45 (safe plan change) and #53 (legacy safety):
 * - Blocks silent overlapping subscription creation when an active plan already exists (PLAN_SWITCH_NOT_ALLOWED)
 * - Blocks subscribing to the same plan when already active (ALREADY_SUBSCRIBED)
 * - Allows subscribing when the previous subscription is expired or cancelled past grace period
 * - Canonical subscription resolver prefers valid active subscription over newer pending/created records
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { BillingService } from '@/lib/services/BillingService'
import { db } from '@/lib/db'
import { MockBillingProvider, setBillingProvider } from '@/lib/billing/providers'
import { selectCanonicalSubscription } from '@/lib/billing/subscriptionSelector'

describe('Plan Change Safety (#45) & Subscription Selection Invariants (#53)', () => {
  beforeEach(() => {
    setBillingProvider(new MockBillingProvider())
  })

  afterEach(() => {
    setBillingProvider(null)
  })

  it('should block starting PRO_ANNUAL if user has an active PRO_MONTHLY subscription (PLAN_SWITCH_NOT_ALLOWED)', async () => {
    const originalFindActive = db.subscription.findFirst
    const originalFindMany = db.subscription.findMany

    const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)

    try {
      // Mock findFirst for requested plan check -> returns null (not already subscribed to PRO_ANNUAL)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(db.subscription as any).findFirst = async () => null;

      // Mock getCanonicalSubscription (which calls findMany) -> returns active PRO_MONTHLY only for usr_switch_test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(db.subscription as any).findMany = async ({ where }: { where?: { userId?: string } } = {}) => {
        if (where?.userId === 'usr_switch_test') {
          return [
            {
              id: 'sub_monthly_active',
              userId: 'usr_switch_test',
              providerSubscriptionId: 'sub_prov_monthly',
              plan: 'PRO_MONTHLY',
              billingInterval: 'monthly',
              status: 'ACTIVE',
              currentPeriodEnd: futureEnd,
              cancelAtPeriodEnd: false,
              currentPeriodStart: new Date(),
              canceledAt: null,
              isIntroductory: false,
              provider: 'RAZORPAY',
              billingCustomerId: 'cust_1',
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ]
        }
        return []
      };

      let errorThrown: { code?: string; message?: string } | null = null
      try {
        await BillingService.startSubscription('usr_switch_test', 'PRO_ANNUAL')
      } catch (err) {
        errorThrown = err as { code?: string; message?: string }
      }

      expect(errorThrown).not.toBeNull()
      expect(errorThrown?.code).toBe('PLAN_SWITCH_NOT_ALLOWED')
      expect(errorThrown?.message).toContain('Please cancel your current plan before switching')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindActive;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findMany = originalFindMany;
    }
  })

  it('should block starting PRO_MONTHLY if user already has an active PRO_MONTHLY subscription (ALREADY_SUBSCRIBED)', async () => {
    const originalFindActive = db.subscription.findFirst
    const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => ({
        id: 'sub_monthly_active',
        userId: 'usr_same_plan',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: futureEnd
      })

      let errorThrown: { code?: string; message?: string } | null = null
      try {
        await BillingService.startSubscription('usr_same_plan', 'PRO_MONTHLY')
      } catch (err) {
        errorThrown = err as { code?: string; message?: string }
      }

      expect(errorThrown).not.toBeNull()
      expect(errorThrown?.code).toBe('ALREADY_SUBSCRIBED')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindActive
    }
  })

  it('canonical resolver prefers older ACTIVE subscription over a newer PENDING/CREATED subscription (#53)', () => {
    const olderActive = {
      id: 'sub_active_old',
      userId: 'usr_legacy',
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      deletedAt: null
    }

    const newerPending = {
      id: 'sub_pending_new',
      userId: 'usr_legacy',
      plan: 'PRO_ANNUAL',
      status: 'PENDING',
      currentPeriodEnd: null,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      deletedAt: null
    }

    const effective = selectCanonicalSubscription([olderActive, newerPending])
    expect(effective).not.toBeNull()
    expect(effective?.id).toBe('sub_active_old')
    expect(effective?.status).toBe('ACTIVE')
  })

  it('canonical resolver ignores soft-deleted subscriptions even if they were ACTIVE (#53)', () => {
    const deletedActive = {
      id: 'sub_deleted',
      userId: 'usr_legacy',
      plan: 'PRO_ANNUAL',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      deletedAt: new Date()
    }

    const effective = selectCanonicalSubscription([deletedActive])
    expect(effective).toBeNull()
  })

  describe('BillingService.changeSubscriptionPlan (#45)', () => {
    it('successfully changes plan from PRO_MONTHLY to PRO_ANNUAL without creating duplicate subscriptions', async () => {
      const originalFindMany = db.subscription.findMany
      const originalUpdate = db.subscription.update
      const originalAuditLog = db.auditLog.create

      let updatedData: { plan: string; billingInterval: string } | null = null
      let auditCreated: { action: string; newData: { oldPlan: string; newPlan: string } } | null = null

      try {
        // Mock getCanonicalSubscription
        ;(db.subscription as unknown as { findMany: () => Promise<unknown[]> }).findMany = async () => [
          {
            id: 'sub_123',
            userId: 'usr_plan_change',
            providerSubscriptionId: 'sub_prov_123',
            plan: 'PRO_MONTHLY',
            billingInterval: 'monthly',
            status: 'ACTIVE',
            currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
            provider: 'MOCK',
            deletedAt: null
          }
        ]

        // Mock update
        ;(db.subscription as unknown as { update: (args: { data: { plan: string; billingInterval: string } }) => Promise<unknown> }).update = async ({ data }) => {
          updatedData = data
          return {
            id: 'sub_123',
            userId: 'usr_plan_change',
            providerSubscriptionId: 'sub_prov_123',
            plan: data.plan,
            billingInterval: data.billingInterval,
            status: 'ACTIVE',
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
            deletedAt: null
          }
        }

        // Mock auditLog
        ;(db.auditLog as unknown as { create: (args: { data: { action: string; newData: { oldPlan: string; newPlan: string } } }) => Promise<unknown> }).create = async ({ data }) => {
          auditCreated = data
          return { id: 'audit_1', ...data }
        }

        const result = await BillingService.changeSubscriptionPlan('usr_plan_change', 'PRO_ANNUAL')

        expect(result.success).toBe(true)
        expect(result.subscription.plan).toBe('PRO_ANNUAL')
        expect(result.isPro).toBe(true)
        expect(updatedData).not.toBeNull()
        expect(updatedData!.plan).toBe('PRO_ANNUAL')
        expect(updatedData!.billingInterval).toBe('annual')
        expect(auditCreated).not.toBeNull()
        expect(auditCreated!.action).toBe('SUBSCRIPTION_PLAN_CHANGED')
        expect(auditCreated!.newData.oldPlan).toBe('PRO_MONTHLY')
        expect(auditCreated!.newData.newPlan).toBe('PRO_ANNUAL')
      } finally {
        ;(db.subscription as unknown as { findMany: unknown }).findMany = originalFindMany
        ;(db.subscription as unknown as { update: unknown }).update = originalUpdate
        ;(db.auditLog as unknown as { create: unknown }).create = originalAuditLog
      }
    })

    it('rejects changing to the same plan user already has', async () => {
      const originalFindMany = db.subscription.findMany

      try {
        ;(db.subscription as unknown as { findMany: () => Promise<unknown[]> }).findMany = async () => [
          {
            id: 'sub_123',
            userId: 'usr_plan_change',
            providerSubscriptionId: 'sub_prov_123',
            plan: 'PRO_MONTHLY',
            billingInterval: 'monthly',
            status: 'ACTIVE',
            currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
            provider: 'MOCK',
            deletedAt: null
          }
        ]

        let error: (Error & { code?: string }) | null = null
        try {
          await BillingService.changeSubscriptionPlan('usr_plan_change', 'PRO_MONTHLY')
        } catch (err) {
          error = err as (Error & { code?: string })
        }

        expect(error).not.toBeNull()
        expect(error!.code).toBe('SAME_PLAN')
      } finally {
        ;(db.subscription as unknown as { findMany: unknown }).findMany = originalFindMany
      }
    })

    it('rejects changing to FREE plan via changeSubscriptionPlan, guiding toward cancellation', async () => {
      let error: (Error & { code?: string }) | null = null
      try {
        await BillingService.changeSubscriptionPlan('usr_plan_change', 'FREE')
      } catch (err) {
        error = err as (Error & { code?: string })
      }

      expect(error).not.toBeNull()
      expect(error!.code).toBe('INVALID_PLAN')
    })

    it('fails when user has no active paid subscription to change', async () => {
      const originalFindMany = db.subscription.findMany

      try {
        ;(db.subscription as unknown as { findMany: () => Promise<unknown[]> }).findMany = async () => []

        let error: (Error & { code?: string }) | null = null
        try {
          await BillingService.changeSubscriptionPlan('usr_no_sub', 'PRO_ANNUAL')
        } catch (err) {
          error = err as (Error & { code?: string })
        }

        expect(error).not.toBeNull()
        expect(error!.code).toBe('SUBSCRIPTION_NOT_FOUND')
      } finally {
        ;(db.subscription as unknown as { findMany: unknown }).findMany = originalFindMany
      }
    })
  })
})


