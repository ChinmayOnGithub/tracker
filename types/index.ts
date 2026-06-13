export interface Tag {
  id: string
  name: string
  color: string | null
  createdAt: Date
  updatedAt: Date
}

export type RecurrenceType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom'
  | 'milestone'
  | 'one_time'

export interface ActivityTemplate {
  id: string
  name: string
  category: string
  icon: string
  color: string
  isActive: boolean
  notes: string | null
  amount: number | null
  sortOrder: number
  
  recurrenceType: RecurrenceType
  recurrenceInterval: number | null
  recurrenceDaysOfWeek: string | null // comma-separated e.g. "1,3,5"
  recurrenceDayOfMonth: number | null
  recurrenceMonth: number | null
  targetDate: string | null // YYYY-MM-DD
  remindBeforeDays: number | null

  metadata: unknown | null // JSON
  tags: Tag[]
  logs?: ActivityLog[]
  createdAt: Date
  updatedAt: Date
}

export interface ActivityLog {
  id: string
  activityId: string
  date: string // YYYY-MM-DD
  note: string | null
  status: string // done, skipped, paid, renewed, reminder, custom
  amount: number | null
  payload: unknown | null // JSON
  createdAt: Date
  updatedAt: Date
  activity?: ActivityTemplate
}

export interface Note {
  id: string
  date: string // YYYY-MM-DD
  title: string | null
  content: string
  createdAt: Date
  updatedAt: Date
}

export interface WorkoutSet {
  reps: number
  weight?: number
  note?: string
}

export interface WorkoutExercise {
  name: string
  sets: WorkoutSet[]
  note?: string
}

export interface WorkoutPayload {
  exercises: WorkoutExercise[]
  energy?: string
}

export interface RunningPayload {
  distance?: number | null
  duration?: number | null
  energy?: string
}

export interface MeasurementsPayload {
  weight?: number | null
  waist?: number | null
  chest?: number | null
  arms?: number | null
}

export interface RecurrenceAnalysis {
  lastCompletedDate: string | null
  nextDueDate: string | null
  overdue: boolean
  daysSinceLast: number | null
  monthsSinceLast: number | null
  streak: number
  statusMessage: string
}
