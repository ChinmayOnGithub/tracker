import { db } from '@/lib/db'
import { isAuthorizedUserEmail, ALLOWED_USER_EMAILS } from '@/lib/constants'

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

export interface AuthenticatedUser {
  id: string
  username: string
  email?: string | null
  isOwner: boolean
  accessLevel?: string
}

export interface AuthorizedPageContext {
  user: AuthenticatedUser | null
  permissions: Record<TrackerModuleKey, boolean>
  isOwner: boolean
  canAccess: boolean
}

export class AuthorizationService {
  /**
   * Authoritative owner determination policy.
   * Centralizes check across username 'admin', configured allowed emails, and owner access levels.
   */
  public static isOwner(
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
   */
  public static async getEffectiveGuestPermissions(
    customUser?: { id?: string; username?: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null
  ): Promise<Record<TrackerModuleKey, boolean>> {
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
  }

  /**
   * Checks whether a user can access a specific module.
   */
  public static canAccessModule(
    user: { id: string; username: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null | undefined,
    moduleKey: TrackerModuleKey,
    guestPermissions?: Record<string, boolean>
  ): boolean {
    if (!user) return false
    if (this.isOwner(user)) return true
    if (moduleKey === 'settings') return true
    const perms = guestPermissions || DEFAULT_GUEST_PERMISSIONS
    return perms[moduleKey] === true
  }

  /**
   * Checks whether an authenticated user has authorization for a given capability.
   */
  public static canAccess(
    user: { id: string; username: string; email?: string | null; isOwner?: boolean; accessLevel?: string } | null | undefined,
    capability: TrackerCapability,
    guestPermissions?: Record<string, boolean>
  ): boolean {
    if (!user) return false
    const isOwner = this.isOwner(user)

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

      const perms = guestPermissions || DEFAULT_GUEST_PERMISSIONS
      if (capability.startsWith('journal.')) return perms.journal === true
      if (capability.startsWith('vault.')) return perms.documents === true
      if (capability.startsWith('calendar.personal')) return perms.calendar === true
      if (capability.startsWith('leave.')) return perms.leave === true
      if (capability.startsWith('weight.')) return perms.weight === true
      if (capability.startsWith('work-hours.')) return perms.today === true
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

  /**
   * Resolves the server-side authorized context for a page.
   * Executes authentication and module authorization before sensitive data is fetched.
   */
  public static async getAuthorizedPageContext(options: {
    module: TrackerModuleKey
  }): Promise<AuthorizedPageContext> {
    const { SessionService } = await import('./SessionService')
    const user = await SessionService.getSessionUser()
    if (!user) {
      return {
        user: null,
        permissions: { ...DEFAULT_GUEST_PERMISSIONS },
        isOwner: false,
        canAccess: false,
      }
    }

    const isOwner = this.isOwner(user)
    const permissions = await this.getEffectiveGuestPermissions()
    const canAccess = this.canAccessModule(user, options.module, permissions)

    return {
      user,
      permissions,
      isOwner,
      canAccess,
    }
  }

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
    const perms = await this.getEffectiveGuestPermissions()
    if (!this.canAccessModule(user, moduleKey, perms)) {
      throw new Error(`Access denied: Module '${moduleKey}' is disabled for guest accounts`)
    }
    return user
  }

  /**
   * Server-side guard requiring specific capability.
   */
  public static async requireCapability(capability: TrackerCapability): Promise<AuthenticatedUser> {
    const user = await this.requireAuth()
    if (!this.canAccess(user, capability)) {
      throw new Error(`Unauthorized: missing capability ${capability}`)
    }
    return user
  }

  /**
   * Server-side guard requiring ownership of a database entity.
   */
  public static async requireOwnership(
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
  ): Promise<AuthenticatedUser> {
    const user = await this.requireAuth()

    let record: Record<string, unknown> | null = null
    if (model === 'savedLink') {
      record = await db.savedLink.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'linkCollection') {
      record = await db.linkCollection.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'linkTag') {
      record = await db.linkTag.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'activityTemplate') {
      record = await db.activityTemplate.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'activityLog') {
      record = await db.activityLog.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'note') {
      record = await db.note.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'journalEntry') {
      record = await db.journalEntry.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'leaveRecord') {
      record = await db.leaveRecord.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'weightRecord') {
      record = await db.weightRecord.findUnique({ where: { id } }) as Record<string, unknown> | null
    } else if (model === 'secureDocument') {
      record = await db.secureDocument.findUnique({ where: { id } }) as Record<string, unknown> | null
    }

    if (!record) {
      throw new Error(`Record not found: ${model} with id ${id}`)
    }

    const ownerId = record.userId as string | undefined
    const isOwner = ownerId ? ownerId === user.id : this.isOwner(user)
    if (!isOwner) {
      throw new Error(`Forbidden: you do not have permission to access this ${model}`)
    }

    return user
  }
}
