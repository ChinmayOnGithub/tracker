/**
 * tests/billing-lifecycle-matrix.test.ts
 *
 * Regression tests for #51/#53 — complete billing lifecycle coverage.
 *
 * Verifies that calculateEntitlements() produces correct results for every
 * subscription state a user may have, including legacy/historical cases.
 *
 * Safety rule: CREATED/PENDING status must never grant Pro access.
 * Cancel-at-period-end must preserve access until currentPeriodEnd.
 * Expired/halted subscriptions must immediately revert to FREE.
 */

import { describe, it, expect } from 'bun:test'
import { calculateEntitlements, SubscriptionSnapshot } from '@/lib/billing/entitlements'

const now = new Date()
const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)   // 30 days future
const pastDate   = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)    // 1 day past
const farPast    = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)   // 90 days past

function makeSub(overrides: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    id: 'sub_test',
    plan: 'PRO_MONTHLY',
    status: 'ACTIVE',
    billingInterval: 'monthly',
    currentPeriodStart: pastDate,
    currentPeriodEnd: futureDate,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    isIntroductory: false,
    ...overrides,
  }
}

describe('Billing lifecycle entitlement matrix (#51 #53)', () => {

  // -------------------------------------------------------------------------
  // FREE / No subscription
  // -------------------------------------------------------------------------

  it('null subscription → FREE entitlements', () => {
    const e = calculateEntitlements(null)
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
    expect(e.limits.active_activities).toBe(10)
  })

  // -------------------------------------------------------------------------
  // Migration safety: historical statuses must NOT grant Pro (#53)
  // -------------------------------------------------------------------------

  it('CREATED status → FREE (checkout not yet completed)', () => {
    const e = calculateEntitlements(makeSub({ status: 'CREATED' }))
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
  })

  it('PENDING status → FREE (payment pending)', () => {
    const e = calculateEntitlements(makeSub({ status: 'PENDING' }))
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
  })

  it('HALTED status → FREE (payment failed, access revoked immediately)', () => {
    const e = calculateEntitlements(makeSub({ status: 'HALTED' }))
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
  })

  it('PAST_DUE status → FREE', () => {
    const e = calculateEntitlements(makeSub({ status: 'PAST_DUE' }))
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
  })

  it('CANCELLED with expired period → FREE', () => {
    const e = calculateEntitlements(makeSub({
      status: 'CANCELLED',
      cancelAtPeriodEnd: true,
      canceledAt: farPast,
      currentPeriodEnd: pastDate,  // period already ended
    }))
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Active Pro — must grant PRO
  // -------------------------------------------------------------------------

  it('PRO_MONTHLY ACTIVE → PRO entitlements', () => {
    const e = calculateEntitlements(makeSub({ plan: 'PRO_MONTHLY', status: 'ACTIVE' }))
    expect(e.plan).toBe('PRO_MONTHLY')
    expect(e.isPro).toBe(true)
    expect(e.limits.active_activities).toBe(10000)
    expect(e.features.advancedCalendar).toBe(true)
  })

  it('PRO_ANNUAL ACTIVE → PRO entitlements', () => {
    const e = calculateEntitlements(makeSub({ plan: 'PRO_ANNUAL', status: 'ACTIVE' }))
    expect(e.plan).toBe('PRO_ANNUAL')
    expect(e.isPro).toBe(true)
    expect(e.limits.active_activities).toBe(10000)
  })

  it('PRO_MONTHLY AUTHENTICATED → PRO (checkout authenticated, first payment pending)', () => {
    const e = calculateEntitlements(makeSub({ status: 'AUTHENTICATED' }))
    expect(e.plan).toBe('PRO_MONTHLY')
    expect(e.isPro).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Cancel-at-period-end — must preserve Pro until period ends (#51)
  // -------------------------------------------------------------------------

  it('ACTIVE + cancelAtPeriodEnd + future period end → still PRO', () => {
    const e = calculateEntitlements(makeSub({
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      canceledAt: pastDate,
      currentPeriodEnd: futureDate,
    }))
    expect(e.isPro).toBe(true)
  })

  it('CANCELLED + cancelAtPeriodEnd + future period end → PRO (grace period active)', () => {
    const e = calculateEntitlements(makeSub({
      status: 'CANCELLED',
      cancelAtPeriodEnd: true,
      canceledAt: pastDate,
      currentPeriodEnd: futureDate,
    }))
    expect(e.isPro).toBe(true)
  })

  it('CANCELLED + cancelAtPeriodEnd + expired period → FREE', () => {
    const e = calculateEntitlements(makeSub({
      status: 'CANCELLED',
      cancelAtPeriodEnd: true,
      canceledAt: farPast,
      currentPeriodEnd: pastDate,
    }))
    expect(e.plan).toBe('FREE')
    expect(e.isPro).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Exact product limits
  // -------------------------------------------------------------------------

  it('FREE active_activities limit = 10', () => {
    const e = calculateEntitlements(null)
    expect(e.limits.active_activities).toBe(10)
    expect(e.limits.maxActiveActivities).toBe(10)
  })

  it('PRO active_activities limit = 10000', () => {
    const e = calculateEntitlements(makeSub({ status: 'ACTIVE' }))
    expect(e.limits.active_activities).toBe(10000)
    expect(e.limits.maxActiveActivities).toBe(10000)
  })

  it('FREE vault limit = 10 files', () => {
    expect(calculateEntitlements(null).limits.maxVaultFiles).toBe(10)
  })

  it('PRO vault limit = 10000 files', () => {
    expect(calculateEntitlements(makeSub({ status: 'ACTIVE' })).limits.maxVaultFiles).toBe(10000)
  })

  // -------------------------------------------------------------------------
  // Feature flags
  // -------------------------------------------------------------------------

  it('FREE: advanced features are all false', () => {
    const e = calculateEntitlements(null)
    expect(e.features.advancedCalendar).toBe(false)
    expect(e.features.premiumVault).toBe(false)
    expect(e.features.advancedJournal).toBe(false)
  })

  it('PRO: advanced features are all true', () => {
    const e = calculateEntitlements(makeSub({ status: 'ACTIVE' }))
    expect(e.features.advancedCalendar).toBe(true)
    expect(e.features.premiumVault).toBe(true)
    expect(e.features.advancedJournal).toBe(true)
  })
})
