/**
 * In-flight request deduplicator for Tracker.
 * Coalesces concurrent identical async requests (e.g. Today mount, Prefetch, Calendar)
 * into a single shared Promise.
 */

class InFlightDeduplicator {
  private inFlight = new Map<string, Promise<unknown>>()

  /**
   * Execute an async function or join an existing in-flight request for the given key.
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
   * Clear all in-flight tracking (useful in test teardown).
   */
  clear(): void {
    this.inFlight.clear()
  }
}

export const requestDeduplicator = new InFlightDeduplicator()
