'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { UserEntitlements } from '@/lib/billing/types'

const FREE_SNAPSHOT: UserEntitlements = {
  tier: 'FREE',
  plan: 'FREE',
  isPro: false,
  features: {
    advanced_calendar: false,
    advanced_journal: false,
    advanced_vault: false,
    unlimited_notes: true,
    priority_sync: false,
    premiumVault: false,
    advancedCalendar: false,
    advancedJournal: false,
    unlimitedNotes: true,
    prioritySupport: false,
  },
  limits: {
    vault_storage: 10,
    active_activities: 10,
    maxVaultFiles: 10,
    maxActiveActivities: 10,
  },
  subscription: null,
}

interface EntitlementContextValue {
  entitlements: UserEntitlements
  isPro: boolean
  isLoading: boolean
}

const EntitlementContext = createContext<EntitlementContextValue>({
  entitlements: FREE_SNAPSHOT,
  isPro: false,
  isLoading: true,
})

/**
 * Provides a single server-authoritative entitlement snapshot to all child components.
 *
 * Architecture: Subscription -> EntitlementService -> getEntitlementsAction -> this context
 *
 * Rules:
 * - Fetches once on mount. Never re-fetches unless the component is unmounted and remounted.
 * - Falls back to FREE_SNAPSHOT while loading or on error.
 * - Do NOT call getEntitlementsAction() independently in child components -- consume this context.
 */
export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [entitlements, setEntitlements] = useState<UserEntitlements>(FREE_SNAPSHOT)
  const [isPro, setIsPro] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const { getEntitlementsAction } = await import('@/app/actions/billing')
        const result = await getEntitlementsAction()
        if (cancelled) return
        if (result.success && result.entitlements) {
          setEntitlements(result.entitlements)
          setIsPro(result.entitlements.isPro)
        }
      } catch {
        // Silently fall back to FREE snapshot -- never crash UI on entitlement failure
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <EntitlementContext.Provider value={{ entitlements, isPro, isLoading }}>
      {children}
    </EntitlementContext.Provider>
  )
}

/**
 * Consume the current user's entitlement snapshot.
 *
 * Usage:
 *   const { isPro, entitlements, isLoading } = useEntitlements()
 *
 * Must be used inside <EntitlementProvider>.
 */
export function useEntitlements(): EntitlementContextValue {
  return useContext(EntitlementContext)
}
