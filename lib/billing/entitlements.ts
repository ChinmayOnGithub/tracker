import { CanonicalBillingState, PlanId, UserEntitlements } from './types'

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
    advanced_calendar: false,
    advanced_journal: false,
    advanced_vault: false,
    unlimited_notes: true,
    priority_sync: false,
    // Aliases
    premiumVault: false,
    advancedCalendar: false,
    advancedJournal: false,
    unlimitedNotes: true,
    prioritySupport: false
  },
  limits: {
    vault_storage: 10,
    active_activities: 10,
    activities_active: 10,
    tasks_created_daily: 50,
    calendar_events_created_daily: 5,
    // Aliases
    maxVaultFiles: 10,
    maxActiveActivities: 10
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

  return {
    tier: 'PRO',
    plan,
    isPro: true,
    features: {
      advanced_calendar: true,
      advanced_journal: true,
      advanced_vault: true,
      unlimited_notes: true,
      priority_sync: true,
      // Aliases
      premiumVault: true,
      advancedCalendar: true,
      advancedJournal: true,
      unlimitedNotes: true,
      prioritySupport: true
    },
    limits: {
      vault_storage: 10000,
      active_activities: 10000,
      activities_active: 10000,
      tasks_created_daily: 10000,
      calendar_events_created_daily: 10000,
      // Aliases
      maxVaultFiles: 10000,
      maxActiveActivities: 10000
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
