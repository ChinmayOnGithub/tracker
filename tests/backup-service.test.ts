import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { BackupService } from '@/lib/database/local/BackupService';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';

const mockIndexedDB = {
  open: mock(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: {
        transaction: mock((stores: string[], _mode: string) => {
          const storeMocks: Record<string, { clear: unknown; put: unknown }> = {};
          for (const s of stores) {
            storeMocks[s] = {
              clear: mock(() => {}),
              put: mock((item: { id?: string } | null) => {
                if (item && item.id === 'trigger-failure-id') {
                  throw new Error('Database write error simulation.');
                }
              }),
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

describe('Backup & Restore Service Tests', () => {
  beforeEach(() => {
    const instance = IndexedDBEngine.getInstance() as any;
    instance.db = null;
    instance.dbPromise = null;
    global.window = {
      indexedDB: mockIndexedDB,
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    const instance = IndexedDBEngine.getInstance() as any;
    instance.db = null;
    instance.dbPromise = null;
    delete (global as unknown as { window?: unknown }).window;
  });

  describe('Backup Export', () => {
    it('should export database to a valid JSON string structure', async () => {
      const dbEngine = IndexedDBEngine.getInstance();
      dbEngine.getAll = mock(async (_: string) => [{ id: '1', name: 'Mock Template' }]) as unknown as <T>(storeName: string) => Promise<T[]>;

      const jsonStr = await BackupService.exportBackup();
      const payload = JSON.parse(jsonStr);

      expect(payload.appVersion).toBe('1.0.0');
      expect(payload.formatVersion).toBe(1);
      expect(payload.data).toBeTypeOf('object');
      expect(payload.data.activity_templates).toBeDefined();
      expect(payload.data.activity_templates[0].id).toBe('1');
    });
  });

  describe('Backup Validation', () => {
    it('should pass validation with a correctly formatted payload', () => {
      const validPayload = {
        appVersion: '1.0.0',
        formatVersion: 1,
        dbVersion: 1,
        timestamp: new Date().toISOString(),
        data: {
          activity_templates: [],
        },
      };

      const result = BackupService.validateBackup(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject backup if formatVersion is missing or too high', () => {
      const invalidVersion = {
        appVersion: '1.0.0',
        formatVersion: 99,
        dbVersion: 1,
        timestamp: new Date().toISOString(),
        data: {},
      };

      const result = BackupService.validateBackup(invalidVersion);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Incompatible backup format version');
    });

    it('should reject backups containing unknown stores', () => {
      const payload = {
        appVersion: '1.0.0',
        formatVersion: 1,
        dbVersion: 1,
        timestamp: new Date().toISOString(),
        data: {
          corrupt_unknown_store: [],
        },
      };

      const result = BackupService.validateBackup(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('unknown store name');
    });
  });

  describe('Transactional Restore Rollback', () => {
    it('should reject restore and abort transaction if writing record fails', async () => {
      const payload = {
        appVersion: '1.0.0',
        formatVersion: 1,
        dbVersion: 1,
        timestamp: new Date().toISOString(),
        data: {
          activity_templates: [
            { id: 'normal-1' },
            { id: 'trigger-failure-id' } // will throw in our db transaction mock
          ],
        },
      };

      let threwError = false;
      try {
        await BackupService.restoreBackup(payload);
      } catch (_err) {
        threwError = true;
      }
      expect(threwError).toBe(true);
    });
  });
});
