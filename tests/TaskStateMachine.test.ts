import { describe, it, expect } from 'bun:test';
import { TaskStateMachine } from '@/modules/activities/domain/TaskStateMachine';
import { TaskOccurrenceService } from '@/modules/activities/domain/TaskOccurrenceService';

describe('TaskStateMachine', () => {
  it('should validate valid state transitions', () => {
    expect(TaskStateMachine.isValidTransition('pending', 'done')).toBe(true);
    expect(TaskStateMachine.isValidTransition('pending', 'skipped')).toBe(true);
    expect(TaskStateMachine.isValidTransition('pending', 'postponed')).toBe(true);
    expect(TaskStateMachine.isValidTransition('done', 'pending')).toBe(true);
    expect(TaskStateMachine.isValidTransition('done', 'skipped')).toBe(true);       // cycle: Done -> Canceled
    expect(TaskStateMachine.isValidTransition('skipped', 'pending')).toBe(true);
    expect(TaskStateMachine.isValidTransition('skipped', 'postponed')).toBe(true);  // cycle: Canceled -> Postponed
    expect(TaskStateMachine.isValidTransition('postponed', 'pending')).toBe(true);
    expect(TaskStateMachine.isValidTransition('postponed', 'done')).toBe(true);
  });

  it('should reject invalid state transitions', () => {
    expect(TaskStateMachine.isValidTransition('done', 'postponed')).toBe(false);   // direct skip not allowed
    expect(TaskStateMachine.isValidTransition('skipped', 'done')).toBe(false);
    expect(TaskStateMachine.isValidTransition('done', 'done')).toBe(false);
    expect(TaskStateMachine.isValidTransition('pending', 'pending')).toBe(false);
  });
});

describe('TaskOccurrenceService', () => {
  it('should cycle statuses correctly for daily tasks', () => {
    // Daily: Cleared -> Done -> Canceled (skipped) -> Cleared
    const step1 = TaskOccurrenceService.cycleStatus(null, 'health', 'daily');
    expect(step1.nextStatus).toBe('done');
    expect(step1.nextCompleted).toBe(true);

    const step2 = TaskOccurrenceService.cycleStatus('done', 'health', 'daily');
    expect(step2.nextStatus).toBe('skipped');
    expect(step2.nextCompleted).toBe(true);

    const step3 = TaskOccurrenceService.cycleStatus('skipped', 'health', 'daily');
    expect(step3.nextStatus).toBeNull();
    expect(step3.nextCompleted).toBe(false);
  });

  it('should cycle statuses correctly for non-daily tasks', () => {
    // Non-Daily: Cleared -> Done -> Canceled (skipped) -> Postponed -> Cleared
    const step1 = TaskOccurrenceService.cycleStatus(null, 'health', 'weekly');
    expect(step1.nextStatus).toBe('done');

    const step2 = TaskOccurrenceService.cycleStatus('done', 'health', 'weekly');
    expect(step2.nextStatus).toBe('skipped');

    const step3 = TaskOccurrenceService.cycleStatus('skipped', 'health', 'weekly');
    expect(step3.nextStatus).toBe('postponed');
    expect(step3.nextCompleted).toBe(true);

    const step4 = TaskOccurrenceService.cycleStatus('postponed', 'health', 'weekly');
    expect(step4.nextStatus).toBeNull();
    expect(step4.nextCompleted).toBe(false);
  });

  it('should handle finance categories', () => {
    const step1 = TaskOccurrenceService.cycleStatus(null, 'finance', 'daily');
    expect(step1.nextStatus).toBe('paid');
  });

  it('should calculate next day date correctly', () => {
    expect(TaskOccurrenceService.addDays('2026-08-14', 1)).toBe('2026-08-15');
    expect(TaskOccurrenceService.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
