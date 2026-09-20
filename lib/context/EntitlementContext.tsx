'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { UserEntitlements } from '@/lib/billing/types'

export const FREE_SNAPSHOT: UserEntitlements = {
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

export interface EntitlementContextValue {
  entitlements: UserEntitlements
  isPro: boolean
  isLoading: boolean
  refreshEntitlements: (forced?: UserEntitlements) => Promise<UserEntitlements>
}

const EntitlementContext = createContext<EntitlementContextValue>({
  entitlements: FREE_SNAPSHOT,
  isPro: false,
  isLoading: true,
  refreshEntitlements: async () => FREE_SNAPSHOT,
})

/**
 * Provides a single server-authoritative entitlement snapshot to all child components.
 *
 * Architecture: Subscription -> EntitlementService -> getEntitlementsAction -> this context
 *
 * Revalidation:
 * - Fetches initial snapshot on mount.
 * - Exposes refreshEntitlements() for direct post-checkout or post-mutation revalidation.
 * - Listens for window 'tracker_entitlements_refresh' events to synchronize across components.
 * - Silently revalidates on tab focus / visibilitychange when returning from external checkout.
 */
export function EntitlementProvider({ children, initialSnapshot }: { children: React.ReactNode; initialSnapshot?: UserEntitlements | null }) {
  const [entitlements, setEntitlements] = useState<UserEntitlements>(initialSnapshot ?? FREE_SNAPSHOT)
  const [isPro, setIsPro] = useState(initialSnapshot?.isPro ?? false)
  const [isLoading, setIsLoading] = useState(!initialSnapshot)

  const inFlightPromiseRef = useRef<Promise<UserEntitlements> | null>(null)

  const refreshEntitlements = useCallback(async (forced?: UserEntitlements): Promise<UserEntitlements> => {
    if (forced) {
      setEntitlements(forced)
      setIsPro(forced.isPro)
      setIsLoading(false)
    }

    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current
    }

    const task = (async () => {
      try {
        const { getEntitlementsAction } = await import('@/app/actions/billing')
        const result = await getEntitlementsAction()
        if (result.success && result.entitlements) {
          setEntitlements(result.entitlements)
          setIsPro(result.entitlements.isPro)
          return result.entitlements
        }
        return forced || FREE_SNAPSHOT
      } catch {
        return forced || FREE_SNAPSHOT
      } finally {
        setIsLoading(false)
        inFlightPromiseRef.current = null
      }
    })()

    inFlightPromiseRef.current = task
    return task
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      // Skip redundant initial fetch if the server already provided an access snapshot
      if (initialSnapshot) {
        setIsLoading(false)
        return
      }
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

    loadInitial()

    // Listen for custom event across the window
    const handleRefreshEvent = () => {
      refreshEntitlements()
    }

    // Revalidate on visibilitychange / window focus (e.g. returning from 3DS payment tab)
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshEntitlements()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('tracker_entitlements_refresh', handleRefreshEvent)
      window.addEventListener('focus', handleRefreshEvent)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('tracker_entitlements_refresh', handleRefreshEvent)
        window.removeEventListener('focus', handleRefreshEvent)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [refreshEntitlements])

  return (
    <EntitlementContext.Provider value={{ entitlements, isPro, isLoading, refreshEntitlements }}>
      {children}
    </EntitlementContext.Provider>
  )
}

/**
 * Consume the current user's entitlement snapshot and refresh capability.
 *
 * Usage:
 *   const { isPro, entitlements, isLoading, refreshEntitlements } = useEntitlements()
 *
 * Must be used inside <EntitlementProvider>.
 */
export function useEntitlements(): EntitlementContextValue {
  return useContext(EntitlementContext)
}
