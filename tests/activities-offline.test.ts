import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { ActivityTemplateRepository, ActivityLogRepository } from '@/modules/activities/repository/ActivityRepository';
import { ActivityTemplate, ActivityLog } from '@/types';

const mockIndexedDB = {
  open: mock(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: {
        transaction: mock((stores: string[], _mode: string) => {
          const storeMocks: Record<string, { put: unknown; get: unknown; delete: unknown }> = {};
          for (const s of stores) {
            storeMocks[s] = {
              put: mock((item: { id?: string } | null) => {
                if (item && item.id === 'trigger-rollback-id') {
                  throw new Error('Database transaction abort test.');
                }
              }),
              get: mock(() => ({ onsuccess: null })),
              delete: mock(() => {}),
            };
          }
          return {
            objectStore: mock((name: string) => storeMocks[name]),
            abort: mock(() => {}),
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            onabort: null as (() => void) | null,
          };
        }),
      },
    };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
};

describe('Activities & Templates Offline Domain Tests', () => {
  beforeEach(() => {
    global.window = {
      indexedDB: mockIndexedDB,
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {}),
      navigator: {
        onLine: true,
      },
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    delete (global as unknown as { window?: unknown }).window;
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
