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
 */
export async function requireOwnership(
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
) {
  const user = await AuthorizationService.requireOwnership(model, id)
  const { db } = await import('./db')
  let record: Record<string, unknown> | null = null
  if (model === 'savedLink') record = await db.savedLink.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'linkCollection') record = await db.linkCollection.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'linkTag') record = await db.linkTag.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'activityTemplate') record = await db.activityTemplate.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'activityLog') record = await db.activityLog.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'note') record = await db.note.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'journalEntry') record = await db.journalEntry.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'leaveRecord') record = await db.leaveRecord.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'weightRecord') record = await db.weightRecord.findUnique({ where: { id } }) as Record<string, unknown> | null
  else if (model === 'secureDocument') record = await db.secureDocument.findUnique({ where: { id } }) as Record<string, unknown> | null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { record: record as any, user }
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
