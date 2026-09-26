import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

export interface OnboardingState {
  version: 1
  status: OnboardingStatus
  currentStep: number
  completedSteps: number[]
  taskSources: string[]
  calendarProvider: string | null
  workStartTime: string
  workEndTime: string
  planningStyle: string | null
  dailyCapacity: number
  focusAreas: string[]
  firstDayObjective: string
  timezone: string
  firstPlanActivityId: string | null
  momentum: number
  createdAt: string
  completedAt: string | null
}

const MODULE = 'ONBOARDING'

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  version: 1,
  status: 'NOT_STARTED',
  currentStep: 0,
  completedSteps: [],
  taskSources: [],
  calendarProvider: null,
  workStartTime: '09:00',
  workEndTime: '17:00',
  planningStyle: null,
  dailyCapacity: 6,
  focusAreas: [],
  firstDayObjective: '',
  timezone: 'UTC',
  firstPlanActivityId: null,
  momentum: 0,
  createdAt: '',
  completedAt: null,
}

function isOnboardingState(value: unknown): value is Partial<OnboardingState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.status === 'string' &&
    typeof candidate.currentStep === 'number' &&
    Array.isArray(candidate.completedSteps) &&
    Array.isArray(candidate.taskSources)
  )
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(value: number): string {
  const normalized = ((value % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  }
}

function safeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return timezone
  } catch {
    return 'UTC'
  }
}

function chooseDuration(state: OnboardingState): number {
  const styleDuration = {
    focused: 90,
    structured: 75,
    flexible: 60,
  }[state.planningStyle || 'focused'] || 75

  const capacityCeiling = Math.max(30, Math.floor((state.dailyCapacity * 60) / 2))
  return Math.min(styleDuration, capacityCeiling)
}

export class OnboardingService {
  static async getState(userId: string): Promise<OnboardingState | null> {
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId, module: MODULE } },
    })

    if (!setting || !isOnboardingState(setting.config)) return null

    return {
      ...DEFAULT_ONBOARDING_STATE,
      ...setting.config,
      timezone: safeTimezone(
        typeof setting.config === 'object' &&
        setting.config !== null &&
        !Array.isArray(setting.config) &&
        typeof (setting.config as Record<string, unknown>).timezone === 'string'
          ? (setting.config as Record<string, unknown>).timezone as string
          : DEFAULT_ONBOARDING_STATE.timezone
      ),
    }
  }

  static async initialize(userId: string, client: Prisma.TransactionClient | typeof db = db): Promise<OnboardingState> {
    const existingSetting = await client.userSetting.findUnique({
      where: { userId_module: { userId, module: MODULE } },
    })
    const existing = existingSetting && isOnboardingState(existingSetting.config)
      ? { ...DEFAULT_ONBOARDING_STATE, ...existingSetting.config } as OnboardingState
      : null
    if (existing) return existing

    const state: OnboardingState = {
      ...DEFAULT_ONBOARDING_STATE,
      createdAt: new Date().toISOString(),
    }

    await client.userSetting.upsert({
      where: { userId_module: { userId, module: MODULE } },
      update: {},
      create: {
        userId,
        module: MODULE,
        config: state,
      },
    })

    return state
  }

  static async saveState(userId: string, state: OnboardingState): Promise<OnboardingState> {
    const normalized: OnboardingState = {
      ...DEFAULT_ONBOARDING_STATE,
      ...state,
      version: 1,
      timezone: safeTimezone(state.timezone || 'UTC'),
      createdAt: state.createdAt || new Date().toISOString(),
    }

    await db.userSetting.upsert({
      where: { userId_module: { userId, module: MODULE } },
      update: { config: normalized },
      create: { userId, module: MODULE, config: normalized },
    })

    return normalized
  }

  static async createFirstDayPlan(userId: string, state: OnboardingState): Promise<{
    state: OnboardingState
    created: boolean
    activityId: string | null
    scheduledTime: string | null
    durationMinutes: number
  }> {
    if (!state.firstDayObjective.trim()) {
      throw new Error('A first-day objective is required before generating the plan.')
    }

    if (state.firstPlanActivityId) {
      const existing = await db.activityTemplate.findFirst({
        where: { id: state.firstPlanActivityId, userId, deletedAt: null },
        select: { id: true, scheduledTime: true, estimatedDuration: true },
      })

      if (existing) {
        return {
          state,
          created: false,
          activityId: existing.id,
          scheduledTime: existing.scheduledTime,
          durationMinutes: existing.estimatedDuration,
        }
      }
    }

    const timezone = safeTimezone(state.timezone || 'UTC')
    const durationMinutes = chooseDuration(state)
    const workStart = timeToMinutes(state.workStartTime)
    const workEnd = timeToMinutes(state.workEndTime)

    if (workEnd <= workStart) {
      throw new Error('Workday finish time must be after the start time.')
    }

    const now = new Date()
    const localToday = localParts(now, timezone).date
    const dayStart = new Date(`${localToday}T00:00:00.000Z`)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const calendarEvents = state.calendarProvider === 'google'
      ? await db.calendarEvent.findMany({
          where: {
            userId,
            deletedAt: null,
            start: { lt: dayEnd },
            end: { gt: dayStart },
          },
          select: { start: true, end: true, externalProvider: true },
          orderBy: { start: 'asc' },
        })
      : []

    const busy = calendarEvents
      .filter((event) => event.externalProvider === 'GOOGLE')
      .map((event) => ({
        start: localParts(event.start, timezone).minutes,
        end: localParts(event.end, timezone).minutes,
      }))
      .filter((event) => event.end > event.start)

    let scheduledTime: string | null = null
    for (let candidate = workStart; candidate + durationMinutes <= workEnd; candidate += 30) {
      const candidateEnd = candidate + durationMinutes
      const overlaps = busy.some((event) => candidate < event.end && candidateEnd > event.start)
      if (!overlaps) {
        scheduledTime = minutesToTime(candidate)
        break
      }
    }

    const targetDate = new Date(`${localToday}T12:00:00.000Z`)
    const focusCategory = state.focusAreas[0] || 'work'

    const createdActivity = await db.$transaction(async (tx) => {
      const activity = await tx.activityTemplate.create({
        data: {
          userId,
          name: state.firstDayObjective.trim(),
          category: focusCategory,
          type: 'TASK',
          priority: 'HIGH',
          estimatedDuration: durationMinutes,
          scheduledTime,
          energyRequired: state.planningStyle === 'flexible' ? 'MEDIUM' : 'HIGH',
          calendarProvider: state.calendarProvider === 'google' ? 'GOOGLE' : 'NONE',
          recurrenceType: 'one_time',
          targetDate,
          icon: 'Target',
          color: 'primary',
          sortOrder: 0,
          notes: `Generated during Tracker onboarding. Planning style: ${state.planningStyle || 'focused'}.`,
          metadata: {
            source: 'onboarding',
            timezone,
            calendarAware: state.calendarProvider === 'google',
          } as Prisma.InputJsonValue,
        },
        select: { id: true, scheduledTime: true, estimatedDuration: true },
      })

      return activity
    })

    const nextState: OnboardingState = {
      ...state,
      firstPlanActivityId: createdActivity.id,
    }

    await this.saveState(userId, nextState)

    return {
      state: nextState,
      created: true,
      activityId: createdActivity.id,
      scheduledTime: createdActivity.scheduledTime,
      durationMinutes: createdActivity.estimatedDuration,
    }
  }
}
