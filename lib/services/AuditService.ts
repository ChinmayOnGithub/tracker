import { db } from '../db'

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
    oldData?: any
    newData?: any
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
        oldData: oldData ?? null,
        newData: newData ?? null,
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
