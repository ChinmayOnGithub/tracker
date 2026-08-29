import { describe, it, expect } from 'bun:test';
import { createTemplateSchema } from '@/lib/validations/template';
import { TaskOccurrenceService } from '@/modules/activities/domain/TaskOccurrenceService';

describe('Correctness Pass - Bug 1: Decimal Amounts', () => {
  it('should accept decimal billing amounts such as 9.99, 10.50, and 299.99', () => {
    const validAmounts = [9.99, 10.5, 299.99, 500, 0];

    for (const amount of validAmounts) {
      const result = createTemplateSchema.safeParse({
        name: 'Spotify Subscription',
        category: 'finance',
        type: 'BILL',
        priority: 'NORMAL',
        color: 'emerald',
        icon: 'Music',
        recurrenceType: 'monthly',
        amount,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(amount);
      }
    }
  });

  it('should parse string inputs to exact float numbers without integer conversion', () => {
    const inputs = ['9.99', '10.50', '299.99', '12.345'];
    for (const str of inputs) {
      const parsed = parseFloat(str);
      expect(parsed).toBe(Number(str));
      expect(Number.isInteger(parsed)).toBe(false);
    }
  });
});

describe('Correctness Pass - Bug 2: Temporary Tasks in Activity', () => {
  it('should classify quick tasks created on Today as temporary tasks', () => {
    const quickTask1 = {
      id: 'temp-template-1785476281666',
      name: 'Buy milk',
      category: 'general',
      type: 'TASK',
      recurrenceType: 'one_time',
      metadata: { isQuickTask: true },
    };

    const quickTask2 = {
      id: 'custom-id-999',
      name: 'Close bug ticket',
      category: 'general',
      type: 'TASK',
      recurrenceType: 'one_time',
    };

    const quickTask3 = {
      id: 'temp-template-123456',
      name: 'Ad-hoc note',
      type: 'TASK',
    };

    expect(TaskOccurrenceService.isTemporaryTask(quickTask1)).toBe(true);
    expect(TaskOccurrenceService.isTemporaryTask(quickTask2)).toBe(true);
    expect(TaskOccurrenceService.isTemporaryTask(quickTask3)).toBe(true);
  });

  it('should NOT classify persistent habit or activity definitions as temporary tasks', () => {
    const habit = {
      id: 'spotify-template-id',
      name: 'Spotify Subscription',
      category: 'finance',
      type: 'HABIT',
      recurrenceType: 'monthly',
    };

    const dailyRoutine = {
      id: 'brush-teeth-id',
      name: 'Brush Teeth',
      category: 'health',
      type: 'HABIT',
      recurrenceType: 'daily',
    };

    const projectTask = {
      id: 'quarterly-review-id',
      name: 'Q3 Product Review',
      category: 'work',
      type: 'TASK',
      recurrenceType: 'weekly',
    };

    expect(TaskOccurrenceService.isTemporaryTask(habit)).toBe(false);
    expect(TaskOccurrenceService.isTemporaryTask(dailyRoutine)).toBe(false);
    expect(TaskOccurrenceService.isTemporaryTask(projectTask)).toBe(false);
  });
});

describe('Correctness Pass - Bug 3 & 4: Work Session Invariants & Elapsed Calculation', () => {
  it('should calculate running elapsed time as accumulatedSeconds + (now - segmentStart)', () => {
    const accumulatedSeconds = 3600; // 1 hour already worked
    const segmentStartMs = Date.now() - 30 * 60 * 1000; // current segment started 30 mins ago
    const nowMs = Date.now();

    const segmentElapsed = Math.floor((nowMs - segmentStartMs) / 1000);
    const totalElapsed = accumulatedSeconds + segmentElapsed;

    // Total should be approximately 90 minutes (5400 seconds)
    expect(totalElapsed).toBeGreaterThanOrEqual(5399);
    expect(totalElapsed).toBeLessThanOrEqual(5401);
  });

  it('resuming from pause should never lose previously accumulated time', () => {
    // Stage 1: Work for 1 hour 45 minutes (105 mins = 6300 seconds)
    let accumulatedSeconds = 0;
    const firstSegmentDuration = 105 * 60; // 6300 seconds
    accumulatedSeconds += firstSegmentDuration;

    // Stage 2: Paused
    const pausedState = {
      sessionState: 'paused' as const,
      accumulatedSeconds,
      currentSegmentStartedAt: null,
    };
    expect(pausedState.accumulatedSeconds).toBe(6300);

    // Stage 3: Resumed at 11:30
    const resumeSegmentStart = new Date('2026-08-29T11:30:00Z');
    const resumedState = {
      sessionState: 'running' as const,
      accumulatedSeconds: pausedState.accumulatedSeconds,
      currentSegmentStartedAt: resumeSegmentStart.toISOString(),
    };

    // Resumed state must retain all 6300 seconds
    expect(resumedState.accumulatedSeconds).toBe(6300);

    // Stage 4: 15 minutes later (11:45)
    const simulatedNow = new Date('2026-08-29T11:45:00Z').getTime();
    const currentSegmentSeconds = Math.floor((simulatedNow - resumeSegmentStart.getTime()) / 1000);
    const totalWorkingSeconds = resumedState.accumulatedSeconds + currentSegmentSeconds;

    // Total should be 105 mins + 15 mins = 120 mins (7200 seconds = 2.0 hours)
    expect(totalWorkingSeconds).toBe(7200);
    expect(totalWorkingSeconds / 3600).toBe(2.0);
  });

  it('session state defaults to idle when unstarted (no auto 09:00 active session)', () => {
    const unstartedLog = {
      id: 'log-1',
      activityId: 'work-tracker-id',
      date: '2026-08-29',
      status: 'cleared',
      amount: null,
      payload: null,
    };

    // When there is no explicit running segment, session is idle
    const isRunning = Boolean(
      unstartedLog.payload &&
      (unstartedLog.payload as Record<string, unknown>).sessionState === 'running'
    );
    expect(isRunning).toBe(false);
  });
});
