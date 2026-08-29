
export class TaskOccurrenceService {
  /**
   * Cycles status according to the Tracker checklist cycling rules.
   * Daily: Cleared ➔ Done ➔ Canceled (skipped) ➔ Cleared.
   * Non-Daily: Cleared ➔ Done ➔ Canceled (skipped) ➔ Postponed ➔ Cleared.
   */
  public static cycleStatus(
    currentStatus: string | null | undefined,
    category: string | undefined,
    recurrenceType: string | undefined
  ): { nextStatus: string | null; nextCompleted: boolean } {
    const status = currentStatus ? currentStatus.toLowerCase() : 'cleared';
    const isDaily = recurrenceType === 'daily';
    const isFinance = category === 'finance';

    if (status === 'cleared' || status === 'pending') {
      return {
        nextStatus: isFinance ? 'paid' : 'done',
        nextCompleted: true
      };
    } else if (status === 'done' || status === 'paid' || status === 'completed') {
      return {
        nextStatus: 'skipped',
        nextCompleted: true
      };
    } else if (status === 'skipped') {
      if (isDaily) {
        return {
          nextStatus: null,
          nextCompleted: false
        };
      } else {
        return {
          nextStatus: 'postponed',
          nextCompleted: true
        };
      }
    } else if (status === 'postponed') {
      return {
        nextStatus: null,
        nextCompleted: false
      };
    }

    return {
      nextStatus: null,
      nextCompleted: false
    };
  }

  /**
   * Helper to add days to date key (YYYY-MM-DD format).
   */
  public static addDays(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Identifies whether an activity template represents an ephemeral/temporary task
   * (e.g. quick task created for Today) vs a persistent Activity definition/schedule.
   */
  public static isTemporaryTask(template: {
    id?: string;
    category?: string;
    type?: string;
    recurrenceType?: string;
    metadata?: unknown;
  }): boolean {
    const meta = typeof template.metadata === 'string'
      ? (() => { try { return JSON.parse(template.metadata as string) } catch { return {} } })()
      : (template.metadata || {}) as Record<string, unknown>;

    if (meta?.isQuickTask === true || meta?.temporary === true) return true;
    if (template.category === 'general' && template.type === 'TASK' && template.recurrenceType === 'one_time') return true;
    if (template.id && template.id.startsWith('temp-template-') && template.type === 'TASK') return true;
    return false;
  }
}
