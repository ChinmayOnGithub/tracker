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
    description: 'Google Calendar provider sync and supported writebacks.',
    moduleLabel: 'Calendar',
    href: '/calendar'
  },
  {
    key: 'advanced_journal',
    name: 'Advanced Journal',
    description: 'Advanced journal capabilities available to your current plan.',
    moduleLabel: 'Journal',
    href: '/?module=journal'
  },
  {
    key: 'advanced_vault',
    name: 'Secure Vault',
    description: 'Encrypted document storage with your plan capacity.',
    moduleLabel: 'Vault',
    href: '/?module=vault'
  },
  {
    key: 'unlimited_notes',
    name: 'Notes & History',
    description: 'Access to the notes/history capability defined by your plan.',
    moduleLabel: 'Notes',
    href: '/?module=notes'
  },
  {
    key: 'priority_sync',
    name: 'Priority Sync',
    description: 'Priority handling for the offline sync queue when enabled.',
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
