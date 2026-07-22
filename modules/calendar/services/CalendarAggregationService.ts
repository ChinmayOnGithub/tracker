import { db } from '@/lib/db'
import { CalendarService } from './CalendarService'
import { CalendarMonthSummaryDTO } from '../dto/CalendarMonthSummaryDTO'
import { CalendarWeekDTO, CalendarWeekDayDTO, CalendarWeekEventDTO } from '../dto/CalendarWeekDTO'
import { CalendarDayDTO, CalendarDayEventDTO } from '../dto/CalendarDayDTO'

export class CalendarAggregationService {
  /**
   * Generates month DTO summary list for a given year and month (1-indexed).
   */
  static async getMonthSummary(
    userId: string,
    year: number,
    month: number
  ): Promise<CalendarMonthSummaryDTO[]> {
    // Determine start and end of the month
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

    // 1. Fetch CalendarEvents
    const occurrences = await CalendarService.getEvents(userId, startOfMonth, endOfMonth)

    // 2. Fetch Tasks (activity templates of type TASK)
    const taskTemplates = await db.activityTemplate.findMany({
      where: {
        userId,
        type: 'TASK',
        isActive: true,
        deletedAt: null,
      },
    })
    const taskTemplateIds = taskTemplates.map(t => t.id)

    // 3. Fetch Work Tracker template ID
    const workTemplate = await db.activityTemplate.findFirst({
      where: { userId, name: 'Work Tracker', deletedAt: null },
    })
    const workTemplateId = workTemplate?.id

    // 4. Fetch all ActivityLogs in the date range
    const logs = await db.activityLog.findMany({
      where: {
        userId,
        deletedAt: null,
        logDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    })

    // 5. Fetch journal entries, weight records, leave records in the month
    const [journalEntries, weightRecords, leaveRecords] = await Promise.all([
      db.journalEntry.findMany({
        where: { userId, deletedAt: null, journalDate: { gte: startOfMonth, lte: endOfMonth } },
      }),
      db.weightRecord.findMany({
        where: { userId, deletedAt: null, date: { gte: startOfMonth, lte: endOfMonth } },
      }),
      db.leaveRecord.findMany({
        where: {
          userId,
          status: 'APPROVED',
          deletedAt: null,
          startDate: { lte: endOfMonth },
          endDate: { gte: startOfMonth },
        },
      }),
    ])

    // Helper map to quickly find things by date string "YYYY-MM-DD"
    const daysCount = new Date(year, month, 0).getDate()
    const summaries: CalendarMonthSummaryDTO[] = []

    for (let day = 1; day <= daysCount; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      // Filter events occurring on this day
      const dayOccurrences = occurrences.filter(occ => {
        const occStartStr = occ.start.toISOString().split('T')[0]
        const occEndStr = occ.end.toISOString().split('T')[0]
        return dateStr >= occStartStr && dateStr <= occEndStr
      })

      // Filter logs for this day
      const dayLogs = logs.filter(l => l.logDate.toISOString().split('T')[0] === dateStr)

      // Calculate task count (logs of TASK templates completed/logged on this day)
      const dayTaskLogs = dayLogs.filter(l => taskTemplateIds.includes(l.activityId))
      const taskCount = dayTaskLogs.length

      // Filter worked hours
      const workLog = workTemplateId ? dayLogs.find(l => l.activityId === workTemplateId) : null
      const workedHours = workLog ? (workLog.amount ?? 0) : 0

      // Check journal, weight, leave
      const hasJournal = journalEntries.some(j => j.journalDate.toISOString().split('T')[0] === dateStr)
      const hasWeight = weightRecords.some(w => w.date.toISOString().split('T')[0] === dateStr)
      const hasLeave = leaveRecords.some(l => {
        const lStartStr = l.startDate.toISOString().split('T')[0]
        const lEndStr = l.endDate.toISOString().split('T')[0]
        return dateStr >= lStartStr && dateStr <= lEndStr
      })

      // Determine highest priority task on this day
      let highestPriorityTask = null
      if (dayTaskLogs.length > 0) {
        // Find the log linked to highest priority template
        const sortedTasks = dayTaskLogs
          .map(l => taskTemplates.find(t => t.id === l.activityId))
          .filter((t): t is Exclude<typeof t, undefined> => !!t)
          .sort((a, b) => {
            const priorities: Record<string, number> = { LOW: 1, MEDIUM: 2, NORMAL: 3, HIGH: 4, CRITICAL: 5 }
            return (priorities[b.priority] || 0) - (priorities[a.priority] || 0)
          })
        if (sortedTasks.length > 0) {
          highestPriorityTask = {
            id: sortedTasks[0].id,
            title: sortedTasks[0].name,
            priority: sortedTasks[0].priority as 'LOW' | 'MEDIUM' | 'NORMAL' | 'HIGH' | 'CRITICAL',
            color: sortedTasks[0].color,
          }
        }
      }

      // Compute statusColor mapping
      let statusColor = 'bg-slate-100 dark:bg-zinc-800'
      if (hasLeave) {
        statusColor = 'bg-amber-100 dark:bg-amber-950/40 border border-amber-300'
      } else if (workedHours >= 8) {
        statusColor = 'bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300'
      }

      summaries.push({
        date: dateStr,
        taskCount,
        eventCount: dayOccurrences.length,
        workedHours,
        highestPriorityTask,
        hasJournal,
        hasWeight,
        hasLeave,
        statusColor,
      })
    }

    return summaries
  }

  /**
   * Generates week DTO for 7 days starting from startOfWeekStr ("YYYY-MM-DD").
   */
  static async getWeekView(
    userId: string,
    startOfWeekStr: string
  ): Promise<CalendarWeekDTO> {
    const startOfWeek = new Date(`${startOfWeekStr}T00:00:00.000Z`)
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 3600 * 1000 - 1)

    // 1. Get occurrences in the range
    const occurrences = await CalendarService.getEvents(userId, startOfWeek, endOfWeek)

    // 2. Fetch Work Tracker template ID and logs
    const workTemplate = await db.activityTemplate.findFirst({
      where: { userId, name: 'Work Tracker', deletedAt: null },
    })
    const workTemplateId = workTemplate?.id

    const logs = await db.activityLog.findMany({
      where: {
        userId,
        deletedAt: null,
        logDate: { gte: startOfWeek, lte: endOfWeek },
      },
    })

    // 3. Fetch leaves
    const leaves = await db.leaveRecord.findMany({
      where: {
        userId,
        status: 'APPROVED',
        deletedAt: null,
        startDate: { lte: endOfWeek },
        endDate: { gte: startOfWeek },
      },
    })

    const days: CalendarWeekDayDTO[] = []

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek.getTime() + i * 24 * 3600 * 1000)
      const dateStr = d.toISOString().split('T')[0]

