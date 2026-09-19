import { PlanConfig, PlanId, ProductTier } from './types'
import { ProviderConfigurationError } from './errors'

export const PLAN_FEATURE_CATALOG = [
  {
    id: 'active_activities',
    name: 'Active activities',
    description: 'Recurring habits and activities you can keep active at once.',
    type: 'limit' as const
  },
  {
    id: 'vault_storage',
    name: 'Secure Vault files',
    description: 'Encrypted files stored in your Tracker Vault.',
    type: 'limit' as const
  },
  {
    id: 'advanced_calendar',
    name: 'External calendar sync',
    description: 'Advanced external calendar sync and writebacks.',
    type: 'feature' as const
  },
  {
    id: 'advanced_journal',
    name: 'Advanced journal',
    description: 'Rich PDF/Markdown exports and deeper reflection analytics.',
    type: 'feature' as const
  },
  {
    id: 'advanced_vault',
    name: 'Advanced Vault',
    description: 'Premium secure-vault operations.',
    type: 'feature' as const
  },
  {
    id: 'unlimited_notes',
    name: 'Notes',
    description: 'Access to the Notes module.',
    type: 'feature' as const
  },
  {
    id: 'priority_sync',
    name: 'Priority sync',
    description: 'Priority cloud sync and offline queue processing.',
    type: 'feature' as const
  }
] as const

export const PLANS: Record<PlanId, PlanConfig> = {
  FREE: {
    id: 'FREE',
    tier: 'FREE',
    name: 'Free',
    tagline: 'Core tracking for everyday use',
    price: 0,
    priceInPaise: 0,
    currency: 'INR',
    interval: 'none',
    features: [
      'Up to 10 active activities',
      'Timeline & calendar views',
      'Standard journal & daily notes',
      'Weight & health tracking',
      'Up to 10 secure Vault files',
      'Notes',
      'Standard local sync'
    ],
    capabilities: {
      features: {
        advanced_calendar: false,
        advanced_journal: false,
        advanced_vault: false,
        unlimited_notes: true,
        priority_sync: false
      },
      limits: {
        vault_storage: 10,
        active_activities: 10
      }
    },
    featureDetails: [
      { id: 'active_activities', name: 'Active activities', description: 'Up to 10 active recurring activities.', type: 'limit' },
      { id: 'vault_storage', name: 'Secure Vault files', description: 'Up to 10 encrypted Vault files.', type: 'limit' },
      { id: 'advanced_calendar', name: 'External calendar sync', description: 'Not included in Free.', type: 'feature' },
      { id: 'advanced_journal', name: 'Advanced journal', description: 'Not included in Free.', type: 'feature' },
      { id: 'advanced_vault', name: 'Advanced Vault', description: 'Not included in Free.', type: 'feature' },
      { id: 'unlimited_notes', name: 'Notes', description: 'Included.', type: 'feature' },
      { id: 'priority_sync', name: 'Priority sync', description: 'Not included in Free.', type: 'feature' }
    ]
  },
  PRO_MONTHLY: {
    id: 'PRO_MONTHLY',
    tier: 'PRO',
    name: 'Pro Monthly',
    tagline: 'Full Tracker capabilities with monthly billing',
    price: 99,
    priceInPaise: 9900,
    introductoryPrice: 29,
    introductoryPriceInPaise: 2900,
    currency: 'INR',
    interval: 'monthly',
    popular: true,
    features: [
      'Up to 10,000 active activities',
      'Up to 10,000 secure Vault files',
      'External calendar sync & writebacks',
      'Advanced journal exports & analytics',
      'Advanced Vault capabilities',
      'Notes',
      'Priority cloud sync'
    ],
    capabilities: {
      features: {
        advanced_calendar: true,
        advanced_journal: true,
        advanced_vault: true,
        unlimited_notes: true,
        priority_sync: true
      },
      limits: {
        vault_storage: 10000,
        active_activities: 10000
      }
    },
    featureDetails: [
      { id: 'active_activities', name: 'Active activities', description: 'Up to 10,000 active recurring activities.', type: 'limit' },
      { id: 'vault_storage', name: 'Secure Vault files', description: 'Up to 10,000 encrypted Vault files.', type: 'limit' },
      { id: 'advanced_calendar', name: 'External calendar sync', description: 'Advanced external calendar sync and writebacks.', type: 'feature' },
      { id: 'advanced_journal', name: 'Advanced journal', description: 'Rich PDF/Markdown exports and deeper reflection analytics.', type: 'feature' },
      { id: 'advanced_vault', name: 'Advanced Vault', description: 'Premium secure-vault operations.', type: 'feature' },
      { id: 'unlimited_notes', name: 'Notes', description: 'Included.', type: 'feature' },
      { id: 'priority_sync', name: 'Priority sync', description: 'Priority cloud sync and offline queue processing.', type: 'feature' }
    ],
    providerPlanIdEnvKey: 'RAZORPAY_PLAN_PRO_MONTHLY'
  },
  PRO_ANNUAL: {
    id: 'PRO_ANNUAL',
    tier: 'PRO',
    name: 'Pro Annual',
    tagline: 'Full Tracker capabilities with annual billing',
    price: 799,
    priceInPaise: 79900,
    currency: 'INR',
    interval: 'annual',
    features: [
      'All Pro capabilities',
      'Up to 10,000 active activities',
      'Up to 10,000 secure Vault files',
      'External calendar sync & writebacks',
      'Advanced journal exports & analytics',
      'Advanced Vault capabilities',
      'Priority cloud sync'
    ],
    capabilities: {
      features: {
        advanced_calendar: true,
        advanced_journal: true,
        advanced_vault: true,
        unlimited_notes: true,
        priority_sync: true
      },
      limits: {
        vault_storage: 10000,
        active_activities: 10000
      }
    },
    featureDetails: [
      { id: 'active_activities', name: 'Active activities', description: 'Up to 10,000 active recurring activities.', type: 'limit' },
      { id: 'vault_storage', name: 'Secure Vault files', description: 'Up to 10,000 encrypted Vault files.', type: 'limit' },
      { id: 'advanced_calendar', name: 'External calendar sync', description: 'Advanced external calendar sync and writebacks.', type: 'feature' },
      { id: 'advanced_journal', name: 'Advanced journal', description: 'Rich PDF/Markdown exports and deeper reflection analytics.', type: 'feature' },
      { id: 'advanced_vault', name: 'Advanced Vault', description: 'Premium secure-vault operations.', type: 'feature' },
      { id: 'unlimited_notes', name: 'Notes', description: 'Included.', type: 'feature' },
      { id: 'priority_sync', name: 'Priority sync', description: 'Priority cloud sync and offline queue processing.', type: 'feature' }
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
