import { IndexedDBEngine } from '../local/IndexedDBEngine';
import { ConnectivityMonitor } from './ConnectivityMonitor';

export interface SyncQueueItem {
  id: string;
  module: string;
  operationType: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: unknown;
  entityId: string;
  createdAt: string;
  retryCount: number;
  lastAttempt: string | null;
  syncStatus: 'PENDING' | 'PROCESSING' | 'FAILED' | 'RESOLVED' | 'BLOCKED';
}

export type SyncHandler = (
  operationType: 'CREATE' | 'UPDATE' | 'DELETE',
  payload: unknown
) => Promise<{ success: boolean; error?: string; data?: unknown }>;

export class SyncEngine {
  private static instance: SyncEngine | null = null;
  private dbEngine: IndexedDBEngine;
  private connMonitor: ConnectivityMonitor;
  private handlers: Map<string, SyncHandler> = new Map();
  private isProcessing = false;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.dbEngine = IndexedDBEngine.getInstance();
    this.connMonitor = ConnectivityMonitor.getInstance();
    
    // Subscribe to connectivity changes.
    // Delay the initial sync to the next tick so the DB has time to open
    // before processQueue() is invoked (avoids unhandled rejection on cold start).
    this.connMonitor.subscribe((isOnline) => {
      if (isOnline) {
        setTimeout(() => this.triggerSync(), 0);
      } else {
        this.stopBackoffTimer();
      }
    });