      // Filter events occurring on this day
      const dayOccurrences = occurrences.filter(occ => {
        const occStartStr = occ.start.toISOString().split('T')[0]
        const occEndStr = occ.end.toISOString().split('T')[0]
        return dateStr >= occStartStr && dateStr <= occEndStr
      })

      const dayEvents: CalendarWeekEventDTO[] = dayOccurrences.map(occ => ({
        id: occ.id,
        title: occ.title,
        start: occ.start.toISOString(),
        end: occ.end.toISOString(),
        allDay: occ.allDay,
        color: occ.color,
        type: occ.type,
        trackerArtifactId: occ.trackerArtifactId,
        trackerArtifactType: occ.trackerArtifactType,
      }))

      // Get worked hours from logs
      const dayLogs = logs.filter(l => l.logDate.toISOString().split('T')[0] === dateStr)
      const workLog = workTemplateId ? dayLogs.find(l => l.activityId === workTemplateId) : null
      const workedHours = workLog ? (workLog.amount ?? 0) : 0

      // Check if leave exists on this day
      const isLeave = leaves.some(l => {
        const lStartStr = l.startDate.toISOString().split('T')[0]
        const lEndStr = l.endDate.toISOString().split('T')[0]
        return dateStr >= lStartStr && dateStr <= lEndStr
      })

