"use server"

import { db } from '@/lib/db'
import { requireOwnership } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { revalidatePath } from 'next/cache'

export async function scheduleTaskOccurrenceAction(templateId: string, dateStr: string) {
  try {
    const { user, record: templateRecord } = await requireOwnership('activityTemplate', templateId)
    const template = templateRecord as unknown as {
      id: string
      name: string
      color?: string | null
      scheduledTime?: string | null
      estimatedDuration?: number | null
      type?: string
    }

    const logDate = new Date(`${dateStr}T12:00:00.000Z`)

    // 1. Idempotently check for existing occurrence/log for this template on this date
    let existingLog = await db.activityLog.findFirst({
      where: {
        userId: user.id,
        activityId: templateId,
        logDate,
        deletedAt: null,
      },
    })

    if (!existingLog) {
      existingLog = await ActivityService.logActivity({
        userId: user.id,
        templateId,
        date: dateStr,
        status: 'cleared',
      })
    }

    // 2. Projection to CalendarEvent ONLY IF scheduledTime exists
    let calendarEvent = null
    if (template.scheduledTime) {
      const [hours, minutes] = template.scheduledTime.split(':').map(Number)
      const start = new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`)
      const duration = template.estimatedDuration || 30
      const end = new Date(start.getTime() + duration * 60 * 1000)

      calendarEvent = await CalendarService.scheduleTask(
        user.id,
        template.id,
        template.name,
        start,
        end,
        template.color || undefined
      )
    }

    revalidatePath('/')
    revalidatePath('/calendar')
    return { success: true, log: existingLog, calendarEvent }
  } catch (error) {
    console.error('Failed to schedule task occurrence:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
