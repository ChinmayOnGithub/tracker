import type { UserEntitlements } from './types'

export type BillingCapabilityKey =
  | 'advanced_calendar'
  | 'advanced_journal'
  | 'unlimited_notes'
  | 'advanced_vault'
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
    description: 'Journal daily writing and multi-format archive export (JSON, Markdown).',
    moduleLabel: 'Journal',
    href: '/journal'
  },
  {
    key: 'unlimited_notes',
    name: 'Notes & Workspace',
    description: 'Notes creation, rich formatting, and deep search history.',
    moduleLabel: 'Notes',
    href: '/notes'
  },
  {
    key: 'advanced_vault',
    name: 'Advanced Vault',
    description: 'Higher storage limits and secure file operations.',
    moduleLabel: 'Vault',
    href: '/vault'
  },
  {
    key: 'priority_sync',
    name: 'Priority Sync',
    description: 'Priority cloud sync and offline conflict resolution.',
    moduleLabel: 'Sync'
  }
]

export function getCapabilityValue(
  entitlements: UserEntitlements,
  key: BillingCapabilityKey
): boolean {
  return Boolean(entitlements.features[key as keyof typeof entitlements.features])
}

export function getVaultLimit(entitlements: UserEntitlements): number {
  return entitlements.limits.vault_storage ?? 10
}

export function getActivityLimit(entitlements: UserEntitlements): number {
  return entitlements.limits.active_activities ?? 10
}