      days.push({
        date: dateStr,
        events: dayEvents,
        workedHours,
        isLeave,
      })
    }

    return { days }
  }

  /**
   * Generates detailed Day DTO for dateStr ("YYYY-MM-DD").
   */
  static async getDayView(
    userId: string,
    dateStr: string
  ): Promise<CalendarDayDTO> {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`)
    const midDay = new Date(`${dateStr}T12:00:00.000Z`)

    // 1. Fetch CalendarEvents
    const occurrences = await CalendarService.getEvents(userId, dayStart, dayEnd)
    const dayEvents: CalendarDayEventDTO[] = occurrences.map(occ => ({
      id: occ.id,
      title: occ.title,
      start: occ.start.toISOString(),
      end: occ.end.toISOString(),
      allDay: occ.allDay,
      color: occ.color,
      type: occ.type,
      trackerArtifactId: occ.trackerArtifactId,
      trackerArtifactType: occ.trackerArtifactType,
      status: 'confirmed',
      description: occ.description,
    }))

    // 2. Fetch Tasks (all active TASK templates)
    const tasksRaw = await db.activityTemplate.findMany({
      where: { userId, type: 'TASK', isActive: true, deletedAt: null },
    })

    // Fetch logs of the day to see status
    const dayLogs = await db.activityLog.findMany({
      where: { userId, logDate: midDay, deletedAt: null },
    })

    const tasks = tasksRaw.map(t => {
      const log = dayLogs.find(l => l.activityId === t.id)
      return {
        id: t.id,
        title: t.name,
        status: log ? log.status : 'cleared',
        priority: t.priority,
        color: t.color,
      }
    })

    // 3. Work hours
    const workTemplate = await db.activityTemplate.findFirst({
      where: { userId, name: 'Work Tracker', deletedAt: null },
    })
    const workLog = workTemplate ? dayLogs.find(l => l.activityId === workTemplate.id) : null
    
    let workStatus: 'office' | 'wfh' | 'cleared' = 'cleared'
    let workDetails = null

    if (workLog) {
      workStatus = workLog.status === 'wfh' ? 'wfh' : 'office'
      const payload = workLog.payload as Record<string, unknown> | null
      workDetails = {
        inTime: (payload?.inTime as string) || undefined,
        outTime: (payload?.outTime as string) || undefined,
        hours: workLog.amount || undefined,
      }
    }

    // 4. Journal Entry
    const journalEntryRaw = await db.journalEntry.findFirst({
      where: { userId, journalDate: { gte: dayStart, lte: dayEnd }, deletedAt: null },
    })
    const journalEntry = journalEntryRaw
      ? {
          id: journalEntryRaw.id,
          title: journalEntryRaw.mood || 'Journal Entry',
          content: journalEntryRaw.content,
        }
      : null

    // 5. Weight Record
    const weightRecord = await db.weightRecord.findFirst({
      where: { userId, date: { gte: dayStart, lte: dayEnd }, deletedAt: null },
    })
    const weight = weightRecord ? weightRecord.weight : null

    // 6. Leave Record
    const leaveRecord = await db.leaveRecord.findFirst({
      where: {
        userId,
        status: 'APPROVED',
        deletedAt: null,
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
    })
    const isLeave = !!leaveRecord
    const leaveDetails = leaveRecord
      ? {
          type: leaveRecord.leaveType,
          status: leaveRecord.status,
        }
      : null

    // 7. Habits (all other active daily activity templates)
    const habitTemplates = await db.activityTemplate.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        recurrenceType: 'daily',
        NOT: {
          OR: [
            { type: 'TASK' },
            { name: 'Work Tracker' },
          ],
        },
      },
    })

    const habits = habitTemplates.map(h => {
      const log = dayLogs.find(l => l.activityId === h.id)
      return {
        id: h.id,
        name: h.name,
        completed: log ? log.status === 'done' || log.status === 'paid' : false,
        streak: 0, // Simplified for DTO representation
      }
    })

    return {
      date: dateStr,
      events: dayEvents,
      tasks,
      workedHours: workLog ? (workLog.amount ?? 0) : 0,
      workStatus,
      workDetails,
      journalEntry,
      weight,
      habits,
      isLeave,
      leaveDetails,
    }
  }
}
