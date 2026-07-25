// lib/store/write-queue.ts

export interface QueueItem {
  id: string;
  dedupKey: string;
  run: () => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  rollback: () => void;
  retries: number;
}

class WriteQueue {
  private queue: QueueItem[] = [];
  private activeItem: QueueItem | null = null;
  private isProcessing = false;
  private onQueueChangeCallbacks: Set<() => void> = new Set();

  public subscribe(callback: () => void) {
    this.onQueueChangeCallbacks.add(callback);
    return () => this.onQueueChangeCallbacks.delete(callback);
  }

  private notify() {
    this.onQueueChangeCallbacks.forEach(cb => cb());
  }

  public getStatus(): 'idle' | 'saving' | 'error' {
    if (this.activeItem) return 'saving';
    if (this.queue.length > 0) return 'saving';
    return 'idle';
  }

  public getQueueLength() {
    return this.queue.length;
  }

  public add(item: Omit<QueueItem, 'retries'>) {
    const queueItem: QueueItem = { ...item, retries: 0 };

    // Deduplicate: If an item with the same dedupKey is in the queue, remove the older one.
    // If it is currently running, we let it run, but the new one will run right after.
    const existingIndex = this.queue.findIndex(q => q.dedupKey === queueItem.dedupKey);
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }

    this.queue.push(queueItem);
    this.notify();
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.activeItem = this.queue.shift() || null;
    this.notify();

    if (!this.activeItem) {
      this.isProcessing = false;
      return;
    }

    const item = this.activeItem;
    let success = false;

    try {
      const res = await item.run();
      if (res.success) {
        success = true;
      } else {
        console.error(`Queue item ${item.id} returned failure:`, res.error);
      }
    } catch (err) {
      console.error(`Queue item ${item.id} threw error:`, err);
    }

    if (success) {
      this.activeItem = null;
      this.isProcessing = false;
      this.notify();
      this.processNext();
    } else {
      // Retry logic
      if (item.retries < 3) {
        item.retries++;
        const backoffMs = Math.pow(2, item.retries) * 1000;
        console.warn(`Retrying queue item ${item.id} in ${backoffMs}ms (Attempt ${item.retries}/3)`);
        
        // Put it back at the front of the queue to retry after backoff
        setTimeout(() => {
          this.queue.unshift(item);
          this.isProcessing = false;
          this.processNext();
        }, backoffMs);
      } else {
        // Exceeded retries - rollback
        console.error(`Queue item ${item.id} exceeded max retries. Rolling back.`);
        try {
          item.rollback();
        } catch (rollbackErr) {
          console.error(`Failed to rollback queue item ${item.id}:`, rollbackErr);
        }
        this.activeItem = null;
        this.isProcessing = false;
        this.notify();
        this.processNext();
      }
    }
  }
}

export const writeQueue = new WriteQueue();
