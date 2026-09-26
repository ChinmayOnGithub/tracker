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

function choosePrimaryDuration(state: OnboardingState): number {
  const preferred = state.planningStyle === 'flexible' ? 60 : state.planningStyle === 'structured' ? 75 : 90
  return Math.min(preferred, Math.max(30, Math.floor((state.dailyCapacity * 60) / 2)))
}

function chooseSecondaryDuration(state: OnboardingState): number {
  return state.planningStyle === 'structured' ? 30 : 25
}

function activityBlueprints(state: OnboardingState) {
  const focusLabels: Record<string, string> = {
    work: 'Work',
    learning: 'Learning',
    personal: 'Personal',
    health: 'Health & fitness',
    'life-admin': 'Life admin',
    creative: 'Creative work',
  }

  const focusActions: Record<string, string> = {
    work: 'Review today’s work priorities',
    learning: 'Choose one learning outcome for today',
    personal: 'Choose one personal priority for today',
    health: 'Set one realistic health action for today',
    'life-admin': 'Clear one small life-admin task',
    creative: 'Create one small first step for your creative work',
  }

  const sourceLabels: Record<string, string> = {
    'google-tasks': 'Google Tasks',
    todoist: 'Todoist',
    notion: 'Notion',
    linear: 'Linear',
    github: 'GitHub',
    jira: 'Jira',
    trello: 'Trello',
    clickup: 'ClickUp',
    outlook: 'Outlook',
  }

  const blueprints: Array<{
    name: string
    category: string
    duration: number
    priority: 'HIGH' | 'MEDIUM'
    icon: string
    notes: string
  }> = [
    {
      name: state.firstDayObjective.trim(),
      category: state.focusAreas[0] || 'work',
      duration: choosePrimaryDuration(state),
      priority: 'HIGH',
      icon: 'Target',
      notes: 'Your main onboarding mission, created from your stated objective.',
    },
  ]

  const maxActivities = state.dailyCapacity <= 3 ? 2 : state.dailyCapacity <= 6 ? 3 : 4

  for (const focus of state.focusAreas.slice(1, 3)) {
    if (blueprints.length >= maxActivities) break
    blueprints.push({
      name: focusActions[focus] || `Make progress on ${focusLabels[focus] || focus}`,
      category: focus,
      duration: chooseSecondaryDuration(state),
      priority: 'MEDIUM',
      icon: 'Sparkles',
      notes: `Added because you selected ${focusLabels[focus] || focus} as a focus area.`,
    })
  }

  if (blueprints.length < maxActivities && state.taskSources.length > 0) {
    const source = sourceLabels[state.taskSources[0]] || state.taskSources[0]
    blueprints.push({
      name: `Review your ${source} queue`,
      category: state.focusAreas[0] || 'work',
      duration: chooseSecondaryDuration(state),
      priority: 'MEDIUM',
      icon: 'ListTodo',
      notes: `Added because ${source} is one of your selected work sources.`,
    })
  }

  return blueprints
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

  /**
   * Development rollout: start a fresh onboarding run without touching
   * activities, journal entries, calendar events, documents, or other user data.
   * The previous onboarding state is intentionally not used to mutate anything
   * outside the ONBOARDING setting.
   */
  static async resetForDevelopmentLogin(userId: string): Promise<OnboardingState> {
    const state: OnboardingState = {
      ...DEFAULT_ONBOARDING_STATE,
      createdAt: new Date().toISOString(),
    }

    await db.userSetting.upsert({
      where: { userId_module: { userId, module: MODULE } },
      update: { config: state as unknown as Prisma.InputJsonValue },
      create: {
        userId,
        module: MODULE,
        config: state as unknown as Prisma.InputJsonValue,
      },
    })

    return state
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
        config: state as unknown as Prisma.InputJsonValue,
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
    activityIds: string[]
    activities: Array<{ id: string; name: string; scheduledTime: string | null; estimatedDuration: number; category: string }>
  }> {
    if (!state.firstDayObjective.trim()) {
      throw new Error('A first-day objective is required before generating the plan.')
    }

    if (state.firstPlanActivityId) {
      const existing = await db.activityTemplate.findFirst({
        where: { id: state.firstPlanActivityId, userId, deletedAt: null },
        select: { id: true, name: true, scheduledTime: true, estimatedDuration: true, category: true },
      })

      if (existing) {
        return {
          state,
          created: false,
          activityIds: [existing.id],
          activities: [existing],
        }
      }
    }

    const timezone = safeTimezone(state.timezone || 'UTC')
    const workStart = timeToMinutes(state.workStartTime)
    const workEnd = timeToMinutes(state.workEndTime)

    if (workEnd <= workStart) {
      throw new Error('Workday finish time must be after the start time.')
    }

    const now = new Date()
    const localToday = localParts(now, timezone).date
    const dayStart = new Date(`${localToday}T00:00:00.000Z`)
    const queryStart = new Date(dayStart.getTime() - 2 * 24 * 60 * 60 * 1000)
    const queryEnd = new Date(dayStart.getTime() + 3 * 24 * 60 * 60 * 1000)

    const calendarEvents = state.calendarProvider === 'google'
      ? await db.calendarEvent.findMany({
          where: {
            userId,
            deletedAt: null,
            start: { lt: queryEnd },
            end: { gt: queryStart },
          },
          select: { start: true, end: true, externalProvider: true },
          orderBy: { start: 'asc' },
        })
      : []

    const busy = calendarEvents
      .filter((event) => event.externalProvider === 'GOOGLE')
      .map((event) => ({
        start: localParts(event.start, timezone),
        end: localParts(event.end, timezone),
      }))
      .filter((event) => event.start.date === localToday || event.end.date === localToday)
      .map((event) => ({ start: event.start.minutes, end: event.end.minutes }))
      .filter((event) => event.end > event.start)

    const blueprints = activityBlueprints(state)
    const occupied: Array<{ start: number; end: number }> = [...busy]

    const scheduled = blueprints.map((blueprint) => {
      let scheduledTime: string | null = null
      for (let candidate = workStart; candidate + blueprint.duration <= workEnd; candidate += 15) {
        const candidateEnd = candidate + blueprint.duration
        const overlaps = occupied.some((event) => candidate < event.end && candidateEnd > event.start)
        if (!overlaps) {
          scheduledTime = minutesToTime(candidate)
          occupied.push({ start: candidate, end: candidateEnd })
          break
        }
      }
      return { ...blueprint, scheduledTime }
    })

    const targetDate = new Date(`${localToday}T12:00:00.000Z`)
    const sessionId = state.createdAt || new Date().toISOString()

    const createdActivities = await db.$transaction(async (tx) => {
      const results = []
      for (let index = 0; index < scheduled.length; index += 1) {
        const blueprint = scheduled[index]
        const activity = await tx.activityTemplate.create({
          data: {
            userId,
            name: blueprint.name,
            category: blueprint.category,
            type: 'TASK',
            priority: blueprint.priority,
            estimatedDuration: blueprint.duration,
            scheduledTime: blueprint.scheduledTime,
            energyRequired: state.planningStyle === 'flexible' ? 'MEDIUM' : index === 0 ? 'HIGH' : 'MEDIUM',
            calendarProvider: state.calendarProvider === 'google' ? 'GOOGLE' : 'NONE',
            recurrenceType: 'one_time',
            targetDate,
            icon: blueprint.icon,
            color: 'rose',
            sortOrder: index,
            notes: blueprint.notes,
            metadata: {
              source: 'onboarding',
              onboardingSession: sessionId,
              timezone,
              calendarAware: state.calendarProvider === 'google',
              planningStyle: state.planningStyle,
              selectedFocusAreas: state.focusAreas,
              selectedTaskSources: state.taskSources,
            } as Prisma.InputJsonValue,
          },
          select: { id: true, name: true, scheduledTime: true, estimatedDuration: true, category: true },
        })
        results.push(activity)
      }
      return results
    })

    const nextState: OnboardingState = {
      ...state,
      firstPlanActivityId: createdActivities[0]?.id || null,
    }

    await this.saveState(userId, nextState)

    return {
      state: nextState,
      created: createdActivities.length > 0,
      activityIds: createdActivities.map((activity) => activity.id),
      activities: createdActivities,
    }
  }
}
