export interface SubscriptionCandidate {
  id: string
  userId: string
  plan: string
  status: string
  billingInterval?: string | null
  currentPeriodStart?: Date | string | null
  currentPeriodEnd?: Date | string | null
  cancelAtPeriodEnd?: boolean | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  deletedAt?: Date | string | null
  [key: string]: unknown
}

function parseDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  const parsed = new Date(val)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Pure, deterministic decision function to select the single canonical effective subscription.
 *
 * Priority (highest → lowest):
 * 1. ACTIVE or AUTHENTICATED with unexpired period (PRO_ANNUAL > PRO_MONTHLY, then latest currentPeriodEnd)
 * 2. CANCELLED with cancelAtPeriodEnd=true and future currentPeriodEnd (grace period)
 * 3. HALTED or PAST_DUE (delinquent paid subscriptions)
 * 4. CREATED or PENDING (in-flight checkout)
 * 5. Deterministic fallback to most recent candidate
 */
export function selectCanonicalSubscription<T extends SubscriptionCandidate>(
  subscriptions: T[],
  now: Date = new Date()
): T | null {
  if (!subscriptions || subscriptions.length === 0) return null

  // Ignore any soft-deleted subscriptions
  const activeCandidates = subscriptions.filter(s => !s.deletedAt)
  if (activeCandidates.length === 0) return null
  if (activeCandidates.length === 1) return activeCandidates[0]

  const nowMs = now.getTime()

  // Helper to compare period ends descending
  const sortByPeriodEndDesc = (a: T, b: T) => {
    const aEnd = parseDate(a.currentPeriodEnd)?.getTime() ?? 0
    const bEnd = parseDate(b.currentPeriodEnd)?.getTime() ?? 0
    if (bEnd !== aEnd) return bEnd - aEnd
    const aCreated = parseDate(a.createdAt)?.getTime() ?? 0
    const bCreated = parseDate(b.createdAt)?.getTime() ?? 0
    return bCreated - aCreated
  }

  // Priority 1: ACTIVE or AUTHENTICATED with unexpired (or null) period
  const activeSubs = activeCandidates.filter(s => {
    const status = (s.status || '').toUpperCase()
    const pEnd = parseDate(s.currentPeriodEnd)
    const isPeriodActive = pEnd ? pEnd.getTime() > nowMs : true
    return (status === 'ACTIVE' || status === 'AUTHENTICATED') && isPeriodActive
  })

  if (activeSubs.length > 0) {
    return activeSubs.sort((a, b) => {
      const aPlan = (a.plan || '').toUpperCase()
      const bPlan = (b.plan || '').toUpperCase()
      if (aPlan === 'PRO_ANNUAL' && bPlan !== 'PRO_ANNUAL') return -1
      if (bPlan === 'PRO_ANNUAL' && aPlan !== 'PRO_ANNUAL') return 1
      return sortByPeriodEndDesc(a, b)
    })[0]
  }

  // Priority 2: CANCELLED but still in grace period (cancelAtPeriodEnd + future periodEnd)
  const graceSubs = activeCandidates.filter(s => {
    const status = (s.status || '').toUpperCase()
    const pEnd = parseDate(s.currentPeriodEnd)
    return status === 'CANCELLED' && !!s.cancelAtPeriodEnd && !!pEnd && pEnd.getTime() > nowMs
  })

  if (graceSubs.length > 0) {
    return graceSubs.sort(sortByPeriodEndDesc)[0]
  }

  // Priority 3: HALTED or PAST_DUE
  const delinquentSubs = activeCandidates.filter(s => {
    const status = (s.status || '').toUpperCase()
    return status === 'HALTED' || status === 'PAST_DUE'
  })

  if (delinquentSubs.length > 0) {
    return delinquentSubs.sort(sortByPeriodEndDesc)[0]
  }

  // Priority 4: CREATED or PENDING
  const pendingSubs = activeCandidates.filter(s => {
    const status = (s.status || '').toUpperCase()
    return status === 'CREATED' || status === 'PENDING'
  })

  if (pendingSubs.length > 0) {
    return pendingSubs.sort(sortByPeriodEndDesc)[0]
  }

  // Priority 5: Fallback to highest sorted candidate
  return activeCandidates.sort(sortByPeriodEndDesc)[0]
}
