import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { LeaveRepository } from '@/modules/leave/repository/LeaveRepository';
import { LeaveRecord } from '@/lib/store/store';

import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Leave Offline Domain Tests', () => {
  let dbMock: any = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
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
