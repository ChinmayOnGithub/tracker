import { IRepository, ILocalRepository, IRemoteRepository } from './IRepository';
import { IndexedDBEngine } from '../local/IndexedDBEngine';
import { SyncEngine } from '../sync/SyncEngine';

export class BaseLocalRepository<T extends { id: string; deletedAt?: Date | string | null }> implements ILocalRepository<T> {
  protected engine = IndexedDBEngine.getInstance();
  constructor(protected storeName: string) {}

  public async getById(id: string): Promise<T | null> {
    return this.engine.get<T>(this.storeName, id);
  }

  public async getAll(): Promise<T[]> {
    const all = await this.engine.getAll<T>(this.storeName);
    return all.filter(item => !item.deletedAt);
  }

  public async save(entity: T): Promise<void> {
    await this.engine.put(this.storeName, entity);
  }

  public async saveAtomic(entity: T, queueItem: unknown): Promise<void> {
    await this.engine.putAtomic(this.storeName, entity, queueItem);
  }

  public async delete(id: string): Promise<void> {
    const item = await this.getById(id);
    if (item) {
      item.deletedAt = new Date();
      await this.save(item);
    }
  }

  public async deleteAtomic(id: string, queueItem: unknown): Promise<void> {
    const item = await this.getById(id);
    if (item) {
      item.deletedAt = new Date();
      await this.engine.putAtomic(this.storeName, item, queueItem);
    }
  }
}

export abstract class BaseRemoteRepository<T> implements IRemoteRepository<T> {
  public abstract create(entity: T): Promise<unknown>;
  public abstract update(id: string, entity: Partial<T>): Promise<unknown>;
  public abstract delete(id: string): Promise<unknown>;
}

export class BaseRepository<T extends { id: string }> implements IRepository<T> {
  constructor(
    protected local: ILocalRepository<T>,
    protected moduleName: string
  ) {}

  public async getById(id: string): Promise<T | null> {
    return this.local.getById(id);
  }

  public async getAll(): Promise<T[]> {
    return this.local.getAll();
  }

  public async save(entity: T): Promise<void> {
    const existing = await this.getById(entity.id);
    const op = existing ? 'UPDATE' : 'CREATE';

    // Check if a pending/failed item for this entity already exists in the queue.
    // If so, update its payload in-place to avoid duplicate server writes on reconnect.
    const engine = IndexedDBEngine.getInstance();
    let existingQueueItem: any = null;

    try {
      const queuedItems = await engine.queryIndex<{
        id: string;
        module: string;
        operationType: string;
        payload: unknown;
        entityId: string;
        syncStatus: string;
        createdAt: string;
        retryCount: number;
        lastAttempt: string | null;
      }>('sync_queue', 'module_entityId', [this.moduleName, entity.id]);

      existingQueueItem = queuedItems.find(
        (q) => q.syncStatus === 'PENDING' || q.syncStatus === 'FAILED'
      ) || null;
    } catch (err) {
      console.warn('[BaseRepository] Failed to query index module_entityId:', err);
    }

    if (existingQueueItem) {
      // Update the existing queue entry with the latest payload
      existingQueueItem.payload = entity;
      existingQueueItem.operationType = op;
      await this.local.saveAtomic(entity, existingQueueItem);
      SyncEngine.getInstance().triggerSync();
      return;
    }

    const queueItemId = crypto.randomUUID();
    const queueItem = {
      id: queueItemId,
      module: this.moduleName,
      operationType: op,
      payload: entity,
      entityId: entity.id,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastAttempt: null,
      syncStatus: 'PENDING',
    };

    await this.local.saveAtomic(entity, queueItem);
    SyncEngine.getInstance().triggerSync();
  }

  public async delete(id: string): Promise<void> {
    const queueItemId = crypto.randomUUID();
    const queueItem = {
      id: queueItemId,
      module: this.moduleName,
      operationType: 'DELETE',
      payload: { id },
      entityId: id,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastAttempt: null,
      syncStatus: 'PENDING',
    };

    await this.local.deleteAtomic(id, queueItem);
    SyncEngine.getInstance().triggerSync();
  }
}
