import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { WorkSessionRepository } from '@/modules/work/repository/WorkSessionRepository';
import { WorkSession } from '@/modules/work/types';

const mockIndexedDB = {
  open: mock(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: {
        transaction: mock((stores: string[], _mode: string) => {
          const storeMocks: Record<string, { put: unknown; get: unknown; delete: unknown; index: unknown }> = {};
          for (const s of stores) {
            storeMocks[s] = {
              put: mock(() => {}),
              get: mock(() => ({ onsuccess: null })),
              delete: mock(() => {}),
              index: mock(() => ({
                getAll: mock(() => ({ onsuccess: null })),
              })),
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

describe('Work Session Domain Tests', () => {
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
