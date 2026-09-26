"use server"

import { z } from 'zod'
import { getLoggedUser } from '@/app/actions/auth'
import { OnboardingService, OnboardingState } from '@/lib/services/OnboardingService'

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
  momentum: z.number().int().min(0).max(1000),
  createdAt: z.string().min(1),
  completedAt: z.string().nullable(),
})

export async function getOnboardingStateAction(): Promise<{
  success: boolean
  state?: OnboardingState | null
  error?: string
}> {
  try {
    const user = await getLoggedUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    return { success: true, state: await OnboardingService.getState(user.id) }
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

    const state = await OnboardingService.saveState(user.id, parsed.data)
    return { success: true, state }
  } catch (error) {
    console.error('[saveOnboardingStateAction] Failed:', error)
    return { success: false, error: 'Unable to save onboarding progress.' }
  }
}
