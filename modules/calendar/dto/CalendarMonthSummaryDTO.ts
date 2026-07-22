export interface CalendarMonthSummaryDTO {
  date: string // "YYYY-MM-DD"
  taskCount: number
  eventCount: number
  workedHours: number
  highestPriorityTask: {
    id: string
    title: string
    priority: 'LOW' | 'MEDIUM' | 'NORMAL' | 'HIGH' | 'CRITICAL'
    color: string
  } | null
  hasJournal: boolean
  hasWeight: boolean
  hasLeave: boolean
  statusColor: string // css style token or class mapping
}
