import { PlanConfig, PlanId, ProductTier } from './types'
import { ProviderConfigurationError } from './errors'

export const PLANS: Record<PlanId, PlanConfig> = {
  FREE: {
    id: 'FREE',
    tier: 'FREE',
    name: 'Free',
    tagline: 'Essential time-centric tracking for individuals',
    price: 0,
    priceInPaise: 0,
    currency: 'INR',
    interval: 'none',
    features: [
      'Up to 10 Active Habits & Recurring Activities',
      'Up to 50 Daily Tasks & Schedule Events',
      'Dynamic Timeline & Calendar Views',
      'Historical Journal & Notes Access',
      'Weight & Health Metric History',
      'Link Library & Bookmarking'
    ]
  },
  PRO_MONTHLY: {
    id: 'PRO_MONTHLY',
    tier: 'PRO',
    name: 'Pro Monthly',
    tagline: 'Complete power, automated syncing, and expanded capacity',
    price: 99,
    priceInPaise: 9900,
    introductoryPrice: 29, // ₹29 for first month for eligible new subscribers
    introductoryPriceInPaise: 2900,
    currency: 'INR',
    interval: 'monthly',
    popular: true,
    features: [
      'All Free Plan Capabilities',
      'Introductory First Month for ₹29',
      'Up to 10,000 Active Habits & Activities',
      'Two-Way Google Calendar Sync & Writebacks',
      'Daily Journal Writing & Archive Exports (JSON, Markdown)',
      'Notes Creation, Writing & Full History',
      'Priority Customer Support'
    ],
    providerPlanIdEnvKey: 'RAZORPAY_PLAN_PRO_MONTHLY'
  },
  PRO_ANNUAL: {
    id: 'PRO_ANNUAL',
    tier: 'PRO',
    name: 'Pro Annual',
    tagline: 'Best value for committed continuous trackers',
    price: 799, // ~₹66.58/month, 33% discount
    priceInPaise: 79900,
    currency: 'INR',
    interval: 'annual',
    features: [
      'All Pro Features Included',
      '₹799/year (Save 33% compared to monthly)',
      'Up to 10,000 Active Habits & Activities',
      'Two-Way Google Calendar Sync & Writebacks',
      'Daily Journal Writing & Archive Exports (JSON, Markdown)',
      'Notes Creation, Writing & Full History',
      'Priority Customer Support'
    ],
    providerPlanIdEnvKey: 'RAZORPAY_PLAN_PRO_ANNUAL'
  }
}

export function getPlan(planId: string): PlanConfig {
  const normalized = planId.toUpperCase() as PlanId
  return PLANS[normalized] || PLANS.FREE
}

export function getPlanTier(planId: string): ProductTier {
  return getPlan(planId).tier
}

export function getAllPlans(): PlanConfig[] {
  return [PLANS.FREE, PLANS.PRO_MONTHLY, PLANS.PRO_ANNUAL]
}

/**
 * Server-side authoritative price resolver.
 * Calculates exact charge amount in INR and paise based on plan and introductory offer eligibility.
 */
export function getAuthoritativePrice(
  planId: PlanId,
  isIntroEligible: boolean
): {
  amount: number
  amountInPaise: number
  isIntroductory: boolean
  currency: string
} {
  const plan = getPlan(planId)
  const hasValidOffer = !!getIntroductoryOfferId()
  if (plan.id === 'PRO_MONTHLY' && isIntroEligible && hasValidOffer && plan.introductoryPrice !== undefined) {
    return {
      amount: plan.introductoryPrice,
      amountInPaise: plan.introductoryPriceInPaise ?? plan.introductoryPrice * 100,
      isIntroductory: true,
      currency: plan.currency
    }
  }

  return {
    amount: plan.price,
    amountInPaise: plan.priceInPaise,
    isIntroductory: false,
    currency: plan.currency
  }
}

export function getProviderPlanId(planId: PlanId): string {
  if (planId === 'PRO_MONTHLY') {
    const id = process.env.RAZORPAY_PLAN_PRO_MONTHLY
    if (!id) {
      if (process.env.NODE_ENV === 'test') return 'plan_pro_monthly_test'
      throw new ProviderConfigurationError('Missing required environment variable: RAZORPAY_PLAN_PRO_MONTHLY')
    }
    return id
  }
  if (planId === 'PRO_ANNUAL') {
    const id = process.env.RAZORPAY_PLAN_PRO_ANNUAL
    if (!id) {
      if (process.env.NODE_ENV === 'test') return 'plan_pro_annual_test'
      throw new ProviderConfigurationError('Missing required environment variable: RAZORPAY_PLAN_PRO_ANNUAL')
    }
    return id
  }
  return ''
}

export function getIntroductoryOfferId(): string | undefined {
  const value = process.env.RAZORPAY_OFFER_INTRODUCTORY?.trim()

  if (!value) return undefined

  if (
    value === 'offer_placeholder' ||
    value === 'placeholder' ||
    value === 'undefined' ||
    value === 'null'
  ) {
    return undefined
  }

  return value
}
