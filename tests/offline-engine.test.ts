import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { LastWriteWinsResolver } from '@/lib/sync/core/ConflictResolver';
import { SyncCoordinator } from '@/lib/sync/core/SyncCoordinator';

// Mock IndexedDB Factory for Node/Bun server testing environment
const mockIndexedDB = {
  open: mock(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onupgradeneeded: null as (() => void) | null,
      result: {
        transaction: mock(() => ({
          objectStore: mock(() => ({
            put: mock(() => ({ onsuccess: null, onerror: null })),
            get: mock(() => ({ onsuccess: null, onerror: null })),
            delete: mock(() => ({ onsuccess: null, onerror: null })),
            getAll: mock(() => ({ onsuccess: null, onerror: null })),
          })),
          abort: mock(() => {}),
        })),
        objectStoreNames: {
          contains: mock(() => true),
        },
      },
      transaction: {
        objectStore: mock(() => ({
          createIndex: mock(() => {}),
        })),
      },
      error: null,
    };
    // Trigger onsuccess asynchronously
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }),
};

describe('Offline Infrastructure & Core Engine Tests', () => {
  beforeEach(() => {
    // Setup client mocks
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

  describe('SyncCoordinator Connectivity', () => {
    it('should correctly report current online status', () => {
      const coordinator = SyncCoordinator.getInstance();
      expect(coordinator.isOnline()).toBe(true);
    });

    it('should subscribe and invoke callbacks', () => {
      const coordinator = SyncCoordinator.getInstance();
      let callCount = 0;
      let state = false;
      
      const unsubscribe = coordinator.subscribeConnectivity((isOnline) => {
        callCount++;
        state = isOnline;
      });

      expect(callCount).toBe(1);
      expect(state).toBe(true);
      
      unsubscribe();
    });
  });

  describe('ConflictResolver (Last Write Wins)', () => {
    const resolver = new LastWriteWinsResolver();

    it('should select the entity with the more recent updatedAt timestamp', async () => {
      const context = {
        entityId: '123',
        localEntity: { id: '123', name: 'Local', updatedAt: '2026-07-28T12:00:00.000Z' },
        remoteEntity: { id: '123', name: 'Remote', updatedAt: '2026-07-28T13:00:00.000Z' },
      };

      const resolved = await resolver.resolve(context);
      expect(resolved.name).toBe('Remote');
    });

    it('should fall back to local entity if timestamps are equal or missing', async () => {
      const context = {
        entityId: '123',
        localEntity: { id: '123', name: 'Local', updatedAt: null },
        remoteEntity: { id: '123', name: 'Remote', updatedAt: null },
      };

      const resolved = await resolver.resolve(context);
      expect(resolved.name).toBe('Local');
    });
  });

  describe('SyncCoordinator Queue', () => {
    it('should register handlers and dispatch enqueue calls', async () => {
      const engine = SyncCoordinator.getInstance();
      let handlerCalled = false;

      engine.registerHandler('test_module', async (op, payload) => {
        handlerCalled = true;
        expect(op).toBe('CREATE');
        expect((payload as { data?: string }).data).toBe('sample');
        return { success: true };
      });

      // Mock DB interactions for SyncCoordinator internal enqueue
      const db = IndexedDBEngine.getInstance();
      const mockQueue: unknown[] = [];
      db.put = mock(async (storeName: string, item: unknown) => {
        if (storeName === 'sync_queue') {
          mockQueue.push(item);
        }
      });
      db.getAll = mock(async <T>(storeName: string): Promise<T[]> => {
        if (storeName === 'sync_queue') {
          return mockQueue as unknown as T[];
        }
        return [] as unknown as T[];
      }) as unknown as <T>(storeName: string) => Promise<T[]>;
      db.delete = mock(async () => {});

      (engine as unknown as { isProcessing: boolean }).isProcessing = false;
      await engine.enqueue('test_module', 'CREATE', { data: 'sample' });
      
      // Allow async queue processing to run
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(handlerCalled).toBe(true);
    });
  });
});
