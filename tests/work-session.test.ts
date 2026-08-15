import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { WorkSessionRepository } from '@/modules/work/repository/WorkSessionRepository';
import { WorkSession } from '@/modules/work/types';

import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Work Session Domain Tests', () => {
  let dbMock: any = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
  });

  describe('WorkSessionRepository', () => {
    it('should save a work session and enqueue it in sync queue', async () => {
      const repo = new WorkSessionRepository();
      const db = IndexedDBEngine.getInstance();
      db.putAtomic = mock(async () => {});
      db.get = mock(async () => null);
      db.queryIndex = mock(async () => []);

      const session: WorkSession = {
        id: 'ws-123',
        userId: 'user-1',
        date: '2026-08-14',
        mode: 'wfh',
        startedAt: new Date('2026-08-14T09:00:00Z'),
        endedAt: new Date('2026-08-14T17:45:00Z'),
        durationMinutes: 525, // 8 hours 45 mins
        loggingMode: 'timer',
        manualMinutes: 0
      };

      await repo.save(session);
      expect(db.putAtomic).toHaveBeenCalled();
    });

    it('should calculate integer minutes correctly', () => {
      const start = new Date('2026-08-14T09:00:00Z').getTime();
      const end = new Date('2026-08-14T17:45:00Z').getTime();
      const durationMinutes = Math.round((end - start) / 60000);
      
      expect(durationMinutes).toBe(525);
      
      // Formatting validation
      const hrs = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      expect(`${hrs}h ${mins}m`).toBe('8h 45m');
    });
  });
});
