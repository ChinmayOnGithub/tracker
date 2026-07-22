import { ActivityTemplate, ActivityLog, TimelineItem, AnalyzedTemplate } from '@/types'
import { ParsedCalendarEvent } from '../services/GoogleCalendarService'

export type ActivityType = 
  | 'WORKOUT'
  | 'MEETING'
  | 'REMINDER'
  | 'TASK'
  | 'BILL'
  | 'MEDICINE'
  | 'LEAVE'
  | 'JOURNAL'
  | 'LEARNING'
  | 'PERSONAL'
  | 'CUSTOM'

export type Priority = 
  | 'LOW'
  | 'MEDIUM'
  | 'NORMAL'
  | 'HIGH'
  | 'CRITICAL'

export type CalendarProvider = 
  | 'NONE'
  | 'GOOGLE'
  | 'APPLE'
  | 'OUTLOOK'

export enum Capability {
  COMPLETABLE = 'COMPLETABLE',
  SCHEDULABLE = 'SCHEDULABLE',
  NOTIFIABLE = 'NOTIFIABLE',
  CALENDAR_SYNC = 'CALENDAR_SYNC',
  LOCATION_AWARE = 'LOCATION_AWARE',
  QUANTIFIABLE = 'QUANTIFIABLE'
}

export type ActivityOccurrence = TimelineItem



/**
 * Evaluates the capabilities of an activity template.
 */
export function getTemplateCapabilities(template: ActivityTemplate): Capability[] {
  const caps: Capability[] = []
  
  // Meetings are not completable; all other items require explicit complete
  if (template.type !== 'MEETING') {
    caps.push(Capability.COMPLETABLE)
  }
  
  // Timed/Schedulable behavior
  if (template.estimatedDuration && template.estimatedDuration > 0) {
    caps.push(Capability.SCHEDULABLE)
  }
  
  // Notification capability
  if (template.notificationRules) {
    try {
      const rules = typeof template.notificationRules === 'string' 
        ? JSON.parse(template.notificationRules) 
        : template.notificationRules
      if (Array.isArray(rules) && rules.length > 0) {
        caps.push(Capability.NOTIFIABLE)
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  // Calendar provider synchronization
  if (template.calendarProvider && template.calendarProvider !== 'NONE') {
    caps.push(Capability.CALENDAR_SYNC)
  }
  
  // Location behavior
  if (template.type === 'MEETING') {
    caps.push(Capability.LOCATION_AWARE)
  }
  
  // Quantifiable behavior
  if (template.type === 'BILL') {
    caps.push(Capability.QUANTIFIABLE)
  }
  
  return caps
}

/**
 * Finds the currently running timed event, or the next upcoming timed event.
 */
export function getActiveOrNextEvent(
  timedEvents: ParsedCalendarEvent[],
  currentTime: Date
): { event: ParsedCalendarEvent; isActive: boolean } | null {
  const sorted = [...timedEvents].sort((a, b) => a.start.localeCompare(b.start))
  
  const running = sorted.find(e => {
    const start = new Date(e.start)
    const end = new Date(e.end)
    return currentTime >= start && currentTime <= end
  })
  
  if (running) {
    return { event: running, isActive: true }
  }
  
  const upcoming = sorted.find(e => {
    const start = new Date(e.start)
    return start > currentTime
  })
  
  if (upcoming) {
    return { event: upcoming, isActive: false }
  }
  
  return null
}

/**
 * Computes a human-readable countdown string until start or end time.
 */
export function getCountdownString(
  event: ParsedCalendarEvent,
  isActive: boolean,
  currentTime: Date
): string {
  const target = isActive ? new Date(event.end) : new Date(event.start)
  const diffMs = target.getTime() - currentTime.getTime()
  if (diffMs <= 0) return isActive ? "Ending now" : "Starting now"
  
  const diffMin = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  
  const timeWord = isActive ? "Ends" : "Starts"
  if (hours > 0) {
    return `${timeWord} in ${hours}h ${mins}m`
  }
  return `${timeWord} in ${mins}m`
}

/**
 * Formats start and end times for rendering.
 */
export function getEventTimeLabel(event: ParsedCalendarEvent): string {
  if (event.isAllDay) return "All Day"
  const start = new Date(event.start)
  const end = new Date(event.end)
  const formatOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return `${start.toLocaleTimeString([], formatOpts)} - ${end.toLocaleTimeString([], formatOpts)}`
}

/**
 * Filters the list of analyzed templates to get only those due today.
 */
export function getDueHabits(
  analyzedTemplates: AnalyzedTemplate[],
  todayStr: string
): AnalyzedTemplate[] {
  return analyzedTemplates.filter(({ template, analysis }) => {
    if (!template.isActive) return false
    if (template.recurrenceType === 'milestone' || template.recurrenceType === 'yearly') return false
    return analysis.nextDueDate && analysis.nextDueDate <= todayStr
  })
}

/**
 * Helper to map Priority enum value to weight.
 */
export function getPriorityWeight(priority: string): number {
  switch (priority) {
    case 'CRITICAL': return 4
    case 'HIGH': return 3
    case 'MEDIUM':
    case 'NORMAL': return 2
    case 'LOW': return 1
    default: return 0
  }
}

/**
 * Generates a unified Today's Timeline of occurrences.
 */
export function generateTimeline(
  analyzedTemplates: AnalyzedTemplate[],
  logs: ActivityLog[],
  todayStr: string,
  calendarEvents: ParsedCalendarEvent[]
): ActivityOccurrence[] {
  const occurrences: ActivityOccurrence[] = []
  
  // 1. Process Google Calendar events as MEETING occurrences
  for (const event of calendarEvents) {
    const isAllDay = event.isAllDay
    const start = new Date(event.start)
    const end = new Date(event.end)
    
    // Check if event is finished
    const now = new Date()
    const isFinished = end < now
    
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

  // 2. Process local due activities (Habits, Workouts, Bills, etc.)
  const dueTemplates = analyzedTemplates.filter(({ template, analysis }) => {
    if (!template.isActive) return false
    if (template.recurrenceType === 'milestone' || template.recurrenceType === 'yearly') return false
    const hasLogToday = logs.some(l => l.activityId === template.id && l.date === todayStr)

    // Always show items that have a log for today (preserves postponed/done history)
    if (hasLogToday) return true

    // For one_time tasks: only show on exact due date (not overdue on future days)
    if (analysis.nextDueDate) {
      if (template.recurrenceType === 'one_time') {
        return analysis.nextDueDate === todayStr
      }
      return analysis.nextDueDate <= todayStr
    }
    return false
  })
  
  for (const { template } of dueTemplates) {
    const log = logs.find(l => 
      l.activityId === template.id && 
      l.date === todayStr
    )
    
    // Parse metadata configuration to schedule timed local activities
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
      type: (template.type || 'PERSONAL') as ActivityType,
      priority: (template.priority || 'NORMAL') as Priority,
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

  // 3. Sort occurrences: Timed (non-all-day) items first chronologically,
  // then untimed (all-day/Anytime) items sorted by Priority weight.
  return occurrences.sort((a, b) => {
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? 1 : -1
    
    if (!a.isAllDay) {
      return a.start.getTime() - b.start.getTime()
    }
    
    // Sort all-day items by Priority weight descending
    return getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
  })
}
