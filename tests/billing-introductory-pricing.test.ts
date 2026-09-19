import { describe, it, expect } from 'bun:test'
import { BillingService } from '@/lib/services/BillingService'
import { db } from '@/lib/db'

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
})
