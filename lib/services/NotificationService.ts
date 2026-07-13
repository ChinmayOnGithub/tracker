import { db } from '../db'

interface NotificationRule {
  offsetMinutes?: number
}

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
      let rules: NotificationRule[] = []
      try {
        rules = typeof template.notificationRules === 'string'
          ? JSON.parse(template.notificationRules)
          : (template.notificationRules as unknown as NotificationRule[])
      } catch {
        continue
      }

      if (Array.isArray(rules)) {
        const meta = (template.metadata || {}) as Record<string, unknown>
        const startTime = (meta.startTime ?? '09:00') as string
        const [hour, minute] = startTime.split(':').map(Number)

        for (const rule of rules) {
          const offset = rule.offsetMinutes ?? -15
          // Calculate the target time for the notification
          const triggerTime = new Date(now)
          triggerTime.setHours(hour, minute, 0, 0)
          triggerTime.setMinutes(triggerTime.getMinutes() + offset)

          const timeLabel = triggerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

          notifications.push({
            id: `${template.id}_${offset}`,
            templateId: template.id,
            name: template.name,
            type: template.type,
            priority: template.priority,
            time: timeLabel,
            triggeredAt: triggerTime
          })
        }
      }
    }

    return notifications
  }
}
export const notificationService = new NotificationService()
