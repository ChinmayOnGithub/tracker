import { describe, it, expect } from 'bun:test'
import { BillingService } from '@/lib/services/BillingService'
import { db } from '@/lib/db'
import { IBillingProvider } from '@/lib/billing/providers'

describe('Introductory Pricing Server-Authoritative Engine', () => {
  it('should mark a fresh user as eligible for introductory ₹29 pricing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindCustomer = (db.billingCustomer as any).findFirst
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindSub = (db.subscription as any).findFirst
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindPayment = (db.payment as any).findFirst

    try {
      // Mock no prior customer, subscription, or payment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => null;

      const eligible = await BillingService.isEligibleForIntroductoryOffer('fresh_user_123')
      expect(eligible).toBe(true)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindCustomer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindSub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = originalFindPayment
    }
  })

  it('should reject eligibility if customer record indicates offer has already been consumed', async () => {
    const originalFindCustomer = db.billingCustomer.findFirst
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => ({
        id: 'cust_1',
        userId: 'user_already_claimed',
        hasUsedIntroductoryOffer: true,
        introductoryOfferClaimedAt: new Date('2026-08-01T00:00:00Z')
      })

      const eligible = await BillingService.isEligibleForIntroductoryOffer('user_already_claimed')
      expect(eligible).toBe(false)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindCustomer
    }
  })

  it('should reject eligibility if user previously had an introductory subscription, even if cancelled', async () => {
    const originalFindCustomer = db.billingCustomer.findFirst
    const originalFindSub = db.subscription.findFirst
    const originalFindPayment = db.payment.findFirst

    try {
      // Customer record without explicit flag, but subscription history shows prior intro sub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => ({
        id: 'sub_cancelled_intro',
        userId: 'user_cancelled_intro',
        isIntroductory: true,
        status: 'CANCELLED',
        plan: 'PRO_MONTHLY'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => null;

      const eligible = await BillingService.isEligibleForIntroductoryOffer('user_cancelled_intro')
      expect(eligible).toBe(false)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = originalFindPayment;
    }
  })

  it('should reject eligibility if user already paid ₹29 in transaction history', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindCustomer = (db.billingCustomer as any).findFirst
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindSub = (db.subscription as any).findFirst
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindPayment = (db.payment as any).findFirst

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => ({
        id: 'pay_past_intro',
        userId: 'user_paid_intro',
        amount: 29,
        status: 'SUCCESS'
      });

      const eligible = await BillingService.isEligibleForIntroductoryOffer('user_paid_intro')
      expect(eligible).toBe(false)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = originalFindCustomer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = originalFindSub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = originalFindPayment
    }
  })

  it('should rollback intro reservation if checkout creation on provider fails (failed checkout cannot consume intro)', async () => {
    let hasUsedIntro = false
    let reservationRollbackCalled = false

    const originalFindActive = db.subscription.findFirst
    const originalFindCustomer = db.billingCustomer.findUnique
    const originalFindFirstCustomer = db.billingCustomer.findFirst
    const originalUpdateManyCustomer = db.billingCustomer.updateMany
    const originalFindPayment = db.payment.findFirst

    // Provider that throws an error during createSubscription
    const failingProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => ({ providerCustomerId: 'cust_fail_1' }),
      createSubscription: async () => {
        throw new Error('Razorpay network gateway failure')
      },
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: '', status: '', currentStart: null, currentEnd: null, planId: '' }),
      retrievePayment: async () => ({ id: '', amount: 0, currency: '', status: '' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_dummy', eventType: 'dummy', raw: null })
    }

    const prevOffer = process.env.RAZORPAY_OFFER_INTRODUCTORY
    process.env.RAZORPAY_OFFER_INTRODUCTORY = 'offer_test_rollback_123'
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findFirst = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findFirst = async () => ({ hasUsedIntroductoryOffer: hasUsedIntro });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).findUnique = async () => ({
        id: 'cust_fail_rollback',
        userId: 'user_fail_rollback',
        providerCustomerId: 'cust_fail_prov',
        hasUsedIntroductoryOffer: hasUsedIntro
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).updateMany = async ({ data }: { data: { hasUsedIntroductoryOffer: boolean } }) => {
        if (data.hasUsedIntroductoryOffer === false) {
          reservationRollbackCalled = true
          hasUsedIntro = false
        } else {
          hasUsedIntro = true
        }
        return { count: 1 }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).findFirst = async () => null;

      expect(
        BillingService.startSubscription('user_fail_rollback', 'PRO_MONTHLY', { provider: failingProvider })
      ).rejects.toThrow('Razorpay network gateway failure')

      // Wait a microtask for catch block cleanup
      await new Promise(r => setTimeout(r, 10))
      expect(reservationRollbackCalled).toBe(true)
    } finally {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = prevOffer;
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
    }
  })
})
