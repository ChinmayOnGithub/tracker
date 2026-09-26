import { db } from '@/lib/db'

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

export class OnboardingService {
  static async getState(userId: string): Promise<OnboardingState | null> {
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId, module: MODULE } },
    })

    if (!setting || !isOnboardingState(setting.config)) return null

    return {
      ...DEFAULT_ONBOARDING_STATE,
      ...setting.config,
    }
  }

  static async initialize(userId: string): Promise<OnboardingState> {
    const existing = await this.getState(userId)
    if (existing) return existing

    const state: OnboardingState = {
      ...DEFAULT_ONBOARDING_STATE,
      createdAt: new Date().toISOString(),
    }

    await db.userSetting.create({
      data: {
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
      createdAt: state.createdAt || new Date().toISOString(),
    }

    await db.userSetting.upsert({
      where: { userId_module: { userId, module: MODULE } },
      update: { config: normalized },
      create: { userId, module: MODULE, config: normalized },
    })

    return normalized
  }
}
