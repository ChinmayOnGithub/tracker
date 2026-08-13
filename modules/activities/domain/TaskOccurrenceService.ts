import { TaskOccurrenceState } from './TaskStateMachine';

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
}
