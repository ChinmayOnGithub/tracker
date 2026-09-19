import { describe, it, expect } from 'bun:test'
import { getPlan, getAllPlans, getProviderPlanId } from '@/lib/billing/plans'
import { PlanId } from '@/lib/billing/types'

describe('Billing Plans & Centralized Pricing Configuration', () => {
  it('should define the canonical FREE plan with zero price and default features', () => {
    const freePlan = getPlan('FREE')
    expect(freePlan.id).toBe('FREE')
    expect(freePlan.price).toBe(0)
    expect(freePlan.interval).toBe('none')
    expect(freePlan.features.length).toBeGreaterThan(0)
  })

  it('should define PRO_MONTHLY with ₹99 standard price and ₹29 introductory price', () => {
    const monthlyPlan = getPlan('PRO_MONTHLY')
    expect(monthlyPlan.id).toBe('PRO_MONTHLY')
    expect(monthlyPlan.price).toBe(99)
    expect(monthlyPlan.introductoryPrice).toBe(29)
    expect(monthlyPlan.interval).toBe('monthly')
    expect(monthlyPlan.currency).toBe('INR')
    expect(monthlyPlan.popular).toBe(true)
  })

  it('should define PRO_ANNUAL with ₹799 price and annual interval', () => {
    const annualPlan = getPlan('PRO_ANNUAL')
    expect(annualPlan.id).toBe('PRO_ANNUAL')
    expect(annualPlan.price).toBe(799)
    expect(annualPlan.interval).toBe('annual')
    expect(annualPlan.currency).toBe('INR')

    // Verify annual discount math (annual 799 vs 12 * 99 = 1188 is ~33% savings)
    const monthlyFullYear = 99 * 12
    const savingsPercentage = Math.round(((monthlyFullYear - 799) / monthlyFullYear) * 100)
    expect(savingsPercentage).toBe(33)
  })

  it('should fallback gracefully to FREE for unknown or malformed plan identifiers', () => {
    const unknown1 = getPlan('SUPER_VIP')
    expect(unknown1.id).toBe('FREE')

    const unknown2 = getPlan('')
    expect(unknown2.id).toBe('FREE')
  })

  it('should list all available application plans', () => {
    const all = getAllPlans()
    expect(all.length).toBe(3)
    const ids = all.map(p => p.id)
    expect(ids).toContain('FREE')
    expect(ids).toContain('PRO_MONTHLY')
    expect(ids).toContain('PRO_ANNUAL')
  })

  it('should map provider plan IDs correctly based on environment or test defaults', () => {
    const monthlyProviderId = getProviderPlanId('PRO_MONTHLY')
    expect(typeof monthlyProviderId).toBe('string')
    expect(monthlyProviderId.length).toBeGreaterThan(0)

    const annualProviderId = getProviderPlanId('PRO_ANNUAL')
    expect(typeof annualProviderId).toBe('string')
    expect(annualProviderId.length).toBeGreaterThan(0)

    const freeProviderId = getProviderPlanId('FREE' as PlanId)
    expect(freeProviderId).toBe('')
  })
})
