export interface CalendarDayEventDTO {
  id: string
  title: string
  start: string // ISO string
  end: string // ISO string
  allDay: boolean
  color: string | null
  type: string
  trackerArtifactId: string | null
  trackerArtifactType: string | null
  status: string
  description: string | null
}

export interface CalendarDayDTO {
  date: string // "YYYY-MM-DD"
  events: CalendarDayEventDTO[]
  tasks: {
    id: string
    title: string
    status: string
    priority: string
    color: string
  }[]
  workedHours: number
  workStatus: 'office' | 'wfh' | 'cleared'
  workDetails: {
    inTime?: string
    outTime?: string
    hours?: number
  } | null
  journalEntry: {
    id: string
    title: string | null
    content: string
  } | null
  weight: number | null
  habits: {
    id: string
    name: string
    completed: boolean
    streak: number
  }[]
  isLeave: boolean
  leaveDetails: {
    type: string
    status: string
  } | null
}
