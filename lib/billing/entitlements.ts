import { CanonicalBillingState, PlanId, UserEntitlements } from './types'
import { PLANS } from './plans'

export interface SubscriptionSnapshot {
  id: string
  plan: string
  status: string
  billingInterval: string
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  isIntroductory: boolean
}

const FREE_ENTITLEMENTS: UserEntitlements = {
  tier: 'FREE',
  plan: 'FREE',
  isPro: false,
  features: {
    ...PLANS.FREE.capabilities.features,
    premiumVault: false,
    advancedCalendar: false,
    advancedJournal: false,
    unlimitedNotes: PLANS.FREE.capabilities.features.unlimited_notes,
    prioritySupport: false
  },
  limits: {
    ...PLANS.FREE.capabilities.limits,
    maxVaultFiles: PLANS.FREE.capabilities.limits.vault_storage,
    maxActiveActivities: PLANS.FREE.capabilities.limits.active_activities
  },
  subscription: null
}

export function resolveCanonicalState(
  subscription: SubscriptionSnapshot | null | undefined,
  now: Date = new Date()
): CanonicalBillingState {
  if (!subscription) return 'FREE'

  const status = subscription.status.toUpperCase()
  const isPeriodActive = subscription.currentPeriodEnd ? subscription.currentPeriodEnd > now : true

  if (subscription.cancelAtPeriodEnd && isPeriodActive) {
    return 'CANCEL_AT_PERIOD_END'
  }

  if (status === 'ACTIVE' || status === 'AUTHENTICATED') {
    return isPeriodActive ? 'ACTIVE' : 'EXPIRED'
  }

  if (status === 'CANCELLED') {
    return isPeriodActive ? 'CANCEL_AT_PERIOD_END' : 'CANCELLED'
  }

  if (status === 'CREATED' || status === 'PENDING') {
    return 'CHECKOUT_PENDING'
  }

  if (status === 'HALTED' || status === 'PAST_DUE') {
    return 'PAST_DUE'
  }

  if (status === 'FAILED') {
    return 'PAYMENT_FAILED'
  }

  if (status === 'EXPIRED') {
    return 'EXPIRED'
  }

  return 'FREE'
}

/**
 * Calculates server-authoritative entitlements for a given user subscription state.
 *
 * Architecture:
 * Subscription -> Plan -> Product Tier (FREE | PRO | TEAM) -> Entitlements -> Feature & Limit access
 *
 * Rules:
 * 1. Missing subscription => FREE entitlements.
 * 2. Subscription in 'ACTIVE' or 'AUTHENTICATED' state => PRO entitlements.
 * 3. Subscription in 'CANCELLED' / 'cancelAtPeriodEnd' BUT currentPeriodEnd > now => PRO entitlements (grace period).
 * 4. Expired, halted, past_due, or cancelled past period end => Downgrades to FREE.
 */
export function calculateEntitlements(
  subscription: SubscriptionSnapshot | null | undefined,
  now: Date = new Date()
): UserEntitlements {
  if (!subscription) {
    return FREE_ENTITLEMENTS
  }

  const plan = subscription.plan.toUpperCase() as PlanId
  const isProPlan = plan === 'PRO_MONTHLY' || plan === 'PRO_ANNUAL'
  const canonicalState = resolveCanonicalState(subscription, now)

  if (!isProPlan) {
    return FREE_ENTITLEMENTS
  }

  // Active or grace period retains Pro access
  const hasProAccess = canonicalState === 'ACTIVE' || canonicalState === 'CANCEL_AT_PERIOD_END'

  if (!hasProAccess) {
    return {
      ...FREE_ENTITLEMENTS,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        canonicalState,
        plan,
        tier: 'FREE',
        interval: subscription.billingInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        isIntroductory: subscription.isIntroductory
      }
    }
  }

  const capabilities = PLANS[plan].capabilities

  return {
    tier: 'PRO',
    plan,
    isPro: true,
    features: {
      ...capabilities.features,
      premiumVault: capabilities.features.advanced_vault,
      advancedCalendar: capabilities.features.advanced_calendar,
      advancedJournal: capabilities.features.advanced_journal,
      unlimitedNotes: capabilities.features.unlimited_notes,
      prioritySupport: false
    },
    limits: {
      ...capabilities.limits,
      maxVaultFiles: capabilities.limits.vault_storage,
      maxActiveActivities: capabilities.limits.active_activities
    },
    subscription: {
      id: subscription.id,
      status: subscription.status,
      canonicalState,
      plan,
      tier: 'PRO',
      interval: subscription.billingInterval,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
      isIntroductory: subscription.isIntroductory
    }
  }
}
