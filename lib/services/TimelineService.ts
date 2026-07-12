import { db } from '../db'
import { analyzeRecurrence, getTodayDateStr } from '../recurrence'
import { ActivityTemplate, ActivityLog, TimelineItem } from '@/types'
import { ParsedCalendarEvent } from '../providers'

export class TimelineService {
  /**
   * Generates the unified timeline of occurrences for a specific user and date.
   */
  static async generateTimeline(params: {
    userId: string
    todayStr: string
    calendarEvents: ParsedCalendarEvent[]
  }): Promise<TimelineItem[]> {
    const { userId, todayStr, calendarEvents } = params

    // 1. Fetch templates, logs, and approved leaves for the day
    const [templatesRaw, logsRaw, leaveRecords] = await Promise.all([
      db.activityTemplate.findMany({
        where: { userId, isActive: true, deletedAt: null },
        include: { tags: true },
        orderBy: { sortOrder: 'asc' }
      }),
      db.activityLog.findMany({
        where: { userId, logDate: new Date(`${todayStr}T12:00:00.000Z`), deletedAt: null }
      }),
      db.leaveRecord.findMany({
        where: {
          userId,
          status: 'APPROVED',
          deletedAt: null,
          startDate: { lte: new Date(`${todayStr}T23:59:59.999Z`) },
          endDate: { gte: new Date(`${todayStr}T00:00:00.000Z`) }
        }
      })
    ])

    const templates = templatesRaw.map(t => ({
      ...t,
      recurrenceType: t.recurrenceType as any,
      targetDate: t.targetDate ? t.targetDate.toISOString().split('T')[0] : null,
      metadata: t.metadata
    }))

    const logs = logsRaw.map(l => ({
      ...l,
      date: l.logDate.toISOString().split('T')[0],
      payload: l.payload
    }))

    const occurrences: TimelineItem[] = []

    // 2. Process Google Calendar events as MEETING occurrences
    for (const event of calendarEvents) {
      const isAllDay = event.isAllDay
      const start = new Date(event.start)
      const end = new Date(event.end)
      const now = new Date()
      const isFinished = !isAllDay && end < now

      occurrences.push({
        id: `google_${event.id}`,
        templateName: event.summary,
        type: 'MEETING',
        priority: 'HIGH',
        start,
        end,
        isAllDay,
        location: event.location,
        htmlLink: event.htmlLink,
        completed: isFinished,
        status: isFinished ? 'done' : undefined,
        icon: 'Calendar'
      })
    }

    // 3. Process local due activities based on recurrence analysis
    for (const template of templates) {
      // Analyze recurrence using all historical logs for this template
      const allTemplateLogs = await db.activityLog.findMany({
        where: { userId, activityId: template.id, deletedAt: null }
      }).then(list => list.map(l => ({
        ...l,
        date: l.logDate.toISOString().split('T')[0]
      })))

      const analysis = analyzeRecurrence(template as any, allTemplateLogs as any, todayStr)
      const isDue = analysis.nextDueDate && analysis.nextDueDate <= todayStr

      if (!isDue) continue

      const log = logs.find(l => l.activityId === template.id)
      const meta = (template.metadata || {}) as Record<string, any>
      const isAllDay = (meta.isAllDay ?? (template.type !== 'MEETING')) as boolean
      const startTime = (meta.startTime ?? '09:00') as string
      const location = (meta.location ?? undefined) as string | undefined

      let start = new Date(`${todayStr}T00:00:00Z`)
      let end = new Date(`${todayStr}T23:59:59Z`)

      if (!isAllDay) {
        start = new Date(`${todayStr}T${startTime}:00`)
        const durationMins = template.estimatedDuration || 60
        end = new Date(start.getTime() + durationMins * 60 * 1000)
      }

      occurrences.push({
        id: `local_${template.id}`,
        templateId: template.id,
        templateName: template.name,
        type: template.type,
        priority: template.priority as any,
        start,
        end,
        isAllDay,
        location,
        notes: template.notes,
        completed: !!log,
        logId: log?.id,
        status: log?.status,
        icon: template.icon
      })
    }

    // 4. Inject leaves spanning today
    for (const leave of leaveRecords) {
      occurrences.push({
        id: `leave_${leave.id}`,
        templateName: `Time Off: ${leave.leaveType}`,
        type: 'LEAVE',
        priority: 'HIGH',
        start: leave.startDate,
        end: leave.endDate,
        isAllDay: true,
        completed: true,
        status: 'done',
        icon: 'Calendar',
        notes: leave.notes
      })
    }

    // 5. Sort occurrences: Timed (non-all-day) items first, then all-day sorted by priority
    return occurrences.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? 1 : -1
      if (!a.isAllDay) return a.start.getTime() - b.start.getTime()
      
      const priorityWeight = (p: string) => {
        if (p === 'CRITICAL') return 4
        if (p === 'HIGH') return 3
        if (p === 'MEDIUM' || p === 'NORMAL') return 2
        return 1
      }
      return priorityWeight(b.priority) - priorityWeight(a.priority)
    })
  }
}
