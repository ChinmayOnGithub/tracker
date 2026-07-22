export interface CalendarWeekEventDTO {
  id: string
  title: string
  start: string // ISO string
  end: string // ISO string
  allDay: boolean
  color: string | null
  type: string
  trackerArtifactId: string | null
  trackerArtifactType: string | null
}

export interface CalendarWeekDayDTO {
  date: string // "YYYY-MM-DD"
  events: CalendarWeekEventDTO[]
  workedHours: number
  isLeave: boolean
}

export interface CalendarWeekDTO {
  days: CalendarWeekDayDTO[]
}
