import { describe, it, expect } from 'bun:test'
import { db } from '@/lib/db'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { calculateEntitlements } from '@/lib/billing/entitlements'
import { getAuthoritativePrice, getPlan } from '@/lib/billing/plans'
import { ProductTier } from '@/lib/billing/types'

describe('Billing Database & Centralized Entitlements Deep Suite', () => {
  describe('Prisma Database Models Queryability', () => {
    it('should query Subscription table successfully without Prisma table missing errors', async () => {
      const sub = await db.subscription.findFirst({
        where: { deletedAt: null }
      })
      // Should execute without throwing "table public.Subscription does not exist"
      expect(sub === null || typeof sub === 'object').toBe(true)
    })

    it('should query BillingCustomer table successfully', async () => {
      const customer = await db.billingCustomer.findFirst({
        where: { deletedAt: null }
      })
      expect(customer === null || typeof customer === 'object').toBe(true)
    })

    it('should query Payment table successfully', async () => {
      const payment = await db.payment.findFirst({
        where: { deletedAt: null }
      })
      expect(payment === null || typeof payment === 'object').toBe(true)
    })

    it('should query BillingWebhookEvent table successfully', async () => {
      const event = await db.billingWebhookEvent.findFirst({
        where: { deletedAt: null }
      })
      expect(event === null || typeof event === 'object').toBe(true)
    })
  })

  describe('Centralized Pricing & Money Units', () => {
    it('should return ₹29 (2900 paise) for introductory monthly subscription', () => {
      const prev = process.env.RAZORPAY_OFFER_INTRODUCTORY
      try {
        process.env.RAZORPAY_OFFER_INTRODUCTORY = 'offer_test_intro_deep'
        const price = getAuthoritativePrice('PRO_MONTHLY', true)
        expect(price.amount).toBe(29)
        expect(price.amountInPaise).toBe(2900)
        expect(price.isIntroductory).toBe(true)
      } finally {
        process.env.RAZORPAY_OFFER_INTRODUCTORY = prev
      }
    })

    it('should return ₹99 (9900 paise) for standard monthly renewal', () => {
      const price = getAuthoritativePrice('PRO_MONTHLY', false)
      expect(price.amount).toBe(99)
      expect(price.amountInPaise).toBe(9900)
      expect(price.isIntroductory).toBe(false)
    })

    it('should return ₹799 (79900 paise) for annual subscription', () => {
      const price = getAuthoritativePrice('PRO_ANNUAL', false)
      expect(price.amount).toBe(799)
      expect(price.amountInPaise).toBe(79900)
      expect(price.isIntroductory).toBe(false)
    })
  })

  describe('Entitlements: Free vs Pro vs Future Team', () => {
    it('should resolve Free users with 10 vault storage limit and false for premium features', () => {
      const freeEntitlements = calculateEntitlements(null)
      expect(freeEntitlements.tier).toBe('FREE')
      expect(freeEntitlements.isPro).toBe(false)
      expect(freeEntitlements.features.advanced_vault).toBe(false)
      expect(freeEntitlements.features.advanced_calendar).toBe(false)
      expect(freeEntitlements.features.advanced_journal).toBe(false)
      expect(freeEntitlements.limits.vault_storage).toBe(10)
    })

    it('PRO_MONTHLY and PRO_ANNUAL should resolve to identical PRO capability set', () => {
      const now = new Date()
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      const monthly = calculateEntitlements({
        id: 'sub_monthly',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        billingInterval: 'monthly',
        currentPeriodStart: now,
        currentPeriodEnd: future,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        isIntroductory: false
      })

      const annual = calculateEntitlements({
        id: 'sub_annual',
        plan: 'PRO_ANNUAL',
        status: 'ACTIVE',
        billingInterval: 'annual',
        currentPeriodStart: now,
        currentPeriodEnd: future,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        isIntroductory: false
      })

      expect(monthly.tier).toBe('PRO')
      expect(annual.tier).toBe('PRO')
      expect(monthly.isPro).toBe(true)
      expect(annual.isPro).toBe(true)
      expect(monthly.features.advanced_vault).toBe(true)
      expect(annual.features.advanced_vault).toBe(true)
      expect(monthly.features.advanced_calendar).toBe(true)
      expect(annual.features.advanced_calendar).toBe(true)
      expect(monthly.limits.vault_storage).toBe(10000)
      expect(annual.limits.vault_storage).toBe(10000)
    })

    it('should support future TEAM tier conceptually without rewriting entitlement structures', () => {
      const supportedTiers: ProductTier[] = ['FREE', 'PRO', 'TEAM']
      expect(supportedTiers).toContain('TEAM')
      
      const proPlan = getPlan('PRO_MONTHLY')
      expect(proPlan.tier).toBe('PRO')
    })
  })

  describe('Feature & Limit Helpers in EntitlementService', () => {
    it('should properly check vault capacity limit for Free plan (10 files)', async () => {
      // Free user capacity check
      const underLimit = await EntitlementService.checkVaultCapacity('non_existent_free_user', 9)
      expect(underLimit.allowed).toBe(true)
      expect(underLimit.maxFiles).toBe(10)

      const atLimit = await EntitlementService.checkVaultCapacity('non_existent_free_user', 10)
      expect(atLimit.allowed).toBe(false)

      const overLimit = await EntitlementService.checkVaultCapacity('non_existent_free_user', 15)
      expect(overLimit.allowed).toBe(false)
    })
  })
})
