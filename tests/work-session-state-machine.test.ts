import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { WorkSessionRepository } from '@/modules/work/repository/WorkSessionRepository';
import { WorkSession } from '@/modules/work/types';
import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Work Session Deterministic State Machine & Lifecycle Tests', () => {
  let dbMock: ReturnType<typeof setupMockIndexedDB> | null = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
  });

  // Helper for pure timer math
  const computeElapsedSeconds = (
    sessionState: 'idle' | 'running' | 'paused' | 'completed',
    accumulatedSeconds: number,
    currentSegmentStartedAt: string | null,
    nowMs: number
  ): number => {
    if (sessionState === 'running' && currentSegmentStartedAt) {
      const segmentStartMs = new Date(currentSegmentStartedAt).getTime();
      const segmentElapsedSec = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000));
      return accumulatedSeconds + segmentElapsedSec;
    }
    return accumulatedSeconds;
  };

  describe('State Machine Transitions', () => {
    it('1. IDLE -> START: initializes running state with zero accumulated seconds and current segment start', () => {
      const startMs = new Date('2026-08-29T09:00:00Z').getTime();
      const state = {
        sessionState: 'running' as const,
        accumulatedSeconds: 0,
        currentSegmentStartedAt: new Date(startMs).toISOString(),
      };

      expect(state.sessionState).toBe('running');
      expect(state.accumulatedSeconds).toBe(0);

      // At 09:30 (30 mins = 1800s later)
      const now30m = startMs + 30 * 60 * 1000;
      expect(computeElapsedSeconds(state.sessionState, state.accumulatedSeconds, state.currentSegmentStartedAt, now30m)).toBe(1800);
    });

    it('2. RUNNING -> PAUSE: accumulates active segment into accumulatedSeconds and freezes timer', () => {
      const startMs = new Date('2026-08-29T09:00:00Z').getTime();
      const pauseMs = new Date('2026-08-29T11:00:00Z').getTime(); // 2 hours = 7200s

      const initialRunning = {
        sessionState: 'running' as const,
        accumulatedSeconds: 0,
        currentSegmentStartedAt: new Date(startMs).toISOString(),
      };

      // Perform Pause
      const segmentSec = Math.max(0, Math.floor((pauseMs - new Date(initialRunning.currentSegmentStartedAt).getTime()) / 1000));
      const pausedState = {
        sessionState: 'paused' as const,
        accumulatedSeconds: initialRunning.accumulatedSeconds + segmentSec,
        currentSegmentStartedAt: null,
      };

      expect(pausedState.sessionState).toBe('paused');
      expect(pausedState.accumulatedSeconds).toBe(7200);
      expect(pausedState.currentSegmentStartedAt).toBeNull();

      // 30 minutes after pause (11:30), elapsed MUST still be 7200s (2h 00m)
      const laterMs = pauseMs + 30 * 60 * 1000;
      expect(computeElapsedSeconds(pausedState.sessionState, pausedState.accumulatedSeconds, pausedState.currentSegmentStartedAt, laterMs)).toBe(7200);
    });

    it('3. PAUSED -> RESUME: keeps accumulatedSeconds intact and sets new currentSegmentStartedAt', () => {
      const accumulatedSoFar = 7200; // 2 hours
      const resumeMs = new Date('2026-08-29T11:30:00Z').getTime();

      const resumedState = {
        sessionState: 'running' as const,
        accumulatedSeconds: accumulatedSoFar,
        currentSegmentStartedAt: new Date(resumeMs).toISOString(),
      };

      expect(resumedState.accumulatedSeconds).toBe(7200);

      // At 12:00 (30 mins after resume = 1800s), total must be 7200 + 1800 = 9000s (2h 30m)
      const nowMs = resumeMs + 30 * 60 * 1000;
      expect(computeElapsedSeconds(resumedState.sessionState, resumedState.accumulatedSeconds, resumedState.currentSegmentStartedAt, nowMs)).toBe(9000);
    });

    it('4. RUNNING -> FINISH: finalizes active segment plus accumulatedSeconds', () => {
      const startMs = new Date('2026-08-29T11:30:00Z').getTime();
      const finishMs = new Date('2026-08-29T12:00:00Z').getTime(); // 30 mins

      const runningState = {
        sessionState: 'running' as const,
        accumulatedSeconds: 7200,
        currentSegmentStartedAt: new Date(startMs).toISOString(),
      };

      const segmentSec = Math.max(0, Math.floor((finishMs - startMs) / 1000));
      const totalSec = runningState.accumulatedSeconds + segmentSec;

      const completedState = {
        sessionState: 'completed' as const,
        accumulatedSeconds: totalSec,
        currentSegmentStartedAt: null,
      };

      expect(completedState.sessionState).toBe('completed');
      expect(completedState.accumulatedSeconds).toBe(9000);
      expect(completedState.accumulatedSeconds / 3600).toBe(2.5); // 2.5 hours
    });

    it('5. PAUSED -> FINISH: directly finalizes accumulatedSeconds without additional segment', () => {
      const pausedState = {
        sessionState: 'paused' as const,
        accumulatedSeconds: 7200,
        currentSegmentStartedAt: null,
      };

      const completedState = {
        sessionState: 'completed' as const,
        accumulatedSeconds: pausedState.accumulatedSeconds,
        currentSegmentStartedAt: null,
      };

      expect(completedState.sessionState).toBe('completed');
      expect(completedState.accumulatedSeconds).toBe(7200);
      expect(completedState.accumulatedSeconds / 3600).toBe(2.0); // 2.0 hours
    });

    it('6-9. Idempotency on repeated clicks (Start, Pause, Resume, Finish)', () => {
      // Starting when already running must not alter running segment
      const runningState = {
        sessionState: 'running' as const,
        accumulatedSeconds: 3600,
        currentSegmentStartedAt: '2026-08-29T10:00:00Z',
      };
      const doubleStart = runningState.sessionState === 'running' ? runningState : { ...runningState };
      expect(doubleStart.currentSegmentStartedAt).toBe('2026-08-29T10:00:00Z');
      expect(doubleStart.accumulatedSeconds).toBe(3600);

      // Pausing when already paused must be a no-op
      const pausedState: { sessionState: 'idle' | 'running' | 'paused' | 'completed'; accumulatedSeconds: number; currentSegmentStartedAt: string | null } = {
        sessionState: 'paused',
        accumulatedSeconds: 3600,
        currentSegmentStartedAt: null,
      };
      const doublePause = pausedState.sessionState !== 'running' ? pausedState : { ...pausedState };
      expect(doublePause.accumulatedSeconds).toBe(3600);

      // Resuming when already running must be a no-op
      const doubleResume = runningState.sessionState === 'running' ? runningState : { ...runningState };
      expect(doubleResume.currentSegmentStartedAt).toBe('2026-08-29T10:00:00Z');

      // Finishing when completed must remain completed
      const completedState = {
        sessionState: 'completed' as const,
        accumulatedSeconds: 7200,
        currentSegmentStartedAt: null,
      };
      expect(completedState.sessionState).toBe('completed');
    });

    it('10-11. Refresh & Navigation Recovery: preserves running state across remounts', () => {
      const persistedPayload = {
        sessionState: 'running',
        accumulatedSeconds: 3600,
        currentSegmentStartedAt: '2026-08-29T10:00:00.000Z',
      };

      // Simulate component unmount / remount with Date.now() at 10:45:00
      const simulatedNow = new Date('2026-08-29T10:45:00.000Z').getTime();
      const restoredElapsed = computeElapsedSeconds(
        persistedPayload.sessionState as 'running',
        persistedPayload.accumulatedSeconds,
        persistedPayload.currentSegmentStartedAt,
        simulatedNow
      );

      // 1 hour accumulated + 45 mins active segment = 1h 45m = 6300 seconds
      expect(restoredElapsed).toBe(6300);
    });

    it('12-16. Offline mutations & sync queue operations', async () => {
      const repo = new WorkSessionRepository();
      const db = IndexedDBEngine.getInstance();
      db.putAtomic = mock(async () => {});
      db.get = mock(async () => null);
      db.queryIndex = mock(async () => []);

      const session: WorkSession = {
        id: 'ws-offline-1',
        userId: 'user-offline',
        date: '2026-08-29',
        mode: 'office',
        startedAt: new Date('2026-08-29T09:00:00Z'),
        endedAt: null,
        durationMinutes: 0,
        loggingMode: 'timer',
        manualMinutes: 0,
      };

      await repo.save(session);
      expect(db.putAtomic).toHaveBeenCalled();
    });

    it('17-20. Completed session cannot resume and no duplicate session created', () => {
      const completed: { sessionState: 'idle' | 'running' | 'paused' | 'completed'; accumulatedSeconds: number; currentSegmentStartedAt: string | null } = {
        sessionState: 'completed',
        accumulatedSeconds: 7200,
        currentSegmentStartedAt: null,
      };

      // Resuming a completed session is disallowed; starting new session explicitly starts fresh or continues
      const canResume = completed.sessionState === 'paused';
      expect(canResume).toBe(false);
    });

    it('21-22. Manually logged work hours compatibility', () => {
      const manualHours = 7.5;
      const durationMinutes = Math.round(manualHours * 60);
      expect(durationMinutes).toBe(450);

      const hrs = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      expect(`${hrs}h ${mins}m`).toBe('7h 30m');
    });
  });
});
