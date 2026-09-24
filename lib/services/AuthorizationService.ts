import { cache } from 'react'
import { db } from '@/lib/db'
import { ALLOWED_USER_EMAILS } from '@/lib/constants'
import {
  TrackerCapability,
  TrackerModuleKey,
  DEFAULT_GUEST_PERMISSIONS,
  isUserOwner,
  canAccessModulePolicy,
  canAccessCapabilityPolicy,
} from '@/lib/auth-policy'
import type { UserEntitlements } from '@/lib/billing/types'

export type { TrackerCapability, TrackerModuleKey }
export { DEFAULT_GUEST_PERMISSIONS }

export interface AuthenticatedUser {
  id: string
  username: string
  email?: string | null
  isOwner: boolean
  accessLevel?: string
  isPro?: boolean
}

export interface AuthorizedPageContext {
  user: AuthenticatedUser | null
  permissions: Record<TrackerModuleKey, boolean>
  isOwner: boolean
  canAccess: boolean
  isPro?: boolean
  entitlements?: UserEntitlements | null
}

export class AuthorizationService {
  /**
   * Authoritative owner determination policy.
   * Centralizes check across username 'admin', configured allowed emails, and owner access levels.
   */
  public static isOwner(
    user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null | undefined
  ): boolean {
    return isUserOwner(user)
  }

