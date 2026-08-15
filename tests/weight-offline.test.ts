import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { WeightRepository } from '@/modules/weight/repository/WeightRepository';
import { WeightRecord } from '@/lib/store/store';

import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Weight Offline Domain Tests', () => {
  let dbMock: any = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
  });

  describe('WeightRepository', () => {
    it('should put atomic updates and queue weight CRUD operations', async () => {
      const weightRepo = new WeightRepository();
      const db = IndexedDBEngine.getInstance();
      db.putAtomic = mock(async () => {});
      db.get = mock(async () => null);

      const record: WeightRecord = {
        id: 'wt-1',
        userId: 'user-123',
        weight: 78.5,
        date: '2026-07-28',
        notes: 'Morning weight',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await weightRepo.save(record);
      expect(db.putAtomic).toHaveBeenCalled();
    });

    it('should rollback transaction on local write failure', async () => {
      const weightRepo = new WeightRepository();
      const db = IndexedDBEngine.getInstance();
      db.get = mock(async () => null);
      db.putAtomic = mock(async (_storeName: string, item: unknown) => {
        const wtItem = item as { id?: string };
        if (wtItem && wtItem.id === 'trigger-rollback-id') {
          throw new Error('Local Write Failed');
        }
      });

      const record: WeightRecord = {
        id: 'trigger-rollback-id',
        userId: 'user-123',
        weight: 80.0,
        date: '2026-07-28',
        notes: 'Should fail',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      let threw = false;
      try {
        await weightRepo.save(record);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });
});
