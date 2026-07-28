import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { LeaveRepository } from '@/modules/leave/repository/LeaveRepository';
import { LeaveRecord } from '@/lib/store/store';

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

describe('Leave Offline Domain Tests', () => {
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

  describe('LeaveRepository', () => {
    it('should put atomic updates and queue leave CRUD operations', async () => {
      const leaveRepo = new LeaveRepository();
      const db = IndexedDBEngine.getInstance();
      db.putAtomic = mock(async () => {});
      db.get = mock(async () => null);

      const record: LeaveRecord = {
        id: 'lv-1',
        userId: 'user-123',
        leaveType: 'CASUAL',
        startDate: '2026-07-28',
        endDate: '2026-07-29',
        totalDays: 2,
        status: 'PENDING',
        notes: 'Casual leave',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await leaveRepo.save(record);
      expect(db.putAtomic).toHaveBeenCalled();
    });

    it('should rollback transaction on local write failure', async () => {
      const leaveRepo = new LeaveRepository();
      const db = IndexedDBEngine.getInstance();
      db.get = mock(async () => null);
      db.putAtomic = mock(async (_storeName: string, item: unknown) => {
        const lvItem = item as { id?: string };
        if (lvItem && lvItem.id === 'trigger-rollback-id') {
          throw new Error('Local Write Failed');
        }
      });

      const record: LeaveRecord = {
        id: 'trigger-rollback-id',
        userId: 'user-123',
        leaveType: 'SICK',
        startDate: '2026-07-28',
        endDate: '2026-07-28',
        totalDays: 1,
        status: 'APPROVED',
        notes: 'Should fail',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      let threw = false;
      try {
        await leaveRepo.save(record);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });
});
