import {
  AuthorizationService,
  TrackerCapability,
  TrackerModuleKey,
  DEFAULT_GUEST_PERMISSIONS,
  AuthenticatedUser,
  AuthorizedPageContext,
} from './services/AuthorizationService'

export type {
  TrackerCapability,
  TrackerModuleKey,
  AuthenticatedUser,
  AuthorizedPageContext,
}
export { DEFAULT_GUEST_PERMISSIONS }

/**
 * Checks whether a user entity represents an authorized owner.
 * Authoritative delegation to AuthorizationService.
 */
export function isOwnerUser(
  user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null | undefined
): boolean {
  return AuthorizationService.isOwner(user)
}

/**
 * Resolves the canonical Owner user from the database.
 */
export async function getCanonicalOwner() {
  return AuthorizationService.getCanonicalOwner()
}

/**
 * Retrieves the canonical owner's effective guest permissions from userSetting.
 */
export async function getEffectiveGuestPermissions(customUser?: Parameters<typeof AuthorizationService.getEffectiveGuestPermissions>[0]): Promise<Record<TrackerModuleKey, boolean>> {
  return AuthorizationService.getEffectiveGuestPermissions(customUser)
}

/**
 * Checks whether a user can access a specific module.
 */
export function canAccessModule(
  user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string; isPro?: boolean } | null | undefined,
  moduleKey: TrackerModuleKey,
  guestPermissions?: Record<string, boolean>,
  entitlementsOrIsPro?: import('@/lib/billing/types').UserEntitlements | boolean | null
): boolean {
  return AuthorizationService.canAccessModule(user, moduleKey, guestPermissions, entitlementsOrIsPro)
}

/**
 * Checks whether an authenticated user has authorization for a given capability.
 */
export function canAccess(
  user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string; isPro?: boolean } | null | undefined,
  capability: TrackerCapability,
  guestPermissions?: Record<string, boolean>,
  entitlementsOrIsPro?: import('@/lib/billing/types').UserEntitlements | boolean | null
): boolean {
  return AuthorizationService.canAccess(user, capability, guestPermissions, entitlementsOrIsPro)
}

/**
 * Server-side guard requiring authentication.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  return AuthorizationService.requireAuth()
}

/**
 * Server-side guard requiring owner access.
 */
export async function requireOwner(): Promise<AuthenticatedUser> {
  return AuthorizationService.requireOwner()
}

/**
 * Server-side guard requiring specific capability.
 */
export async function requireCapability(capability: TrackerCapability): Promise<AuthenticatedUser> {
  return AuthorizationService.requireCapability(capability)
}

/**
 * Server-side guard to enforce module access for the current authenticated user.
 */
export async function requireModuleAccess(moduleKey: TrackerModuleKey): Promise<AuthenticatedUser> {
  return AuthorizationService.requireModuleAccess(moduleKey)
}

/**
 * Server-side guard requiring ownership of a database entity.
 * Eliminates redundant database lookups by delegating to AuthorizationService.requireOwnership.
 */
export async function requireOwnership<T = Record<string, unknown>>(
  model:
    | 'activityTemplate'
    | 'activityLog'
    | 'note'
    | 'journalEntry'
    | 'leaveRecord'
    | 'weightRecord'
    | 'savedLink'
    | 'linkCollection'
    | 'secureDocument'
    | 'linkTag',
  id: string
): Promise<{ user: AuthenticatedUser; record: T }> {
  return AuthorizationService.requireOwnership<T>(model, id)
}

/**
 * Validates that an authenticated user has the necessary Pro entitlement.
 * Enforces canonical EntitlementService.hasFeature API.
 */
export async function requireEntitlement(
  feature: keyof import('@/lib/billing/types').UserEntitlements['features']
) {
  const user = await requireAuth()
  const { EntitlementService } = await import('@/lib/services/EntitlementService')
  const allowed = await EntitlementService.hasFeature(user.id, feature)
  if (!allowed) {
    throw new Error(`Pro subscription required for feature: ${feature}`)
  }
  const entitlements = await EntitlementService.getEntitlements(user.id)
  return { user, entitlements }
}
