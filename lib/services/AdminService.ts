import { db } from '../db'
import { BillingService } from './BillingService'
import { EntitlementService } from './EntitlementService'
import { AuditService } from './AuditService'
import { AuthorizationService } from './AuthorizationService'
import { logger } from '../logger'

export interface AdminProduct {
  id: string
  name: string
  slug: string
  status: 'ACTIVE' | 'MAINTENANCE' | 'DEPRECATED'
  environment: string
  integrationMetadata: {
    version: string
    capabilities: string[]
    provider: string
  }
}

export interface AdminUserDetails {
  user: {
    id: string
    username: string
    email: string | null
    createdAt: Date
    updatedAt: Date
  }
  accountStatus: {
    isSuspended: boolean
    suspendedAt?: string | null
    reason?: string | null
  }
  subscription: Awaited<ReturnType<typeof BillingService.getSubscription>>
  entitlements: Awaited<ReturnType<typeof EntitlementService.getEntitlements>>
  usageStats: {
    activeActivities: number
    notesCount: number
    journalEntriesCount: number
  }
  billingHistory: Awaited<ReturnType<typeof BillingService.getBillingHistory>>
  auditHistory: Awaited<ReturnType<typeof AuditService.getLogsForUser>>
}

export class AdminService {
  private static readonly ACCOUNT_STATUS_MODULE = 'ACCOUNT_STATUS'

  /**
   * Authoritative product list managed by the administrative control plane.
   * Product-agnostic foundation where Tracker OS is Product #1.
   */
  static listProducts(): AdminProduct[] {
    return [
      {
        id: 'prod_tracker',
        name: 'Tracker OS',
        slug: 'tracker',
        status: 'ACTIVE',
        environment: process.env.NODE_ENV || 'development',
        integrationMetadata: {
          version: '2.0.0',
          capabilities: ['advanced_calendar', 'advanced_journal', 'unlimited_notes'],
          provider: 'RAZORPAY'
        }
      }
    ]
  }

  /**
   * Verifies admin authentication and authorization.
   * Accepts explicit API key, Authorization Bearer token, or active Owner session.
   */
  static async verifyAdminAuth(
    headersOrKey?: Headers | string | null
  ): Promise<{ authorized: boolean; actor: string; error?: string }> {
    const configuredKey = process.env.ADMIN_API_KEY || (process.env.NODE_ENV === 'test' ? 'test_admin_secret_key' : undefined)

    let providedKey: string | null = null

    if (typeof headersOrKey === 'string') {
      providedKey = headersOrKey
    } else if (headersOrKey && typeof headersOrKey.get === 'function') {
      providedKey = headersOrKey.get('x-admin-key')
      if (!providedKey) {
        const authHeader = headersOrKey.get('authorization')
        if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
          providedKey = authHeader.slice(7).trim()
        }
      }
    }

    // 1. Direct API Key check
    if (configuredKey && providedKey && providedKey === configuredKey) {
      return { authorized: true, actor: 'admin_api_key' }
    }

    // 2. Owner user session fallback
    try {
      const owner = await AuthorizationService.requireOwner()
      if (owner?.id) {
        return { authorized: true, actor: `owner:${owner.username}` }
      }
    } catch {
      // Not logged in as owner
    }

