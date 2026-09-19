import { db } from './db'
import { getLoggedUser } from '@/app/actions/auth'
import { isAuthorizedUserEmail, ALLOWED_USER_EMAILS } from './constants'

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
  leave: false,
  weight: false,
  links: false,
  documents: false,
  settings: true,
}

/**
 * Checks whether a user entity represents an authorized owner.
 */
export function isOwnerUser(
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
 * Resolves the canonical Owner user from the database.
 * Never relies on fragile "first user in database" ordering.
 */
export async function getCanonicalOwner() {
  const allowedEmails = [
    ...(process.env.ALLOWED_USER_EMAIL ? process.env.ALLOWED_USER_EMAIL.split(',').map(e => e.trim().toLowerCase()) : []),
    ...ALLOWED_USER_EMAILS.map(e => e.toLowerCase()),
  ]

  const owner = await db.user.findFirst({
    where: {
      OR: [
        { email: { in: allowedEmails, mode: 'insensitive' } },
        { username: 'admin' },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })
  return owner
}

/**
 * Retrieves the canonical owner's effective guest permissions from userSetting.
 * If logged-in user is an owner, uses their id directly; otherwise resolves the canonical owner.
 */
export async function getEffectiveGuestPermissions(): Promise<Record<TrackerModuleKey, boolean>> {
  try {
    const loggedUser = await getLoggedUser()
    let ownerId: string | undefined = undefined

    if (isOwnerUser(loggedUser) && loggedUser?.id) {
      ownerId = loggedUser.id
    } else {
      const owner = await getCanonicalOwner()
      ownerId = owner?.id
    }

    if (!ownerId) {
      return { ...DEFAULT_GUEST_PERMISSIONS }
    }

    const setting = await db.userSetting.findUnique({
      where: {
        userId_module: {
          userId: ownerId,
          module: 'GUEST_PERMISSIONS',
        },
      },
    })
    if (!setting || !setting.config) {
      return { ...DEFAULT_GUEST_PERMISSIONS }
    }
    const config = setting.config as Record<string, boolean>
    return {
      ...DEFAULT_GUEST_PERMISSIONS,
      ...config,
      settings: true,
    }
  } catch (err) {
    console.error('Failed to get effective guest permissions:', err)
    return { ...DEFAULT_GUEST_PERMISSIONS }
  }
}

/**
 * Checks whether a user can access a specific module.
 * Owners have access to all modules.
 * Guests have access only if the canonical owner enabled that module.
 */
export function canAccessModule(
  user: { id: string; username: string; email?: string | null } | null | undefined,
  moduleKey: TrackerModuleKey,
  guestPermissions?: Record<string, boolean>
): boolean {
  if (!user) return false
  if (isOwnerUser(user)) return true
  if (moduleKey === 'settings') return true
  const perms = guestPermissions || DEFAULT_GUEST_PERMISSIONS
  return perms[moduleKey] === true
}

/**
 * Checks whether an authenticated user has authorization for a given capability.
 * Keeps authentication decoupled from authorization.
 * Supports layered authorization where guest module permissions enable capability
 * for the guest's own scoped data.
 */
export function canAccess(
  user: { id: string; username: string; email?: string | null } | null | undefined,
  capability: TrackerCapability,
  guestPermissions?: Record<string, boolean>
): boolean {
  if (!user) return false

  const isOwner = isOwnerUser(user)

  // 1. Private core capabilities
  const isPrivateCore = capability === 'core.owner' ||
    capability.startsWith('journal.') ||
    capability.startsWith('vault.') ||
    capability.startsWith('calendar.personal') ||
    capability.startsWith('leave.') ||
    capability.startsWith('weight.') ||
    capability.startsWith('work-hours.') ||
    capability.startsWith('settings.')

  if (isPrivateCore) {
    if (isOwner) return true

    // Strictly owner-only capabilities
    if (capability === 'core.owner' || capability === 'settings.manage') {
      return false
    }

    // Module-governed capabilities for guest users
    const perms = guestPermissions || DEFAULT_GUEST_PERMISSIONS
    if (capability.startsWith('journal.')) return perms.journal === true
    if (capability.startsWith('vault.')) return perms.documents === true
    if (capability.startsWith('calendar.personal')) return perms.calendar === true
    if (capability.startsWith('leave.')) return perms.leave === true
    if (capability.startsWith('weight.')) return perms.weight === true
    if (capability.startsWith('work-hours.')) return perms.today === true
    return false
  }

  // Known shared tools
  const knownSharedCapabilities: TrackerCapability[] = [
    'room-turn.read',
    'room-turn.write',
    'grocery.read',
    'grocery.write',
    'shared-finance.read',
    'shared-finance.write',
  ]

  if (knownSharedCapabilities.includes(capability)) {
    return true
  }

  return false
}

export async function requireAuth() {
  const user = await getLoggedUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

export async function requireCapability(capability: TrackerCapability) {
  const user = await requireAuth()
  if (!canAccess(user, capability)) {
    throw new Error(`Unauthorized: missing capability ${capability}`)
  }
  return user
}

/**
 * Server-side guard to enforce module access for the current authenticated user.
 * Owners have full access; guests must have the module enabled in the canonical owner's guest permissions.
 */
export async function requireModuleAccess(moduleKey: TrackerModuleKey) {
  const user = await requireAuth()
  if (isOwnerUser(user)) {
    return user
  }
  const perms = await getEffectiveGuestPermissions()
  if (!canAccessModule(user, moduleKey, perms)) {
    throw new Error(`Access denied: Module '${moduleKey}' is disabled for guest accounts`)
  }
  return user
}

export async function requireOwnership(
  model: 'activityTemplate' | 'activityLog' | 'note' | 'journalEntry' | 'leaveRecord' | 'weightRecord' | 'savedLink' | 'linkCollection' | 'secureDocument' | 'linkTag',
  id: string
) {
  const user = await requireAuth()
  
  // Dynamic lookup on Prisma db client
  let record: Record<string, unknown> | null = null
  if (model === 'savedLink') {
    record = await db.savedLink.findUnique({
      where: { id },
      include: { collection: true }
    })
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic Prisma delegate access
    record = await (db[model] as any).findUnique({
      where: { id }
    })
  }
  
  if (!record) {
    throw new Error(`${model} record not found`)
  }
  
  const collection = record.collection as Record<string, unknown> | undefined
  const ownerId = model === 'savedLink' && collection ? collection.userId : record.userId
  
  // Explicit ownership validation (canonical user match or legacy migration admin check)
  const isOwner = ownerId ? ownerId === user.id : user.username === 'admin'
  if (!isOwner) {
    throw new Error(`Unauthorized ${model} access`)
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { record: record as any, user }
}

/**
 * Validates that an authenticated user has the necessary Pro entitlement.
 */
export async function requireEntitlement(
  feature: keyof import('@/lib/billing/types').UserEntitlements['features']
) {
  const user = await requireAuth()
  const { EntitlementService } = await import('@/lib/services/EntitlementService')
  const allowed = await EntitlementService.canAccessFeature(user.id, feature)
  if (!allowed) {
    throw new Error(`Pro subscription required for feature: ${feature}`)
  }
  const entitlements = await EntitlementService.getEntitlements(user.id)
  return { user, entitlements }
}

