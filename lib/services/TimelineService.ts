import { db } from '../db'
import { analyzeRecurrence } from '../recurrence'
import { ActivityTemplate, ActivityLog, TimelineItem, RecurrenceType, Priority } from '@/types'
import { ParsedCalendarEvent } from '../providers'

export async function fetchRecurrenceLogs(
  userId: string,
  templates: { id: string; recurrenceType: string }[],
  adminCheck: boolean = false
): Promise<ActivityLog[]> {
  const whereClause = adminCheck
    ? { OR: [{ userId }, { userId: null }], deletedAt: null }
    : { userId, deletedAt: null }

  // 1. Get the latest log of each template
  const latestLogs = await db.activityLog.findMany({
    where: whereClause,
    orderBy: { logDate: 'desc' },
    distinct: ['activityId']
  })

  // 2. Get the latest completion log of each template
  const latestCompletions = await db.activityLog.findMany({
    where: {
      ...whereClause,
      status: { notIn: ['skipped', 'postponed', 'reminder'] }
    },
    orderBy: { logDate: 'desc' },
    distinct: ['activityId']
  })

  // 3. Get recent logs (last 30 days) for daily templates to compute streaks
  const dailyTemplates = templates.filter(t => t.recurrenceType === 'daily')
  const dailyTemplateIds = dailyTemplates.map(t => t.id)
  
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentDailyLogs = dailyTemplateIds.length > 0 ? await db.activityLog.findMany({
    where: {
      ...whereClause,
      activityId: { in: dailyTemplateIds },
      logDate: { gte: thirtyDaysAgo },
      status: { notIn: ['skipped', 'postponed', 'reminder'] }
    },
    orderBy: { logDate: 'desc' }
  }) : []

  // 4. Get all logs of the last 7 days to cover general recent completions list
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const lastSevenDaysLogs = await db.activityLog.findMany({
    where: {
      ...whereClause,
      logDate: { gte: sevenDaysAgo }
    },
    orderBy: { logDate: 'desc' }
  })

  // Combine and de-duplicate by ID
  const logsMap = new Map<string, ActivityLog>()
  latestLogs.forEach(l => logsMap.set(l.id, l as unknown as ActivityLog))
  latestCompletions.forEach(l => logsMap.set(l.id, l as unknown as ActivityLog))
  recentDailyLogs.forEach(l => logsMap.set(l.id, l as unknown as ActivityLog))
  lastSevenDaysLogs.forEach(l => logsMap.set(l.id, l as unknown as ActivityLog))

  return Array.from(logsMap.values())
}

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
      recurrenceType: t.recurrenceType as RecurrenceType,
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

    // Pre-fetch all historical logs for the user to resolve the N+1 query loop
    const allLogsList = await fetchRecurrenceLogs(userId, templates)

    const logsByActivityId: Record<string, typeof allLogsList> = {}
    for (const logItem of allLogsList) {
      if (!logsByActivityId[logItem.activityId]) {
        logsByActivityId[logItem.activityId] = []
      }
      logsByActivityId[logItem.activityId].push(logItem)
    }

    // 3. Process local due activities based on recurrence analysis
    for (const template of templates) {
      const templateLogsRaw = logsByActivityId[template.id] || []
      const allTemplateLogs = templateLogsRaw.map(l => ({
        ...l,
        date: l.logDate ? l.logDate.toISOString().split('T')[0] : l.date
      }))

      const analysis = analyzeRecurrence(template as unknown as ActivityTemplate, allTemplateLogs as unknown as ActivityLog[], todayStr)
      const isDue = analysis.nextDueDate && analysis.nextDueDate <= todayStr

      if (!isDue) continue

      const log = logs.find(l => l.activityId === template.id)
      const meta = (template.metadata || {}) as Record<string, unknown>
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
        priority: template.priority as Priority,
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