    return {
      authorized: false,
      actor: 'anonymous',
      error: 'Unauthorized: Valid admin credentials or owner session required.'
    }
  }

  /**
   * Checks if an account is suspended.
   */
  static async isUserSuspended(userId: string): Promise<boolean> {
    const setting = await db.userSetting.findUnique({
      where: {
        userId_module: {
          userId,
          module: this.ACCOUNT_STATUS_MODULE
        }
      }
    })

    if (!setting?.config || typeof setting.config !== 'object') {
      return false
    }

    const config = setting.config as { suspended?: boolean }
    return Boolean(config.suspended)
  }

  /**
   * Suspends a user account, preventing subsequent authenticated actions.
   */
  static async suspendUser(
    adminActor: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; isSuspended: boolean }> {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new Error(`User with ID ${userId} not found.`)
    }

    const now = new Date()
    const config = {
      suspended: true,
      suspendedAt: now.toISOString(),
      reason
    }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId,
          module: this.ACCOUNT_STATUS_MODULE
        }
      },
      create: {
        userId,
        module: this.ACCOUNT_STATUS_MODULE,
        config
      },
      update: {
        config,
        updatedAt: now
      }
    })

    await AuditService.log({
      userId,
      entityType: 'User',
      entityId: userId,
      action: 'ADMIN_USER_SUSPENDED',
      performedBy: adminActor,
      reason,
      newData: config
    })

    logger.info('AdminService', `User ${userId} suspended by ${adminActor}`, { reason })
    return { success: true, isSuspended: true }
  }

  /**
   * Restores an active status to a previously suspended user account.
   */
  static async restoreUser(
    adminActor: string,
    userId: string,
    reason = 'Account access restored by administrator'
  ): Promise<{ success: boolean; isSuspended: boolean }> {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new Error(`User with ID ${userId} not found.`)
    }

    const now = new Date()
    const config = {
      suspended: false,
      restoredAt: now.toISOString(),
      reason
    }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId,
          module: this.ACCOUNT_STATUS_MODULE
        }
      },
      create: {
        userId,
        module: this.ACCOUNT_STATUS_MODULE,
        config
      },
      update: {
        config,
        updatedAt: now
      }
    })

    await AuditService.log({
      userId,
      entityType: 'User',
      entityId: userId,
      action: 'ADMIN_USER_RESTORED',
      performedBy: adminActor,
      reason,
      newData: config
    })

    logger.info('AdminService', `User ${userId} restored by ${adminActor}`, { reason })
    return { success: true, isSuspended: false }
  }

  /**
   * Retrieves paginated user list with summary billing and suspension state.
   */
  static async listUsers(options?: {
    limit?: number
    offset?: number
    search?: string
  }): Promise<{
    users: Array<{
      id: string
      username: string
      email: string | null
      createdAt: Date
      isSuspended: boolean
      plan: string
      isPro: boolean
    }>
    total: number
  }> {
    const limit = Math.min(options?.limit ?? 50, 100)
    const offset = options?.offset ?? 0
    const search = options?.search?.trim()

    const whereClause = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } }
          ]
        }
      : {}

    const [users, total] = await Promise.all([
      db.user.findMany({
        where: whereClause,
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      db.user.count({ where: whereClause })
    ])

    const userSummaries = await Promise.all(
      users.map(async (u) => {
        const [isSuspended, entitlements] = await Promise.all([
          this.isUserSuspended(u.id),
          EntitlementService.getEntitlements(u.id)
        ])
        return {
          ...u,
          isSuspended,
          plan: entitlements.plan,
          isPro: entitlements.isPro
        }
      })
    )

    return { users: userSummaries, total }
  }

  /**
   * Inspects complete user administrative state including subscription, entitlements, and usage.
   */
  static async getUser(userId: string): Promise<AdminUserDetails> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      throw new Error(`User with ID ${userId} not found.`)
    }

    const [
      isSuspendedSetting,
      subscription,
      entitlements,
      billingHistory,
      auditHistory,
      activeActivities,
      notesCount,
      journalEntriesCount
    ] = await Promise.all([
      db.userSetting.findUnique({
        where: {
          userId_module: {
            userId,
            module: this.ACCOUNT_STATUS_MODULE
          }
        }
      }),
      BillingService.getSubscription(userId),
      EntitlementService.getEntitlements(userId),
      BillingService.getBillingHistory(userId, 20),
      AuditService.getLogsForUser(userId, 20),
      db.activityTemplate.count({ where: { userId, deletedAt: null } }),
      db.note.count({ where: { userId, deletedAt: null } }),
      db.journalEntry.count({ where: { userId, deletedAt: null } })
    ])

    const statusConfig = (isSuspendedSetting?.config as { suspended?: boolean; suspendedAt?: string; reason?: string }) || {}

    return {
      user,
      accountStatus: {
        isSuspended: Boolean(statusConfig.suspended),
        suspendedAt: statusConfig.suspendedAt ?? null,
        reason: statusConfig.reason ?? null
      },
      subscription,
      entitlements,
      usageStats: {
        activeActivities,
        notesCount,
        journalEntriesCount
      },
      billingHistory,
      auditHistory
    }
  }

  /**
   * Schedules subscription cancellation at current period end on behalf of an administrator.
   */
  static async cancelSubscription(
    adminActor: string,
    userId: string,
    reason = 'Admin scheduled cancellation at period end'
  ) {
    const result = await BillingService.cancelSubscription(
      userId,
      undefined,
      adminActor,
      reason
    )
    return result
  }

  /**
   * Immediately terminates subscription and revokes Pro access on behalf of an administrator.
   */
  static async cancelSubscriptionImmediately(
    adminActor: string,
    userId: string,
    reason = 'Admin immediate subscription termination & access revocation'
  ) {
    const result = await BillingService.cancelSubscriptionImmediately(
      userId,
      undefined,
      adminActor,
      reason
    )
    return result
  }

  /**
   * Retrieves administrative audit logs across all users or filtered by user.
   */
  static async getAuditHistory(userId?: string, limit = 50) {
    if (userId) {
      return await AuditService.getLogsForUser(userId, limit)
    }
    return await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }
}
