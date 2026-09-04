import { DailyCodingProblem } from '../types'
import { LeetCodeProvider } from '../providers/LeetCodeProvider'
import { GFGProvider } from '../providers/GFGProvider'
import { todayYMD } from '@/lib/dateUtils'

interface CachedItem {
  problem: DailyCodingProblem
  cachedAt: number
  dateStr: string
}

export class CodingProblemService {
  private static leetcodeProvider = new LeetCodeProvider()
  private static gfgProvider = new GFGProvider()

  // In-memory cache keyed by platform:date
  private static cache = new Map<string, CachedItem>()
  // In-flight promise map to deduplicate simultaneous requests
  private static inFlight = new Map<string, Promise<DailyCodingProblem | null>>()

  // 1 hour TTL for same-day caching
  private static readonly TTL_MS = 60 * 60 * 1000

  static async getDailyProblem(
    platform: 'leetcode' | 'gfg',
    dateParam?: string
  ): Promise<DailyCodingProblem | null> {
    const today = dateParam || todayYMD()
    const cacheKey = `${platform}:${today}`

    // Check memory cache
    const existing = this.cache.get(cacheKey)
    if (existing && Date.now() - existing.cachedAt < this.TTL_MS) {
      return existing.problem
    }

    // Deduplicate concurrent requests
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)!
    }

    const fetchPromise = (async () => {
      try {
        const provider =
          platform === 'leetcode'
            ? this.leetcodeProvider
            : this.gfgProvider

        const problem = await provider.getDailyProblem(today)
        if (problem) {
          this.cache.set(cacheKey, {
            problem,
            cachedAt: Date.now(),
            dateStr: today,
          })
          return problem
        }

        // Return stale cache if available upon upstream failure
        if (existing) {
          return existing.problem
        }

        return null
      } finally {
        this.inFlight.delete(cacheKey)
      }
    })()

    this.inFlight.set(cacheKey, fetchPromise)
    return fetchPromise
  }
}
