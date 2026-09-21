/**
 * Lightweight performance instrumentation utility for measuring critical path milestones.
 * Uses browser Performance API (window.performance) when available, safe in all environments.
 */
class PerformanceTracker {
  private marks: Map<string, number> = new Map()

  mark(name: string): void {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    this.marks.set(name, now)
    if (typeof performance !== 'undefined' && performance.mark) {
      try {
        performance.mark(name)
      } catch (_) {
        // Ignore duplicate marks
      }
    }
  }

  measure(name: string, startMark: string, endMark?: string): number | null {
    const start = this.marks.get(startMark)
    const end = endMark ? this.marks.get(endMark) : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
    if (start === undefined || end === undefined) return null

    const duration = end - start
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure(name, startMark, endMark)
      } catch (_) {}
    }
    return duration
  }

  getMark(name: string): number | undefined {
    return this.marks.get(name)
  }

  clear(): void {
    this.marks.clear()
    if (typeof performance !== 'undefined' && performance.clearMarks) {
      try {
        performance.clearMarks()
        performance.clearMeasures()
      } catch (_) {}
    }
  }
}

export const perfTracker = new PerformanceTracker()
