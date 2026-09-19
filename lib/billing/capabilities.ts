import type { UserEntitlements } from './types'

export type BillingCapabilityKey =
  | 'advanced_calendar'
  | 'advanced_journal'
  | 'advanced_vault'
  | 'unlimited_notes'
  | 'priority_sync'

export interface BillingCapabilityDefinition {
  key: BillingCapabilityKey
  name: string
  description: string
  moduleLabel: string
  href?: string
}

export const BILLING_CAPABILITIES: readonly BillingCapabilityDefinition[] = [
  {
    key: 'advanced_calendar',
    name: 'Advanced Calendar',
    description: 'Two-way Google Calendar synchronization and supported writebacks.',
    moduleLabel: 'Calendar',
    href: '/calendar'
  },
  {
    key: 'advanced_journal',
    name: 'Advanced Journal',
    description: 'Journal export and archive capabilities available to your current plan.',
    moduleLabel: 'Journal',
    href: '/journal'
  },
  {
    key: 'advanced_vault',
    name: 'Advanced Vault',
    description: 'Expanded encrypted document capacity based on your active plan.',
    moduleLabel: 'Vault',
    href: '/documents'
  },
  {
    key: 'unlimited_notes',
    name: 'Notes & History',
    description: 'Notes and historical entries available under your current plan.',
    moduleLabel: 'Notes',
    href: '/notes'
  },
  {
    key: 'priority_sync',
    name: 'Priority Sync',
    description: 'Billing entitlement for priority cloud-sync behavior; no separate control is exposed.',
    moduleLabel: 'Sync',
  }
]

export function getCapabilityValue(
  entitlements: UserEntitlements,
  key: BillingCapabilityKey
): boolean {
  return Boolean(entitlements.features[key])
}

export function getVaultLimit(entitlements: UserEntitlements): number {
  return entitlements.limits.vault_storage
}

export function getActivityLimit(entitlements: UserEntitlements): number {
  return entitlements.limits.active_activities
}
