import { describe, expect, test } from 'bun:test'
import {
  BILLING_CAPABILITIES,
  getActivityLimit,
  getCapabilityValue,
  getVaultLimit,
} from '@/lib/billing/capabilities'
import type { UserEntitlements } from '@/lib/billing/types'

const free: UserEntitlements = {
  tier: 'FREE',
  plan: 'FREE',
  isPro: false,
  features: {
    advanced_calendar: false,
    advanced_journal: false,
    advanced_vault: false,
    unlimited_notes: true,
    priority_sync: false,
    premiumVault: false,
    advancedCalendar: false,
    advancedJournal: false,
    unlimitedNotes: true,
    prioritySupport: false,
  },
  limits: {
    vault_storage: 10,
    active_activities: 10,
    maxVaultFiles: 10,
    maxActiveActivities: 10,
  },
  subscription: null,
}

const pro: UserEntitlements = {
  ...free,
  tier: 'PRO',
  plan: 'PRO_MONTHLY',
  isPro: true,
  features: {
    ...free.features,
    advanced_calendar: true,
    advanced_journal: true,
    advanced_vault: true,
    priority_sync: true,
    premiumVault: true,
    advancedCalendar: true,
    advancedJournal: true,
    prioritySupport: true,
  },
  limits: {
    ...free.limits,
    vault_storage: 10000,
    active_activities: 10000,
    maxVaultFiles: 10000,
    maxActiveActivities: 10000,
  },
}

describe('billing capability presentation model', () => {
  test('uses the canonical five feature capabilities', () => {
    expect(BILLING_CAPABILITIES.map((item) => item.key)).toEqual([
      'advanced_calendar',
      'advanced_journal',
      'advanced_vault',
      'unlimited_notes',
      'priority_sync',
    ])
  })

  test('reflects feature flags from entitlements without frontend isPro inference', () => {
    expect(getCapabilityValue(free, 'advanced_calendar')).toBe(false)
    expect(getCapabilityValue(free, 'unlimited_notes')).toBe(true)
    expect(getCapabilityValue(pro, 'advanced_calendar')).toBe(true)
    expect(getCapabilityValue(pro, 'priority_sync')).toBe(true)
  })

  test('renders canonical capacity limits', () => {
    expect(getVaultLimit(free)).toBe(10)
    expect(getVaultLimit(pro)).toBe(10000)
    expect(getActivityLimit(free)).toBe(10)
    expect(getActivityLimit(pro)).toBe(10000)
  })
})
