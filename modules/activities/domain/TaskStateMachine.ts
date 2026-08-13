export type TaskOccurrenceState = 'pending' | 'done' | 'skipped' | 'postponed';

export class TaskStateMachine {
  private static transitions: Record<TaskOccurrenceState, TaskOccurrenceState[]> = {
    pending: ['done', 'skipped', 'postponed'],
    done: ['pending'],
    skipped: ['pending'],
    postponed: ['pending', 'done']
  };

  /**
   * Validates if a transition from one state to another is permitted.
   */
  public static isValidTransition(from: TaskOccurrenceState, to: TaskOccurrenceState): boolean {
    return this.transitions[from]?.includes(to) || false;
  }
}
