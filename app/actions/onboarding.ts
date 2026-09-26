"use server"

import { z } from 'zod'
import { getLoggedUser } from '@/app/actions/auth'
import { db } from '@/lib/db'
import { OnboardingService, OnboardingState } from '@/lib/services/OnboardingService'
import { GoogleCredentialService } from '@/modules/sync/google-calendar/services/GoogleCredentialService'

const onboardingStateSchema = z.object({
  version: z.literal(1),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']),
  currentStep: z.number().int().min(0).max(8),
  completedSteps: z.array(z.number().int().min(0).max(8)).max(9),
  taskSources: z.array(z.string().min(1).max(64)).max(12),
  calendarProvider: z.string().max(64).nullable(),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  planningStyle: z.string().max(64).nullable(),
  dailyCapacity: z.number().int().min(1).max(12),
  focusAreas: z.array(z.string().min(1).max(64)).max(6),
  firstDayObjective: z.string().max(1000),
  timezone: z.string().min(1).max(128),
  firstPlanActivityId: z.string().uuid().nullable(),
  momentum: z.number().int().min(0).max(1000),
  createdAt: z.string().min(1),
  completedAt: z.string().nullable(),
})

function validateWorkday(state: OnboardingState): string | null {
  const [startHour, startMinute] = state.workStartTime.split(':').map(Number)
  const [endHour, endMinute] = state.workEndTime.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute

  if (end <= start) return 'Your finish time must be later than your start time.'
  if (end - start < 60) return 'Give yourself at least one hour in the workday window.'
  return null
}

export async function getOnboardingStateAction(): Promise<{
  success: boolean
  state?: OnboardingState | null
  error?: string
}> {
  try {
    const user = await getLoggedUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const state = await OnboardingService.getState(user.id)
    return { success: true, state: state ?? await OnboardingService.initialize(user.id) }
  } catch (error) {
    console.error('[getOnboardingStateAction] Failed:', error)
    return { success: false, error: 'Unable to load onboarding state.' }
  }
}

export async function saveOnboardingStateAction(input: OnboardingState): Promise<{
  success: boolean
  state?: OnboardingState
  error?: string
}> {
  try {
    const user = await getLoggedUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const parsed = onboardingStateSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Invalid onboarding state.' }

    const workdayError = validateWorkday(parsed.data)
    if (workdayError) return { success: false, error: workdayError }

    const state = await OnboardingService.saveState(user.id, parsed.data)
    return { success: true, state }
  } catch (error) {
    console.error('[saveOnboardingStateAction] Failed:', error)
    return { success: false, error: 'Unable to save onboarding progress.' }
  }
}

export async function completeOnboardingAction(input: OnboardingState): Promise<{
  success: boolean
  state?: OnboardingState
  plan?: {
    created: boolean
    activityId: string | null
    scheduledTime: string | null
    durationMinutes: number
  }
  error?: string
}> {
  try {
    const user = await getLoggedUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const parsed = onboardingStateSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Invalid onboarding state.' }

    const workdayError = validateWorkday(parsed.data)
    if (workdayError) return { success: false, error: workdayError }

    if (!parsed.data.firstDayObjective.trim()) {
      return { success: false, error: 'Give your first day one clear objective.' }
    }

    const plan = await OnboardingService.createFirstDayPlan(user.id, parsed.data)
    const completedState: OnboardingState = {
      ...plan.state,
      status: 'COMPLETED',
      currentStep: 8,
      completedSteps: Array.from(new Set([...plan.state.completedSteps, 8])),
      completedAt: new Date().toISOString(),
    }

    const state = await OnboardingService.saveState(user.id, completedState)
    return {
      success: true,
      state,
      plan: {
        created: plan.created,
        activityId: plan.activityId,
        scheduledTime: plan.scheduledTime,
        durationMinutes: plan.durationMinutes,
      },
    }
  } catch (error) {
    console.error('[completeOnboardingAction] Failed:', error)
    return { success: false, error: 'Could not generate your first-day plan.' }
  }
}

export async function getOnboardingCalendarDiscoveryAction(): Promise<{
  success: boolean
  connected: boolean
  eventCount?: number
  events?: Array<{ id: string; title: string; start: string; end: string }>
  error?: string
}> {
  try {
    const user = await getLoggedUser()
    if (!user) return { success: false, connected: false, error: 'Unauthorized' }

    const connected = await GoogleCredentialService.isConnected(user.id)
    if (!connected) return { success: true, connected: false }

    const now = new Date()
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const events = await db.calendarEvent.findMany({
      where: {
        userId: user.id,
        externalProvider: 'GOOGLE',
        deletedAt: null,
        start: { lt: weekAhead },
        end: { gt: now },
      },
      orderBy: { start: 'asc' },
      take: 20,
      select: { id: true, title: true, start: true, end: true },
    })

    return {
      success: true,
      connected: true,
      eventCount: events.length,
      events: events.slice(0, 6).map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
      })),
    }
  } catch (error) {
    console.error('[getOnboardingCalendarDiscoveryAction] Failed:', error)
    return { success: false, connected: false, error: 'Unable to inspect your calendar yet.' }
  }
}
