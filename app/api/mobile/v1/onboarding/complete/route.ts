import { z } from 'zod'
import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { OnboardingService, type OnboardingState } from '@/lib/services/OnboardingService'

const onboardingStateSchema = z.object({
  version: z.literal(1).default(1),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']),
  currentStep: z.number().int().min(0).max(7),
  completedSteps: z.array(z.number().int().min(0).max(7)).max(8),
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

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = onboardingStateSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const plan = await OnboardingService.createFirstDayPlan(user.id, parsed.data as OnboardingState)
    const completedState: OnboardingState = {
      ...plan.state,
      status: 'COMPLETED',
      currentStep: 7,
      completedSteps: Array.from(new Set([...plan.state.completedSteps, 7])),
      completedAt: new Date().toISOString(),
    }

    const saved = await OnboardingService.saveState(user.id, completedState)
    return apiSuccess({
      state: saved,
      plan: {
        created: plan.created,
        activityIds: plan.activityIds,
        activities: plan.activities,
      },
    })
  } catch (error) {
    console.error('[MobileOnboardingComplete] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to complete onboarding and provision plan', 500)
  }
}