  /**
   * Resolves the canonical Owner user from the database.
   */
  public static async getCanonicalOwner() {
    const allowedEmails = [
      ...(process.env.ALLOWED_USER_EMAIL ? process.env.ALLOWED_USER_EMAIL.split(',').map(e => e.trim().toLowerCase()) : []),
      ...ALLOWED_USER_EMAILS.map(e => e.toLowerCase()),
    ]

    return await db.user.findFirst({
      where: {
        OR: [
          { email: { in: allowedEmails, mode: 'insensitive' } },
          { username: 'admin' },
        ],
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Retrieves the canonical owner's effective guest permissions from userSetting.
   * Scoped per request using React.cache().
   */
  public static getEffectiveGuestPermissions = cache(async (
    customUser?: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null
  ): Promise<Record<TrackerModuleKey, boolean>> => {
    try {
      let loggedUser = customUser
      if (loggedUser === undefined) {
        try {
          const { getLoggedUser } = await import('@/app/actions/auth')
          loggedUser = await getLoggedUser().catch(() => null)
        } catch {
          loggedUser = null
        }
      }
      if (!loggedUser) {
        try {
          const { SessionService } = await import('./SessionService')
          loggedUser = await SessionService.getSessionUser().catch(() => null)
        } catch {
          loggedUser = null
        }
      }
      let ownerId: string | undefined = undefined

      if (this.isOwner(loggedUser) && loggedUser?.id) {
        ownerId = loggedUser.id
      } else {
        const owner = await this.getCanonicalOwner()
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
  })

  /**
   * Checks whether a user can access a specific module.
   */
  public static canAccessModule(
    user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string; isPro?: boolean } | null | undefined,
    moduleKey: TrackerModuleKey,
    guestPermissions?: Record<string, boolean>,
    entitlementsOrIsPro?: UserEntitlements | boolean | null
  ): boolean {
    return canAccessModulePolicy(user, moduleKey, guestPermissions, entitlementsOrIsPro)
  }

  /**
   * Checks whether an authenticated user has authorization for a given capability.
   */
  public static canAccess(
    user: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string; isPro?: boolean } | null | undefined,
    capability: TrackerCapability,
    guestPermissions?: Record<string, boolean>,
    entitlementsOrIsPro?: UserEntitlements | boolean | null
  ): boolean {
    return canAccessCapabilityPolicy(user, capability, guestPermissions, entitlementsOrIsPro)
  }

  /**
   * Resolves the server-side authorized context for a page.
   * Executes authentication and module authorization before sensitive data is fetched.
   * Scoped per request using React.cache().
   */
  public static getAuthorizedPageContext = cache(async (options: {
    module: TrackerModuleKey
  }): Promise<AuthorizedPageContext> => {
    const { SessionService } = await import('./SessionService')
    const user = await SessionService.getSessionUser()
    if (!user) {
      return {
        user: null,
        permissions: { ...DEFAULT_GUEST_PERMISSIONS },
        isOwner: false,
        canAccess: false,
        isPro: false,
        entitlements: null,
      }
    }

    const isOwner = this.isOwner(user)
    const permissions = await this.getEffectiveGuestPermissions(user)

    let entitlements: UserEntitlements | null = null
    if (user.id) {
      try {
        const { EntitlementService } = await import('./EntitlementService')
        entitlements = await EntitlementService.getEntitlements(user.id)
      } catch {
        entitlements = null
      }
    }
    const isPro = entitlements?.isPro ?? Boolean(user.isPro)
    const canAccess = this.canAccessModule(user, options.module, permissions, entitlements ?? isPro)

    return {
      user,
      permissions,
      isOwner,
      canAccess,
      isPro,
      entitlements,
    }
  })

  /**
   * Server-side guard requiring authentication.
   */
  public static async requireAuth(): Promise<AuthenticatedUser> {
    const { SessionService } = await import('./SessionService')
    const user = await SessionService.getSessionUser()
    if (!user) {
      throw new Error('Authentication required')
    }
    return user
  }

  /**
   * Server-side guard requiring owner authorization.
   */
  public static async requireOwner(): Promise<AuthenticatedUser> {
    const user = await this.requireAuth()
    if (!this.isOwner(user)) {
      throw new Error('Unauthorized: Owner access required')
    }
    return user
  }

  /**
   * Server-side guard requiring module access.
   */
  public static async requireModuleAccess(moduleKey: TrackerModuleKey): Promise<AuthenticatedUser> {
    const user = await this.requireAuth()
    if (this.isOwner(user)) {
      return user
    }
    const perms = await this.getEffectiveGuestPermissions(user)
    let entitlements: UserEntitlements | null = null
    if (user.id) {
      try {
        const { EntitlementService } = await import('./EntitlementService')
        entitlements = await EntitlementService.getEntitlements(user.id)
      } catch {
        entitlements = null
      }
    }
    if (!this.canAccessModule(user, moduleKey, perms, entitlements ?? user.isPro)) {
      throw new Error(`Access denied: Module '${moduleKey}' is disabled for guest accounts`)
    }
    return user
  }

  /**
   * Server-side guard requiring specific capability.
   */
  public static async requireCapability(capability: TrackerCapability): Promise<AuthenticatedUser> {
    const user = await this.requireAuth()
    if (this.isOwner(user)) {
      return user
    }
    const perms = await this.getEffectiveGuestPermissions(user)
    let entitlements: UserEntitlements | null = null
    if (user.id) {
      try {
        const { EntitlementService } = await import('./EntitlementService')
        entitlements = await EntitlementService.getEntitlements(user.id)
      } catch {
        entitlements = null
      }
    }
    if (!this.canAccess(user, capability, perms, entitlements ?? user.isPro)) {
      throw new Error(`Unauthorized: missing capability ${capability}`)
    }
    return user
  }

  /**
   * Server-side guard requiring ownership of a database entity.
   * Scopes the lookup to the authenticated user and eliminates ID-existence disclosure oracles.
   */
  public static async requireOwnership<T = Record<string, unknown>>(
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
    const user = await this.requireAuth()

    let record: Record<string, unknown> | null = null
    if (model === 'savedLink') {
      record = (await db.savedLink.findFirst({
        where: {
          id,
          deletedAt: null,
          collection: { userId: user.id }
        },
        include: { collection: true }
      })) as Record<string, unknown> | null
    } else if (model === 'linkCollection') {
      record = (await db.linkCollection.findFirst({
        where: { id, userId: user.id, deletedAt: null }
      })) as Record<string, unknown> | null
    } else if (model === 'linkTag') {
      record = (await db.linkTag.findFirst({
        where: { id, userId: user.id }
      })) as Record<string, unknown> | null
    } else if (model === 'activityTemplate') {
      record = (await db.activityTemplate.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [
            { userId: user.id },
            ...(this.isOwner(user) ? [{ userId: null }] : [])
          ]
        }
      })) as Record<string, unknown> | null
    } else if (model === 'activityLog') {
      record = (await db.activityLog.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [
            { userId: user.id },
            { activity: { userId: user.id } }
          ]
        }
      })) as Record<string, unknown> | null
    } else if (model === 'note') {
      record = (await db.note.findFirst({
        where: { id, userId: user.id, deletedAt: null }
      })) as Record<string, unknown> | null
    } else if (model === 'journalEntry') {
      record = (await db.journalEntry.findFirst({
        where: { id, userId: user.id, deletedAt: null }
      })) as Record<string, unknown> | null
    } else if (model === 'leaveRecord') {
      record = (await db.leaveRecord.findFirst({
        where: { id, userId: user.id, deletedAt: null }
      })) as Record<string, unknown> | null
    } else if (model === 'weightRecord') {
      record = (await db.weightRecord.findFirst({
        where: { id, userId: user.id, deletedAt: null }
      })) as Record<string, unknown> | null
    } else if (model === 'secureDocument') {
      record = (await db.secureDocument.findFirst({
        where: { id, userId: user.id, deletedAt: null }
      })) as Record<string, unknown> | null
    }

    if (!record) {
      const { NotFoundError } = await import('../errors')
      throw new NotFoundError(`Resource not found`)
    }

    return { user, record: record as T }
  }
}
