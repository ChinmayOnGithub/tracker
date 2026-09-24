/**
 * In-flight request deduplicator for Tracker.
 * Coalesces concurrent identical async requests (e.g. Today mount, Prefetch, Calendar)
 * into a single shared Promise while enforcing user-scoped isolation (#57).
 */

class InFlightDeduplicator {
  private inFlight = new Map<string, Promise<unknown>>()

  /**
   * Helper to format a strictly user-scoped cache/dedupe key.
   */
  public static userKey(prefix: string, userId: string | null | undefined, suffix?: string): string {
    const userScope = userId || 'anonymous'
    return suffix ? `${prefix}:${userScope}:${suffix}` : `${prefix}:${userScope}`
  }

  /**
   * Execute an async function or join an existing in-flight request for the given key.
   * Guarantees rejection cleanup and eliminates unhandled leaks.
   */
  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key)
    if (existing) {
      return existing as Promise<T>
    }

    const promise = (async () => {
      try {
        return await fn()
      } finally {
        this.inFlight.delete(key)
      }
    })()

    this.inFlight.set(key, promise)
    return promise
  }

  /**
   * Check if an operation is currently in flight.
   */
  has(key: string): boolean {
    return this.inFlight.has(key)
  }

  /**
   * Clear in-flight requests belonging to a specific user (on logout or account switch).
   */
  clearUser(userId: string): void {
    if (!userId) return
    const keysToDelete: string[] = []
    for (const key of this.inFlight.keys()) {
      if (key.includes(`:${userId}`) || key.includes(`_${userId}`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(k => this.inFlight.delete(k))
  }

  /**
   * Clear all in-flight tracking (useful in test teardown or global session reset).
   */
  clear(): void {
    this.inFlight.clear()
  }
}

export const requestDeduplicator = new InFlightDeduplicator()

