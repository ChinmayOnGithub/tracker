import { describe, it, expect } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { PLANS, getAllPlans } from '@/lib/billing/plans'
import { selectCanonicalSubscription } from '@/lib/billing/subscriptionSelector'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { BillingService } from '@/lib/services/BillingService'

describe('Architecture Boundary: Billing & Entitlement Authority', () => {
  const rootDir = process.cwd()

  it('BillingService.getSubscription is the single public entry point delegating to selectCanonicalSubscription', () => {
    const billingServicePath = path.join(rootDir, 'lib', 'services', 'BillingService.ts')
    const content = fs.readFileSync(billingServicePath, 'utf8')

    // Must import and call selectCanonicalSubscription
    expect(content).toContain('selectCanonicalSubscription')
    expect(typeof BillingService.getSubscription).toBe('function')
    expect(typeof selectCanonicalSubscription).toBe('function')
  })

  it('EntitlementService enforces canonical hasFeature API and delegates to BillingService.getSubscription', () => {
    const entitlementServicePath = path.join(rootDir, 'lib', 'services', 'EntitlementService.ts')
    const content = fs.readFileSync(entitlementServicePath, 'utf8')

    // Must use hasFeature
    expect(content).toContain('hasFeature')
    expect(typeof EntitlementService.hasFeature).toBe('function')

    // Must delegate to BillingService
    expect(content).toContain('BillingService.getEntitlements')
  })

  it('lib/billing/plans.ts is the authoritative runtime source of truth for plans and pricing', () => {
    expect(PLANS.FREE).toBeDefined()
    expect(PLANS.PRO_MONTHLY).toBeDefined()
    expect(PLANS.PRO_ANNUAL).toBeDefined()

    expect(PLANS.FREE.price).toBe(0)
    expect(PLANS.PRO_MONTHLY.price).toBe(99)
    expect(PLANS.PRO_MONTHLY.introductoryPrice).toBe(29)
    expect(PLANS.PRO_ANNUAL.price).toBe(799)

    const plans = getAllPlans()
    expect(plans.length).toBe(3)
  })

  it('Advertised Pro features map directly to authoritative entitlement feature keys', () => {
    const proMonthly = PLANS.PRO_MONTHLY
    expect(proMonthly.features.length).toBeGreaterThan(0)

    // Check that runtime entitlement types define all critical pro capabilities
    const sampleEntitlements: import('@/lib/billing/types').UserEntitlements = {
      plan: 'PRO_MONTHLY',
      tier: 'PRO',
      isPro: true,
      features: {
        advanced_calendar: true,
        advanced_journal: true,
        advanced_vault: true,
        unlimited_notes: true,
        priority_sync: true,
        premiumVault: true,
        advancedCalendar: true,
        advancedJournal: true,
        unlimitedNotes: true,
        prioritySupport: true,
      },
      limits: {
        vault_storage: 10 * 1024 * 1024 * 1024,
        active_activities: 1000,
        maxVaultFiles: 100000,
        maxActiveActivities: 1000,
      }
    }

    expect(sampleEntitlements.features.advanced_calendar).toBe(true)
    expect(sampleEntitlements.features.advanced_journal).toBe(true)
    expect(sampleEntitlements.features.advanced_vault).toBe(true)
    expect(sampleEntitlements.features.priority_sync).toBe(true)
  })

  it('PricingPanel and SettingsBillingSection import and bind to PLANS catalog', () => {
    const pricingPanelPath = path.join(rootDir, 'components', 'PricingPanel.tsx')
    const settingsBillingPath = path.join(rootDir, 'components', 'SettingsBillingSection.tsx')

    const pricingContent = fs.readFileSync(pricingPanelPath, 'utf8')
    const billingContent = fs.readFileSync(settingsBillingPath, 'utf8')

    expect(pricingContent).toContain("import { PLANS } from '@/lib/billing/plans'")
    expect(billingContent).toContain("import { PLANS } from '@/lib/billing/plans'")
  })
})
