import { db } from '../db'

export class NotificationService {
  /**
   * Retrieves pending notifications for a user based on active activity templates.
   */
  static async getPendingNotifications(userId: string) {
    const allTemplates = await db.activityTemplate.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null
      }
    })
    const templates = allTemplates.filter(t => t.notificationRules !== null)

    const notifications = []
    const now = new Date()

    for (const template of templates) {
      const rules = template.notificationRules as any[]
      if (Array.isArray(rules)) {
        for (const rule of rules) {
          notifications.push({
            id: `${template.id}_${rule.time}`,
            templateId: template.id,
            name: template.name,
            type: template.type,
            priority: template.priority,
            time: rule.time,
            triggeredAt: now
          })
        }
      }
    }

    return notifications
  }
}
export const notificationService = new NotificationService()
