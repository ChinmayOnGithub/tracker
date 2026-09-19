import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { BillingService } from '@/lib/services/BillingService'
import { AuditService } from '@/lib/services/AuditService'
import { db } from '@/lib/db'
import { MockBillingProvider, setBillingProvider } from '@/lib/billing/providers'

describe('Subscription Lifecycle & Billing History Tests', () => {
  beforeEach(() => {
    setBillingProvider(new MockBillingProvider())
  })

  afterEach(() => {
    setBillingProvider(null)
  })
  it('should start subscription: create customer and subscription record with safe checkout', async () => {
    const originalFindActive = db.subscription.findFirst
    const originalFindCustomer = db.billingCustomer.findUnique
    const originalFindUser = db.user.findUnique
    const originalCreateCustomer = db.billingCustomer.create
    const originalUpsertCustomer = db.billingCustomer.upsert
    const originalUpsertSub = db.subscription.upsert
    const originalAuditLog = AuditService.log

    let createdSubPlan = ''
    let createdSubInterval = ''

    try {
      // Mock db queries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.user as any).findUnique = async () => ({ id: 'usr_101', email: 'alice@tracker.local', username: 'alice' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).create = async () => ({
        id: 'cust_db_101',
        userId: 'usr_101',
        providerCustomerId: 'cust_prov_101'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).upsert = async ({ create }: any) => ({
        id: 'cust_db_101',
        userId: 'usr_101',
        providerCustomerId: create.providerCustomerId
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = async ({ create }: { create: { plan: string; billingInterval: string } }) => {
        createdSubPlan = create.plan
        createdSubInterval = create.billingInterval
        return { id: 'sub_db_101', providerSubscriptionId: 'sub_prov_101' }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_start' });

      const result = await BillingService.startSubscription('usr_101', 'PRO_ANNUAL')

      expect(result.checkout).toBeDefined()
      expect(result.checkout.planId).toBe('PRO_ANNUAL')
      expect(result.checkout.amount).toBe(799)
      expect(result.checkout.currency).toBe('INR')
      expect(result.checkout.subscriptionId).toBeDefined()

      expect(createdSubPlan).toBe('PRO_ANNUAL')
      expect(createdSubInterval).toBe('annual')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindActive;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = originalFindCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.user as any).findUnique = originalFindUser;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).create = originalCreateCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).upsert = originalUpsertCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = originalUpsertSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should cancel subscription: set cancelAtPeriodEnd to true and compute effective access date', async () => {
    const originalFindActive = db.subscription.findFirst
    const originalUpdateSub = db.subscription.update
    const originalAuditLog = AuditService.log

    let updatedCancelFlag = false
    const periodEnd = new Date('2026-10-15T00:00:00Z')

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => ({
        id: 'sub_active_cancel',
        userId: 'usr_cancel_test',
        providerSubscriptionId: 'sub_prov_cancel_1',
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = async ({ data }: { data: { cancelAtPeriodEnd: boolean } }) => {
        updatedCancelFlag = data.cancelAtPeriodEnd
        return {}
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_cancel' });

      const res = await BillingService.cancelSubscription('usr_cancel_test')

      expect(res.success).toBe(true)
      expect(res.effectiveDate).toEqual(periodEnd)
      expect(updatedCancelFlag).toBe(true)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindActive;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = originalUpdateSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should retrieve billing history including successful and failed payment records', async () => {
    const originalFindMany = db.payment.findMany

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findMany = async () => [
        {
          id: 'pay_1',
          userId: 'usr_history',
          amount: 29,
          currency: 'INR',
          status: 'SUCCESS',
          method: 'upi',
          paidAt: new Date('2026-08-01T10:00:00Z'),
          providerPaymentId: 'pay_rzp_1',
          subscription: { plan: 'PRO_MONTHLY', billingInterval: 'monthly' }
        },
        {
          id: 'pay_2',
          userId: 'usr_history',
          amount: 99,
          currency: 'INR',
          status: 'FAILED',
          method: 'card',
          paidAt: null,
          providerPaymentId: 'pay_rzp_2',
          subscription: { plan: 'PRO_MONTHLY', billingInterval: 'monthly' }
        }
      ];

      const history = await BillingService.getBillingHistory('usr_history')

      expect(history.length).toBe(2)
      expect(history[0].status).toBe('SUCCESS')
      expect(history[0].amount).toBe(29)
      expect(history[1].status).toBe('FAILED')
      expect(history[1].amount).toBe(99)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findMany = originalFindMany;
    }
  })
})
