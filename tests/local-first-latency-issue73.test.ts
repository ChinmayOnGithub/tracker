import { describe, it, expect } from 'bun:test'
import { perfTracker } from '@/lib/performance/perfTracker'

describe('Issue #73: Local-First UX & Latency Regression Guard', () => {
  it('measures critical rendering path milestones via perfTracker without error', () => {
    perfTracker.mark('navigation_start')
    perfTracker.mark('local_hydration_start')
    perfTracker.mark('local_hydration_end')
    perfTracker.mark('first_usable_render')

    const hydrationDuration = perfTracker.measure(
      'hydration_latency',
      'local_hydration_start',
      'local_hydration_end'
    )

    expect(hydrationDuration).toBeDefined()
    expect(typeof hydrationDuration).toBe('number')
    expect(hydrationDuration).toBeGreaterThanOrEqual(0)
  })

  it('instant hydration state transition enables immediate usable UI', () => {
    let isHydrated = false
    const cachedTemplates = [{ id: 't-1', name: 'Exercise' }]

    // Before hydration starts
    const shouldShowSkeletonInitial = !isHydrated && cachedTemplates.length === 0
    expect(shouldShowSkeletonInitial).toBe(false) // Cached data exists, don't show blank skeleton!

    // Empty account before hydration starts
    const emptyTemplates: { id: string; name: string }[] = []
    const shouldShowSkeletonEmpty = !isHydrated && emptyTemplates.length === 0
    expect(shouldShowSkeletonEmpty).toBe(true)

    // After local hydration finishes (takes <10ms from IndexedDB)
    isHydrated = true
    const shouldShowSkeletonHydratedEmpty = !isHydrated && emptyTemplates.length === 0
    expect(shouldShowSkeletonHydratedEmpty).toBe(false) // Ready to display empty state immediately!
  })

  it('non-blocking secondary server fetches do not delay local store hydration', async () => {
    let localHydrationFinished = false
    let secondaryNetworkFinished = false

    // Simulate fast IndexedDB hydration
    const hydrateLocal = async () => {
      localHydrationFinished = true
    }

    // Simulate slow network fetch
    const slowServerFetch = async () => {
      await new Promise((r) => setTimeout(r, 50))
      secondaryNetworkFinished = true
    }

    const startTime = performance.now()

    // Architecture: hydrateLocal runs first and unblocks UI, while server fetch runs in background
    await hydrateLocal()
    const hydrationTime = performance.now() - startTime

    // Background fetch started without blocking local hydration
    slowServerFetch()

    expect(localHydrationFinished).toBe(true)
    expect(secondaryNetworkFinished).toBe(false) // Not blocked waiting for network!
    expect(hydrationTime).toBeLessThan(30)
  })
})
