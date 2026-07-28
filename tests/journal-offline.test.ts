import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { JournalRepository } from '@/modules/journal/repository/JournalRepository';
import { JournalEntry } from '@/lib/store/store';

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

describe('Journal Offline Domain Tests', () => {
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

  describe('JournalRepository', () => {
    it('should put atomic updates and queue journal CRUD operations', async () => {
      const journalRepo = new JournalRepository();
      const db = IndexedDBEngine.getInstance();
      db.putAtomic = mock(async () => {});
      db.get = mock(async () => null);

      const entry: JournalEntry = {
        id: 'jr-1',
        journalDate: new Date('2026-07-28T12:00:00.000Z'),
        content: 'Felt highly productive today, got the offline modules refactored!',
        mood: '😃',
        gratitude: 'Grateful for good pair programming support',
        reflections: 'Refactored codebase',
        lessonsLearned: 'Planning makes execution seamless',
        tomorrowPlan: 'Proceed with Weight migration',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await journalRepo.save(entry);
      expect(db.putAtomic).toHaveBeenCalled();
    });

    it('should rollback transaction on local write failure', async () => {
      const journalRepo = new JournalRepository();
      const db = IndexedDBEngine.getInstance();
      db.get = mock(async () => null);
      db.putAtomic = mock(async (_storeName: string, item: unknown) => {
        const jrItem = item as { id?: string };
        if (jrItem && jrItem.id === 'trigger-rollback-id') {
          throw new Error('Local Write Failed');
        }
      });

      const entry: JournalEntry = {
        id: 'trigger-rollback-id',
        journalDate: new Date('2026-07-28T12:00:00.000Z'),
        content: 'Should fail',
        mood: null,
        gratitude: null,
        reflections: null,
        lessonsLearned: null,
        tomorrowPlan: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      let threw = false;
      try {
        await journalRepo.save(entry);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });
});
