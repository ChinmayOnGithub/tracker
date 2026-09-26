import { redirect } from 'next/navigation'
import { SessionService } from '@/lib/services/SessionService'
import { OnboardingService } from '@/lib/services/OnboardingService'
import { OnboardingExperience } from '@/modules/core/onboarding/OnboardingExperience'

export default async function OnboardingPage() {
  const user = await SessionService.getSessionUser()
  if (!user) redirect('/')

  const state = await OnboardingService.getState(user.id)
  const initialState = state ?? await OnboardingService.initialize(user.id)

  if (initialState.status === 'COMPLETED') {
    redirect('/')
  }

  return <OnboardingExperience initialState={initialState} username={user.username} />
}
