import { PlanConfig, PlanId, ProductTier } from './types'

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
      'Daily Habits & Recurring Schedules',
      'Timeline & Calendar Views',
      'Standard Journal & Daily Notes',
      'Weight & Health Tracking',
      'Up to 10 Secure Vault Files',
      'Standard Local Storage Sync'
    ]
  },
  PRO_MONTHLY: {
    id: 'PRO_MONTHLY',
    tier: 'PRO',
    name: 'Pro Monthly',
    tagline: 'Complete power, automated syncing, and unlimited capacity',
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
      'Unlimited Secure Vault Storage & Encrypted Export',
      'Automated External Calendar Sync & Writebacks',
      'Rich Journal & Link Exports (PDF, CSV & JSON)',
      'Unlimited Historical Notes & Analytics',
      'Priority Cloud Sync & Offline Queue Engine'
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
      'Unlimited Secure Vault Storage & Encrypted Export',
      'Automated External Calendar Sync & Writebacks',
      'Rich Journal & Link Exports (PDF, CSV & JSON)',
      'Unlimited Historical Notes & Analytics',
      'Priority Cloud Sync & Offline Queue Engine'
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
  if (plan.id === 'PRO_MONTHLY' && isIntroEligible && plan.introductoryPrice !== undefined) {
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
    return process.env.RAZORPAY_PLAN_PRO_MONTHLY || 'plan_pro_monthly_test'
  }
  if (planId === 'PRO_ANNUAL') {
    return process.env.RAZORPAY_PLAN_PRO_ANNUAL || 'plan_pro_annual_test'
  }
  return ''
}

export function getIntroductoryOfferId(): string | undefined {
  return process.env.RAZORPAY_OFFER_INTRODUCTORY
}
