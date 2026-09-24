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
    unlimited_notes: false,
    priority_sync: false,
    premiumVault: false,
    advancedCalendar: false,
    advancedJournal: false,
    unlimitedNotes: false,
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
    unlimited_notes: true,
    priority_sync: true,
    premiumVault: true,
    advancedCalendar: true,
    advancedJournal: true,
    unlimitedNotes: true,
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
  test('uses the canonical active commercial capabilities', () => {
    expect(BILLING_CAPABILITIES.map((item) => item.key)).toEqual([
      'advanced_calendar',
      'advanced_journal',
      'unlimited_notes',
    ])
  })

  test('reflects feature flags from entitlements without frontend isPro inference', () => {
    expect(getCapabilityValue(free, 'advanced_calendar')).toBe(false)
    expect(getCapabilityValue(free, 'unlimited_notes')).toBe(false)
    expect(getCapabilityValue(pro, 'advanced_calendar')).toBe(true)
    expect(getCapabilityValue(pro, 'unlimited_notes')).toBe(true)
  })

  test('maps every canonical capability to a real product surface', () => {
    const byKey = Object.fromEntries(BILLING_CAPABILITIES.map((item) => [item.key, item]))
    expect(byKey.advanced_calendar.href).toBe('/calendar')
    expect(byKey.advanced_journal.href).toBe('/journal')
    expect(byKey.unlimited_notes.href).toBe('/notes')
  })

  test('renders canonical capacity limits', () => {
    expect(getVaultLimit(free)).toBe(10)
    expect(getVaultLimit(pro)).toBe(10000)
    expect(getActivityLimit(free)).toBe(10)
    expect(getActivityLimit(pro)).toBe(10000)
  })
})
