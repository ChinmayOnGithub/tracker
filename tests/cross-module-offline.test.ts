import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { SyncEngine } from '@/lib/database/sync/SyncEngine';
import { ActivityTemplateRepository } from '@/modules/activities/repository/ActivityRepository';
import { JournalRepository } from '@/modules/journal/repository/JournalRepository';
import { WeightRepository } from '@/modules/weight/repository/WeightRepository';
import { LeaveRepository } from '@/modules/leave/repository/LeaveRepository';

import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Cross-Module Integration & Hardening Tests', () => {
  let dbMock: ReturnType<typeof setupMockIndexedDB> | null = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
  });

  it('should support atomic enqueues across multiple domain repositories', async () => {
    const db = IndexedDBEngine.getInstance();
    const putAtomicSpy = mock(async () => {});
    db.putAtomic = putAtomicSpy;
    db.get = mock(async () => null);

    const templateRepo = new ActivityTemplateRepository();
    const journalRepo = new JournalRepository();
    const weightRepo = new WeightRepository();
    const leaveRepo = new LeaveRepository();

    // 1. Log Activity
    await templateRepo.save({
      id: 'tpl-1',
      name: 'Workout',
      category: 'personal',
      icon: 'Activity',
      color: 'red',
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as import('@/types').ActivityTemplate);

    // 2. Log Journal Entry
    await journalRepo.save({
      id: 'jr-1',
      journalDate: '2026-07-28',
      content: 'Productive work day!',
      mood: '😊',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 3. Log Weight
    await weightRepo.save({
      id: 'wt-1',
      userId: 'user-123',
      weight: 75.2,
      date: '2026-07-28',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 4. Log Leave Record
    await leaveRepo.save({
      id: 'lv-1',
      userId: 'user-123',
      leaveType: 'CASUAL',
      startDate: '2026-07-28',
      endDate: '2026-07-28',
      totalDays: 1,
      status: 'APPROVED',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    expect(putAtomicSpy).toHaveBeenCalledTimes(4);
  });

  it('should sequentially process mixed-domain items in the sync queue', async () => {
    const engine = SyncEngine.getInstance();
    const db = IndexedDBEngine.getInstance();
    const mockQueue: unknown[] = [];
    let handlersTriggered = 0;

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

    engine.registerHandler('activity_templates', async () => {
      handlersTriggered++;
      return { success: true };
    });
    engine.registerHandler('journal_entries', async () => {
      handlersTriggered++;
      return { success: true };
    });
    engine.registerHandler('weight_records', async () => {
      handlersTriggered++;
      return { success: true };
    });
    engine.registerHandler('leave_records', async () => {
      handlersTriggered++;
      return { success: true };
    });

    (engine as unknown as { isProcessing: boolean }).isProcessing = false;

    await engine.enqueue('activity_templates', 'CREATE', { id: 'tpl-1' });
    await engine.enqueue('journal_entries', 'CREATE', { id: 'jr-1' });
    await engine.enqueue('weight_records', 'CREATE', { id: 'wt-1' });
    await engine.enqueue('leave_records', 'CREATE', { id: 'lv-1' });

    // Allow async queue processing to run
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(handlersTriggered).toBe(4);
  });
});
