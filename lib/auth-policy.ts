import { isAuthorizedUserEmail } from '@/lib/constants'
import type { UserEntitlements } from '@/lib/billing/types'

export type TrackerCapability =
  // Private Core Modules (Owner or Guest-Enabled)
  | 'core.owner'
  | 'journal.read'
  | 'journal.write'
  | 'vault.read'
  | 'vault.write'
  | 'calendar.personal'
  | 'leave.read'
  | 'leave.write'
  | 'weight.read'
  | 'weight.write'
  | 'work-hours.read'
  | 'work-hours.write'
  | 'settings.manage'
  // Future Shared Tools (Configurable / Multi-User)
  | 'room-turn.read'
  | 'room-turn.write'
  | 'grocery.read'
  | 'grocery.write'
  | 'shared-finance.read'
  | 'shared-finance.write'

export type TrackerModuleKey =
  | 'today'
  | 'calendar'
  | 'activities'
  | 'journal'
  | 'notes'
  | 'leave'
  | 'weight'
  | 'links'
  | 'documents'
  | 'settings'

export const DEFAULT_GUEST_PERMISSIONS: Record<TrackerModuleKey, boolean> = {
  today: false,
  calendar: false,
  activities: false,
  journal: false,
  notes: false,
  leave: false,
  weight: false,
  links: false,
  documents: false,
  settings: true,
}

import {
  getModuleDefinition,
  getProCapabilityForModule,
  isSubscriberDefaultModule,
  getProCapabilityModules,
} from '@/lib/modules/registry'

// Re-export for backward compatibility
export {
  getProCapabilityForModule,
  isSubscriberDefaultModule,
}
export const PRO_CAPABILITY_MODULES = getProCapabilityModules()

/**
 * Pure owner determination policy.
 * Independent of database connections for cross-boundary reuse in client and server.
 */
export function isUserOwner(
  user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null | undefined
): boolean {
  if (!user) return false
  return (
    user.username === 'admin' ||
    user.isOwner === true ||
    user.accessLevel === 'OWNER' ||
    user.accessLevel === 'Private Owner' ||
    isAuthorizedUserEmail(user.email || user.username)
  )
}

/**
 * Unified module authorization decision engine.
 * Single authority used by server route guards, background services, and client sidebar.
 *
 * Rules:
 * 1. Owner -> unconditional access.
 * 2. Settings -> accessible to all authenticated users.
 * 3. Pro subscriber (active subscription / isPro = true):
 *    - Dynamically queries MODULE_REGISTRY for the module definition template.
 *    - If module requires Pro capability, verifies feature entitlement or general Pro status.
 *    - If module is flagged as subscriber default (e.g. today, activities), grants access.
 *    - Unrelated non-Pro modules (leave, weight, links) follow host guest permissions.
 * 4. Free / Non-Pro user:
 *    - Governed strictly by host guest permissions (or default guest perms).
 */
export function canAccessModulePolicy(
  user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string; isPro?: boolean } | null | undefined,
  moduleKey: TrackerModuleKey,
  guestPermissions?: Record<string, boolean>,
  entitlementsOrIsPro?: UserEntitlements | boolean | null
): boolean {
  if (!user) return false
  if (isUserOwner(user)) return true
  if (moduleKey === 'settings') return true

  // Retrieve dynamic module definition template
  const moduleDef = getModuleDefinition(moduleKey)

  // Determine isPro from entitlements or user object
  let isPro = false
  if (typeof entitlementsOrIsPro === 'boolean') {
    isPro = entitlementsOrIsPro
  } else if (entitlementsOrIsPro && typeof entitlementsOrIsPro === 'object') {
    isPro = Boolean(entitlementsOrIsPro.isPro)
  } else if (user && 'isPro' in user && typeof user.isPro === 'boolean') {
    isPro = user.isPro
  }

  if (isPro && moduleDef) {
    // Dynamic check: Does this module require a Pro feature capability?
    if (moduleDef.requiredCapability) {
      if (entitlementsOrIsPro && typeof entitlementsOrIsPro === 'object' && entitlementsOrIsPro.features) {
        const featureKey = moduleDef.requiredCapability
        if (entitlementsOrIsPro.features[featureKey] !== undefined) {
          return Boolean(entitlementsOrIsPro.features[featureKey])
        }
      }
      return true
    }

    // Dynamic check: Is this module granted to all active subscribers?
    if (moduleDef.isSubscriberDefault) {
      return true
    }
  }

  // Fall back to guest permissions / host owner configuration
  const perms = guestPermissions || DEFAULT_GUEST_PERMISSIONS
  return perms[moduleKey] === true
}

/**
 * Unified capability authorization policy.
 */
export function canAccessCapabilityPolicy(
  user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string; isPro?: boolean } | null | undefined,
  capability: TrackerCapability,
  guestPermissions?: Record<string, boolean>,
  entitlementsOrIsPro?: UserEntitlements | boolean | null
): boolean {
  if (!user) return false
  const isOwner = isUserOwner(user)

  const isPrivateCore =
    capability === 'core.owner' ||
    capability.startsWith('journal.') ||
    capability.startsWith('vault.') ||
    capability.startsWith('calendar.personal') ||
    capability.startsWith('leave.') ||
    capability.startsWith('weight.') ||
    capability.startsWith('work-hours.') ||
    capability.startsWith('settings.')

  if (isPrivateCore) {
    if (isOwner) return true
    if (capability === 'core.owner' || capability === 'settings.manage') {
      return false
    }

    let isPro = false
    if (typeof entitlementsOrIsPro === 'boolean') {
      isPro = entitlementsOrIsPro
    } else if (entitlementsOrIsPro && typeof entitlementsOrIsPro === 'object') {
      isPro = Boolean(entitlementsOrIsPro.isPro)
    } else if (user && 'isPro' in user && typeof user.isPro === 'boolean') {
      isPro = user.isPro
    }

    const perms = guestPermissions || DEFAULT_GUEST_PERMISSIONS

    if (capability.startsWith('journal.')) {
      if (isPro) return true
      return perms.journal === true
    }
    if (capability.startsWith('vault.')) {
      if (isPro) return true
      return perms.documents === true
    }
    if (capability.startsWith('calendar.personal')) {
      if (isPro) return true
      return perms.calendar === true
    }
    if (capability.startsWith('work-hours.')) {
      if (isPro) return true
      return perms.today === true
    }
    if (capability.startsWith('leave.')) return perms.leave === true
    if (capability.startsWith('weight.')) return perms.weight === true
    return false
  }

  const knownSharedCapabilities: TrackerCapability[] = [
    'room-turn.read',
    'room-turn.write',
    'grocery.read',
    'grocery.write',
    'shared-finance.read',
    'shared-finance.write',
  ]

  return knownSharedCapabilities.includes(capability)
}