    // Register sync handler for activity templates
    this.registerHandler('activity_templates', async (op, payload) => {
      const { RemoteActivityTemplateRepository } = await import('@/modules/activities/repository/RemoteActivityRepository');
      const remote = new RemoteActivityTemplateRepository();
      
      const p = payload as Record<string, unknown>;
      try {
        if (op === 'CREATE') {
          const res = await remote.create(p as unknown as Parameters<typeof remote.create>[0]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else if (op === 'UPDATE') {
          if (p['reorderIds']) {
            await remote.reorder(p['reorderIds'] as string[]);
            return { success: true };
          }
          const res = await remote.update(p['id'] as string, p as unknown as Parameters<typeof remote.update>[1]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else {
          await remote.delete(p['id'] as string);
          return { success: true };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Remote template sync failed.' };
      }
    });

    // Register sync handler for activity logs
    this.registerHandler('activity_logs', async (op, payload) => {
      const { RemoteActivityLogRepository } = await import('@/modules/activities/repository/RemoteActivityRepository');
      const remote = new RemoteActivityLogRepository();
      
      const p = payload as Record<string, unknown>;
      try {
        if (op === 'CREATE') {
          const res = await remote.create(p as unknown as Parameters<typeof remote.create>[0]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else if (op === 'UPDATE') {
          const res = await remote.update(p['id'] as string, p as unknown as Parameters<typeof remote.update>[1]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else {
          await remote.delete(p['id'] as string);
          return { success: true };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Remote log sync failed.' };
      }
    });

    // Register sync handler for journal entries
    this.registerHandler('journal_entries', async (op, payload) => {
      const { RemoteJournalRepository } = await import('@/modules/journal/repository/RemoteJournalRepository');
      const remote = new RemoteJournalRepository();
      
      const p = payload as Record<string, unknown>;
      try {
        if (op === 'CREATE') {
          const res = await remote.create(p as unknown as Parameters<typeof remote.create>[0]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else if (op === 'UPDATE') {
          const res = await remote.update(p['id'] as string, p as unknown as Parameters<typeof remote.update>[1]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else {
          await remote.delete(p['id'] as string);
          return { success: true };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Remote journal sync failed.' };
      }
    });

    // Register sync handler for weight records
    this.registerHandler('weight_records', async (op, payload) => {
      const { RemoteWeightRepository } = await import('@/modules/weight/repository/RemoteWeightRepository');
      const remote = new RemoteWeightRepository();
      const record = payload as { id: string; weight: number; notes?: string | null; date: string };
      
      try {
        if (op === 'CREATE') {
          const res = await remote.create(record as unknown as Parameters<typeof remote.create>[0]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else if (op === 'UPDATE') {
          const res = await remote.update(record.id, record as unknown as Parameters<typeof remote.update>[1]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else {
          await remote.delete(record.id);
          return { success: true };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Remote weight sync failed.' };
      }
    });

    // Register sync handler for leave records
    this.registerHandler('leave_records', async (op, payload) => {
      const { RemoteLeaveRepository } = await import('@/modules/leave/repository/RemoteLeaveRepository');
      const remote = new RemoteLeaveRepository();
      const record = payload as { id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; status: string; notes?: string | null };
      
      try {
        if (op === 'CREATE') {
          const res = await remote.create(record as unknown as Parameters<typeof remote.create>[0]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else if (op === 'UPDATE') {
          const res = await remote.update(record.id, record as unknown as Parameters<typeof remote.update>[1]);
          return res as { success: boolean; error?: string; data?: unknown };
        } else {
          await remote.delete(record.id);
          return { success: true };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Remote leave sync failed.' };
      }
    });

    // Register sync handler for work sessions
    this.registerHandler('work_sessions', async (op, payload) => {
      const { RemoteWorkSessionRepository } = await import('@/modules/work/repository/RemoteWorkSessionRepository');
      const remote = new RemoteWorkSessionRepository();
      const session = payload as any;
      
      try {
        if (op === 'CREATE') {
          const res = await remote.create(session);
          return res as { success: boolean; error?: string; data?: unknown };
        } else if (op === 'UPDATE') {
          const res = await remote.update(session.id, session);
          return res as { success: boolean; error?: string; data?: unknown };
        } else {
          await remote.delete(session.id);
          return { success: true };
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Remote work session sync failed.' };
      }
    });
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  /**
   * Registers a server-sync dispatcher callback for a domain module.
   */
  public registerHandler(moduleName: string, handler: SyncHandler) {
    this.handlers.set(moduleName, handler);
    console.log(`[SyncEngine] Registered handler for module: ${moduleName}`);
  }

  /**
   * Enqueues an operation to the sync queue in IndexedDB.
   */
  public async enqueue(moduleName: string, operationType: 'CREATE' | 'UPDATE' | 'DELETE', payload: unknown): Promise<void> {
    const entityId = (payload as { id?: string })?.id || '';
    const item: SyncQueueItem = {
      id: crypto.randomUUID(),
      module: moduleName,
      operationType,
      payload,
      entityId,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastAttempt: null,
      syncStatus: 'PENDING',
    };

    await this.dbEngine.put('sync_queue', item);
    this.triggerSync();
  }

  /**
   * Wakes up the queue processor if offline transitions to online.
   */
  public triggerSync() {
    if (this.isProcessing || !this.connMonitor.isOnline()) return;
    this.processQueue().catch((err) => console.error('[SyncEngine] Queue processing failed:', err));
  }

  private stopBackoffTimer() {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  /**
   * Process all pending items sequentially.
   */
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.stopBackoffTimer();

    try {
      while (this.connMonitor.isOnline()) {
        const queue: SyncQueueItem[] = await this.dbEngine.getAll<SyncQueueItem>('sync_queue');
        
        // Find next eligible item (PENDING or FAILED with elapsed backoff)
        const pendingItems = queue
          .filter(item => item.syncStatus === 'PENDING' || item.syncStatus === 'FAILED')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        if (pendingItems.length === 0) break;

        const nextItem = pendingItems[0];
        
        // Apply backoff check if previously failed
        if (nextItem.syncStatus === 'FAILED' && nextItem.lastAttempt) {
          const elapsedMs = Date.now() - new Date(nextItem.lastAttempt).getTime();
          const backoffDelay = this.calculateBackoff(nextItem.retryCount);
          if (elapsedMs < backoffDelay) {
            // Schedule wake up once backoff expires
            const remaining = backoffDelay - elapsedMs;
            this.scheduleBackoffTimer(remaining);
            break;
          }
        }

        const success = await this.syncItem(nextItem);
        if (!success) {
          // If a blocking item fails, we pause processing the rest to maintain order
          const backoffDelay = this.calculateBackoff(nextItem.retryCount + 1);
          this.scheduleBackoffTimer(backoffDelay);
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private scheduleBackoffTimer(delayMs: number) {
    this.stopBackoffTimer();
    this.backoffTimer = setTimeout(() => {
      this.triggerSync();
    }, delayMs);
  }

  private calculateBackoff(retryCount: number): number {
    // Exponential backoff: 2^retryCount * 1000ms + random jitter, cap at 5 minutes
    const base = Math.pow(2, Math.min(retryCount, 8)) * 1000;
    const jitter = Math.random() * 1000;
    return Math.min(base + jitter, 5 * 60 * 1000);
  }

  /**
   * Sends a single queue item to the registered server handler.
   */
  private async syncItem(item: SyncQueueItem): Promise<boolean> {
    const handler = this.handlers.get(item.module);
    if (!handler) {
      console.warn(`[SyncEngine] No handler registered for module "${item.module}". Marking as blocked.`);
      item.syncStatus = 'BLOCKED';
      await this.dbEngine.put('sync_queue', item);
      return true; // proceed past this block
    }

    item.syncStatus = 'PROCESSING';
    item.lastAttempt = new Date().toISOString();
    await this.dbEngine.put('sync_queue', item);

    try {
      const res = await handler(item.operationType, item.payload);
      // Safely check success — handlers may return void, unknown, or { success }
      const result = res as { success?: boolean; error?: string } | null | undefined;
      if (result?.success !== false) {
        // resolved: delete from local queue
        await this.dbEngine.delete('sync_queue', item.id);
        return true;
      } else {
        console.error(`[SyncEngine] Server rejected queue item ${item.id}:`, result.error);
        return await this.handleItemFailure(item);
      }
    } catch (err) {
      console.error(`[SyncEngine] Exception during sync of item ${item.id}:`, err);
      return await this.handleItemFailure(item);
    }
  }

  private async handleItemFailure(item: SyncQueueItem): Promise<boolean> {
    item.retryCount += 1;
    if (item.retryCount >= 10) {
      item.syncStatus = 'BLOCKED';
      console.error(`[SyncEngine] Item ${item.id} exceeded maximum retries. Blocked.`);
    } else {
      item.syncStatus = 'FAILED';
    }
    await this.dbEngine.put('sync_queue', item);
    return false;
  }
}
