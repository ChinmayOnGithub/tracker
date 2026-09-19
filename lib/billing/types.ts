export type ProductTier = 'FREE' | 'PRO' | 'TEAM'
export type PlanId = 'FREE' | 'PRO_MONTHLY' | 'PRO_ANNUAL'
export type PlanInterval = 'monthly' | 'annual' | 'none'

export type CanonicalBillingState =
  | 'FREE'
  | 'CHECKOUT_PENDING'
  | 'ACTIVE'
  | 'CANCEL_AT_PERIOD_END'
  | 'CANCELLED'
  | 'PAYMENT_FAILED'
  | 'PAST_DUE'
  | 'EXPIRED'

export type FeatureKey =
  | 'advanced_calendar'
  | 'advanced_journal'
  | 'advanced_vault'
  | 'unlimited_notes'
  | 'priority_sync'

export type LimitKey =
  | 'vault_storage'
  | 'active_activities'

export type SubscriptionStatus =
  | 'CREATED'
  | 'AUTHENTICATED'
  | 'ACTIVE'
  | 'PENDING'
  | 'HALTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED'

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'

export interface PlanCapabilities {
  features: Record<FeatureKey, boolean>
  limits: Record<LimitKey, number>
}

export interface PlanFeatureDetail {
  id: string
  name: string
  description: string
  type: 'feature' | 'limit'
}

export interface PlanConfig {
  id: PlanId
  tier: ProductTier
  name: string
  tagline: string
  price: number // In standard currency units (INR), e.g. 99
  priceInPaise: number // In minor units (paise), e.g. 9900
  introductoryPrice?: number // E.g. 29
  introductoryPriceInPaise?: number // E.g. 2900
  currency: string
  interval: PlanInterval
  popular?: boolean
  features: string[]
  capabilities: PlanCapabilities
  featureDetails: PlanFeatureDetail[]
  providerPlanIdEnvKey?: string
}

export interface UserEntitlements {
  tier: ProductTier
  plan: PlanId
  isPro: boolean
  features: Record<FeatureKey, boolean> & {
    premiumVault: boolean
    advancedCalendar: boolean
    advancedJournal: boolean
    unlimitedNotes: boolean
    prioritySupport: boolean
  }
  limits: Record<LimitKey, number> & {
    maxVaultFiles: number
    maxActiveActivities: number
  }
  subscription?: {
    id: string
    status: string
    canonicalState: CanonicalBillingState
    plan: PlanId
    tier: ProductTier
    interval: string
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
    isIntroductory: boolean
  } | null
}

export interface SafeCheckoutPayload {
  subscriptionId: string
  keyId: string
  name: string
  description: string
  amount: number // in paise/minor units or standard display
  currency: string
  planId: PlanId
  isIntroductory: boolean
  customerEmail?: string | null
  customerName?: string | null
}

export interface CreateCustomerInput {
  userId: string
  email?: string | null
  name?: string | null
}

export interface CustomerResult {
  providerCustomerId: string
}

export interface CreateSubscriptionInput {
  planId: PlanId
  customerId: string
  offerId?: string | null
  isIntroductory?: boolean
  notes?: Record<string, string>
}

export interface SubscriptionCheckoutResult {
  providerSubscriptionId: string
  keyId: string
  amount: number
  currency: string
}

export interface CancelSubscriptionInput {
  providerSubscriptionId: string
  cancelAtPeriodEnd?: boolean
}

export interface ProviderSubscription {
  id: string
  status: string
  currentStart: Date | null
  currentEnd: Date | null
  planId: string
  chargeAt?: Date | null
  cancelAtPeriodEnd?: boolean
}

export interface ProviderPayment {
  id: string
  amount: number
  currency: string
  status: string
  method?: string
  paidAt?: Date | null
}

export interface NormalizedWebhookEvent {
  eventId: string
  eventType: string
  occurredAt?: Date
  providerSubscriptionId?: string
  providerPaymentId?: string
  status?: string
  currentPeriodStart?: Date | null
  currentPeriodEnd?: Date | null
  amount?: number
  currency?: string
  method?: string
  notes?: Record<string, string>
  raw: unknown
}
