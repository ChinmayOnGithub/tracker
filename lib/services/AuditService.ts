import { db } from '../db'
import { Prisma } from '@prisma/client'

export class AuditService {
  /**
   * Log a security or transaction audit record in the database.
   */
  static async log(params: {
    userId: string
    entityType: string
    entityId: string
    action: string
    performedBy: string
    oldData?: unknown
    newData?: unknown
    reason?: string | null
    ipAddress?: string | null
    userAgent?: string | null
  }) {
    const { userId, entityType, entityId, action, performedBy, oldData, newData, reason, ipAddress, userAgent } = params

    return await db.auditLog.create({
      data: {
        userId,
        entityType,
        entityId,
        action,
        performedBy,
        oldData: oldData !== undefined ? (oldData as Prisma.InputJsonValue) : Prisma.DbNull,
        newData: newData !== undefined ? (newData as Prisma.InputJsonValue) : Prisma.DbNull,
        reason: reason ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null
      }
    })
  }

  /**
   * Fetch audit logs for a given entity or user.
   */
  static async getLogsForUser(userId: string, limit = 50) {
    return await db.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }
}
