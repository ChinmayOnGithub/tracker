import { logger } from './logger';

export class Telemetry {
  private static isBrowser = typeof window !== 'undefined' && typeof window.performance !== 'undefined';

  /**
   * Starts a named performance measurement.
   */
  public static start(name: string): void {
    if (!this.isBrowser) return;
    try {
      window.performance.mark(`${name}-start`);
    } catch (_e) {
      // Ignore performance measurement errors
    }
  }

  /**
   * Ends a named performance measurement and logs the duration.
   */
  public static end(name: string, context = 'Telemetry'): number {
    if (!this.isBrowser) return 0;
    try {
      const startMark = `${name}-start`;
      const endMark = `${name}-end`;
      window.performance.mark(endMark);
      window.performance.measure(name, startMark, endMark);
      
      const entries = window.performance.getEntriesByName(name, 'measure');
      if (entries.length > 0) {
        const duration = entries[entries.length - 1].duration;
        logger.debug(context, `${name} took ${duration.toFixed(2)}ms`);
        // Clean up
        window.performance.clearMarks(startMark);
        window.performance.clearMarks(endMark);
        window.performance.clearMeasures(name);
        return duration;
      }
    } catch (_e) {
      // Ignore performance measurement errors
    }
    return 0;
  }
}
