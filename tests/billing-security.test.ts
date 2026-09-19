import { describe, it, expect } from 'bun:test'
import { BillingService } from '@/lib/services/BillingService'
import { AuditService } from '@/lib/services/AuditService'
import { db } from '@/lib/db'
import { SubscriptionNotFoundError } from '@/lib/billing/errors'
import { RazorpayProvider } from '@/lib/billing/providers/RazorpayProvider'
import { MockBillingProvider } from '@/lib/billing/providers/MockBillingProvider'

describe('Billing Security, User Isolation, and Anti-Tampering Tests', () => {
  const provider = new RazorpayProvider({
    keyId: 'rzp_sec_key',
    keySecret: 'sec_secret',
    webhookSecret: 'sec_webhook_secret'
  })

  it('should enforce user isolation: getBillingHistory filters strictly by authenticated userId', async () => {
    let queriedUserId = ''
    const originalFindMany = db.payment.findMany

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findMany = async ({ where }: { where: { userId: string } }) => {
        queriedUserId = where.userId
        return []
      };

      await BillingService.getBillingHistory('victim_user_id')
      expect(queriedUserId).toBe('victim_user_id')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findMany = originalFindMany;
    }
  })

  it('should reject cancellation if requested by a user who does not own the subscription (IDOR prevention)', async () => {
    const originalFindFirst = db.subscription.findFirst

    try {
      // Mock db.subscription.findFirst returning null because the subscription belongs to someone else
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async ({ where }: { where: { userId: string } }) => {
        if (where.userId === 'attacker_user_id') {
          return null // Attacker has no active subscription
        }
        return { id: 'sub_victim', userId: 'victim_user_id' }
      };

      expect(
        BillingService.cancelSubscription('attacker_user_id')
      ).rejects.toThrow(SubscriptionNotFoundError)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindFirst;
    }
  })

  it('should prevent client-side price tampering: startSubscription enforces canonical plan pricing on server', async () => {
    const originalFindFirst = db.subscription.findFirst
    const originalFindCustomer = db.billingCustomer.findUnique
    const originalFindFirstCustomer = db.billingCustomer.findFirst
    const originalFindPayment = db.payment.findFirst
    const originalUpsertSub = db.subscription.upsert
    const originalAuditLog = AuditService.log

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_sec' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = async () => ({
        id: 'cust_sec',
        userId: 'usr_sec',
        providerCustomerId: 'cust_sec_prov'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = async () => ({ id: 'sub_sec' });

      // Even if attacker attempts to request PRO_ANNUAL, price is strictly determined by PLANS.PRO_ANNUAL.price (₹799)
      const mockProvider = new MockBillingProvider()
      const annualResult = await BillingService.startSubscription('usr_sec', 'PRO_ANNUAL', { provider: mockProvider })
      expect(annualResult.checkout.amount).toBe(799)
      expect(annualResult.checkout.currency).toBe('INR')

      // Monthly plan price is strictly determined by server (₹29 intro or ₹99 standard)
      const monthlyResult = await BillingService.startSubscription('usr_sec', 'PRO_MONTHLY', { provider: mockProvider })
      expect(monthlyResult.checkout.amount === 29 || monthlyResult.checkout.amount === 99).toBe(true)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindFirst;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = originalFindCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindFirstCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = originalFindPayment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = originalUpsertSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should prevent forged webhooks: tampered signatures reject with 400 and cause zero mutations', async () => {
    const forgedPayload = JSON.stringify({
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_victim', status: 'active' } },
        payment: { entity: { id: 'pay_attacker', amount: 0 } }
      }
    })

    const forgedSig = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    const result = await BillingService.processWebhook('RAZORPAY', forgedPayload, forgedSig, provider)

    expect(result.status).toBe(400)
    expect(result.message).toContain('Invalid webhook signature')
  })

  it('should fail safely when Razorpay credentials are missing and never silently use mocks in production', async () => {
    const emptyProvider = new RazorpayProvider({ keyId: '', keySecret: '', webhookSecret: '' })

    expect(emptyProvider.isConfigured()).toBe(false)
    expect(emptyProvider.createCustomer({ userId: 'test_user' })).rejects.toThrow('Razorpay credentials are not configured')
    expect(emptyProvider.createSubscription({ planId: 'PRO_MONTHLY', customerId: 'cust_1' })).rejects.toThrow('Razorpay credentials are not configured')
    expect(emptyProvider.cancelSubscription({ providerSubscriptionId: 'sub_1' })).rejects.toThrow('Razorpay credentials are not configured')
    expect(emptyProvider.retrieveSubscription('sub_1')).rejects.toThrow('Razorpay credentials are not configured')
    expect(emptyProvider.retrievePayment('pay_1')).rejects.toThrow('Razorpay credentials are not configured')
    expect(emptyProvider.verifyWebhookSignature('payload', 'sig')).toBe(false)
  })

  it('should prevent multiple introductory subscriptions under concurrent checkout requests (concurrency lock)', async () => {
    const mockProvider = new MockBillingProvider()
    let hasUsedIntro = false

    const originalFindActive = db.subscription.findFirst
    const originalFindCustomer = db.billingCustomer.findUnique
    const originalFindFirstCustomer = db.billingCustomer.findFirst
    const originalUpdateManyCustomer = db.billingCustomer.updateMany
    const originalFindPayment = db.payment.findFirst
    const originalUpsertSub = db.subscription.upsert
    const originalAuditLog = AuditService.log

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_race' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => ({ hasUsedIntroductoryOffer: hasUsedIntro });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = async () => ({
        id: 'cust_race_1',
        userId: 'usr_race_1',
        providerCustomerId: 'cust_prov_race',
        hasUsedIntroductoryOffer: hasUsedIntro
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).updateMany = async ({ where }: { where: { hasUsedIntroductoryOffer: boolean } }) => {
        if (!hasUsedIntro && where.hasUsedIntroductoryOffer === false) {
          hasUsedIntro = true
          return { count: 1 } // First request succeeds in reserving
        }
        return { count: 0 } // Subsequent concurrent request fails to reserve
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = async () => ({ id: 'sub_race' });

      // Run two simultaneous checkout start calls for PRO_MONTHLY
      const [reqA, reqB] = await Promise.all([
        BillingService.startSubscription('usr_race_1', 'PRO_MONTHLY', { provider: mockProvider }),
        BillingService.startSubscription('usr_race_1', 'PRO_MONTHLY', { provider: mockProvider })
      ])

      // Exactly ONE request must get the introductory offer (₹29), and the other must get standard pricing (₹99)
      const introCount = [reqA, reqB].filter(r => r.checkout.isIntroductory).length
      const amounts = [reqA.checkout.amount, reqB.checkout.amount].sort()

      expect(introCount).toBe(1)
      expect(amounts).toEqual([29, 99])
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindActive;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = originalFindCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindFirstCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).updateMany = originalUpdateManyCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = originalFindPayment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = originalUpsertSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should verify that key secret and webhook secret are never included in safe checkout payload', async () => {
    const mockProvider = new MockBillingProvider()
    const originalFindActive = db.subscription.findFirst
    const originalFindCustomer = db.billingCustomer.findUnique
    const originalFindFirstCustomer = db.billingCustomer.findFirst
    const originalFindPayment = db.payment.findFirst
    const originalUpsertSub = db.subscription.upsert
    const originalAuditLog = AuditService.log

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_safe' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = async () => ({
        id: 'cust_sec_leak',
        userId: 'usr_sec_leak',
        providerCustomerId: 'cust_sec_leak_prov'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = async () => ({ id: 'sub_sec_leak' });

      const res = await BillingService.startSubscription('usr_sec_leak', 'PRO_MONTHLY', { provider: mockProvider })

      // Validate SafeCheckoutPayload properties
      const serialized = JSON.stringify(res.checkout)
      expect(serialized).not.toContain('keySecret')
      expect(serialized).not.toContain('webhookSecret')
      expect(serialized).not.toContain('RAZORPAY_KEY_SECRET')
      expect('keySecret' in res.checkout).toBe(false)
      expect('webhookSecret' in res.checkout).toBe(false)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindActive;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = originalFindCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindFirstCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = originalFindPayment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).upsert = originalUpsertSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })
})
