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

describe('Journal Domain Query Tests', () => {
  beforeEach(() => {
    global.window = {
      indexedDB: mockIndexedDB,
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {}),
      navigator: {
        onLine: true,
      },
    } as unknown as Window & typeof globalThis;
    global.IDBKeyRange = {
      bound: mock((lower, upper) => ({ lower, upper }))
    } as unknown as typeof IDBKeyRange;
  });

  afterEach(() => {
    delete (global as unknown as { window?: unknown }).window;
    delete (global as unknown as { IDBKeyRange?: unknown }).IDBKeyRange;
  });

  describe('JournalRepository', () => {
    it('should query journal entry by date correctly using IndexedDB index range', async () => {
      const repo = new JournalRepository();
      const db = IndexedDBEngine.getInstance();
      
      const mockEntries: any[] = [
        {
          id: 'j-1',
          userId: 'user-1',
          journalDate: '2026-08-14T12:00:00.000Z',
          content: 'Today was an amazing coding day!',
          mood: 'happy',
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      db.queryIndex = mock(async () => mockEntries);

      const result = await repo.getJournalByDate('user-1', '2026-08-14');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('j-1');
      expect(result?.content).toContain('coding');
    });

    it('should query journal entry range correctly', async () => {
      const repo = new JournalRepository();
      const db = IndexedDBEngine.getInstance();
      
      const mockEntries: any[] = [
        {
          id: 'j-1',
          userId: 'user-1',
          journalDate: '2026-08-14T12:00:00.000Z',
          content: 'First entry',
          mood: null,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'j-2',
          userId: 'user-1',
          journalDate: '2026-08-15T12:00:00.000Z',
          content: 'Second entry',
          mood: null,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      db.queryIndex = mock(async () => mockEntries);

      const result = await repo.getJournalRange('user-1', '2026-08-14', '2026-08-15');
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('j-1');
      expect(result[1].id).toBe('j-2');
    });
  });
});
