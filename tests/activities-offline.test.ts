import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { ActivityTemplateRepository, ActivityLogRepository } from '@/modules/activities/repository/ActivityRepository';
import { ActivityTemplate, ActivityLog } from '@/types';

import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Activities & Templates Offline Domain Tests', () => {
  let dbMock: any = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
  });

  describe('ActivityTemplateRepository', () => {
    it('should put atomic updates and queue template CRUD operations', async () => {
      const templateRepo = new ActivityTemplateRepository();
      const db = IndexedDBEngine.getInstance();
      db.putAtomic = mock(async () => {});
      db.get = mock(async () => null);
      db.getAll = mock(async () => []) as unknown as <T>(storeName: string) => Promise<T[]>;

      const template: ActivityTemplate = {
        id: 'tpl-1',
        name: 'Daily Meditation',
        category: 'health',
        type: 'TASK',
        priority: 'NORMAL',
        estimatedDuration: 15,
        energyRequired: 'NORMAL',
        calendarProvider: 'NONE',
        calendarEventId: null,
        notificationRules: null,
        icon: 'heart',
        color: 'blue',
        isActive: true,
        notes: '',
        amount: null,
        sortOrder: 0,
        recurrenceType: 'daily',
        recurrenceInterval: null,
        recurrenceDaysOfWeek: null,
        recurrenceDayOfMonth: null,
        recurrenceMonth: null,
        targetDate: null,
        remindBeforeDays: null,
        metadata: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        effectiveFrom: new Date()
      };

      await templateRepo.save(template);
      expect(db.putAtomic).toHaveBeenCalled();
    });
  });

  describe('ActivityLogRepository', () => {
    it('should record local task completions and atomic rollback on failure', async () => {
      const logRepo = new ActivityLogRepository();
      const db = IndexedDBEngine.getInstance();
      db.get = mock(async () => null);
      db.getAll = mock(async () => []) as unknown as <T>(storeName: string) => Promise<T[]>;
      db.putAtomic = mock(async (_store: string, item: unknown) => {
        const logItem = item as { id?: string };
        if (logItem && logItem.id === 'trigger-rollback-id') {
          throw new Error('Local Write Failed');
        }
      });

      const log: ActivityLog = {
        id: 'log-1',
        activityId: 'tpl-1',
        date: '2026-07-28',
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await logRepo.save(log);
      expect(db.putAtomic).toHaveBeenCalled();

      // Expect rollback to fail transaction
      let threw = false;
      try {
        await logRepo.save({ ...log, id: 'trigger-rollback-id' });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });
});
