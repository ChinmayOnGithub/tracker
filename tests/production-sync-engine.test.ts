import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { ProductionSyncEngine } from '@/lib/sync/core/ProductionSyncEngine'
import type {
  StorageProvider,
  NetworkAdapter,
  SyncOperation,
  SyncResult,
  SyncBatch,
  SyncMetadata,
  NetworkStatus,
  ConnectionQuality
} from '@/lib/sync/types'

class MockMemoryStorageProvider implements StorageProvider {
  private data = new Map<string, unknown>()
  private metadata = new Map<string, SyncMetadata>()
  private opQueue: SyncOperation[] = []

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T) ?? null
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
    this.metadata.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key)
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return keys.map((k) => (this.data.get(k) as T) ?? null)
  }

  async setMany<T>(entries: Array<{ key: string; value: T }>): Promise<void> {
    for (const e of entries) {
      this.data.set(e.key, e.value)
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const k of keys) {
      this.data.delete(k)
      this.metadata.delete(k)
    }
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key)
  }

  async clear(): Promise<void> {
    this.data.clear()
    this.metadata.clear()
    this.opQueue = []
  }

  async list<T>(prefix?: string): Promise<Array<{ key: string; value: T }>> {
    const results: Array<{ key: string; value: T }> = []
    for (const [k, v] of this.data.entries()) {
      if (!prefix || k.startsWith(prefix)) {
        results.push({ key: k, value: v as T })
      }
    }
    return results
  }

  async count(prefix?: string): Promise<number> {
    let cnt = 0
    for (const k of this.data.keys()) {
      if (!prefix || k.startsWith(prefix)) cnt++
    }
    return cnt
  }

  async getMetadata(key: string): Promise<SyncMetadata | null> {
    return this.metadata.get(key) ?? null
  }

  async setMetadata(key: string, meta: SyncMetadata): Promise<void> {
    this.metadata.set(key, meta)
  }

  async listMetadata(prefix?: string): Promise<SyncMetadata[]> {
    const results: SyncMetadata[] = []
    for (const [k, v] of this.metadata.entries()) {
      if (!prefix || k.startsWith(prefix)) {
        results.push(v)
      }
    }
    return results
  }

  async transaction<T>(fn: (tx: { get: <U>(k: string) => Promise<U | null>; set: <U>(k: string, v: U) => Promise<void>; delete: (k: string) => Promise<void>; commit: () => Promise<void>; rollback: () => Promise<void> }) => Promise<T>): Promise<T> {
    return fn({
      get: async <U>(k: string) => (this.data.get(k) as U) ?? null,
      set: async (k, v) => { this.data.set(k, v) },
      delete: async (k) => { this.data.delete(k); this.metadata.delete(k) },
      commit: async () => {},
      rollback: async () => {}
    })
  }

  async enqueueOperation(operation: SyncOperation): Promise<void> {
    this.opQueue.push(operation)
  }

  async dequeueOperations(batchSize: number): Promise<SyncOperation[]> {
    return this.opQueue.splice(0, batchSize)
  }

  async peekOperations(batchSize: number): Promise<SyncOperation[]> {
    return this.opQueue.slice(0, batchSize)
  }

  async acknowledgeOperations(_operationIds: string[]): Promise<void> {}

  async isHealthy(): Promise<boolean> {
    return true
  }

  async getStats() {
    return {
      totalKeys: this.data.size,
      totalSize: 1024,
      operationQueue: this.opQueue.length,
      metadata: this.metadata.size,
      lastCleanup: Date.now()
    }
  }

  async cleanup(): Promise<number> {
    return 0
  }
}

class MockTestNetworkAdapter implements NetworkAdapter {
  public pushedBatches: SyncBatch[] = []
  public remoteOpsToPull: SyncOperation[] = []

  async push<T>(batch: SyncBatch<T>): Promise<SyncResult<T>[]> {
    this.pushedBatches.push(batch as unknown as SyncBatch)
    return batch.operations.map((op) => ({
      operation: op,
      success: true,
      resolvedData: op.data,
      timing: {
        queuedAt: op.createdAt,
        startedAt: Date.now(),
        completedAt: Date.now(),
        duration: 1
      }
    }))
  }

  async pull(_entityType: string, _lastSyncTime: number, _limit?: number): Promise<SyncOperation[]> {
    return this.remoteOpsToPull
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isConnected(): Promise<boolean> { return true }
  async getNetworkStatus(): Promise<NetworkStatus> { return 'online' }
  async ping(): Promise<number> { return 10 }
  async getConnectionQuality(): Promise<ConnectionQuality> {
    return { latency: 10, bandwidth: 1000000, reliability: 1, lastTested: Date.now() }
  }
}

describe('Issue #136: ProductionSyncEngine Unimplemented Paths & Reliability', () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    ) as unknown as typeof fetch
  })

  it('processes pending operations in batch and marks storage as synced', async () => {
    const storage = new MockMemoryStorageProvider()
    const network = new MockTestNetworkAdapter()

    const engine = new ProductionSyncEngine({
      storageProvider: storage,
      networkAdapter: network,
      enableOptimisticUpdates: true,
      enableConflictResolution: true,
    })

    // Force network check to resolve online
    const netMgr = (engine as unknown as { networkManager: { forceCheck: () => Promise<void> } }).networkManager
    await netMgr.forceCheck()

    engine.registerEntity({
      entityType: 'activityTemplate',
      priority: 'normal'
    })

    // 1. Perform optimistic update
    await engine.optimisticUpdate(
      'activityTemplate',
      'tpl_sync_1',
      { name: 'Morning Exercise', category: 'health', version: 1 },
      'create'
    )

    // Check local storage has data and pending status
    const local = await engine.getEntity<{ name: string }>('activityTemplate', 'tpl_sync_1')
    expect(local.data?.name).toBe('Morning Exercise')
    expect(local.metadata?.syncStatus).toBe('pending')

    // 2. Trigger sync: executes processPendingOperations through network adapter
    await engine.syncEntity('activityTemplate')

    // Verify network adapter received the batch
    expect(network.pushedBatches.length).toBe(1)
    expect(network.pushedBatches[0].operations.length).toBe(1)
    expect(network.pushedBatches[0].operations[0].entityId).toBe('tpl_sync_1')

    // Verify storage metadata was updated to synced
    const syncedMeta = await storage.getMetadata('activityTemplate:tpl_sync_1')
    expect(syncedMeta?.syncStatus).toBe('synced')

    await engine.stop()
  })

  it('pulls remote changes and handles remote updates and conflict resolution', async () => {
    const storage = new MockMemoryStorageProvider()
    const network = new MockTestNetworkAdapter()

    // Setup a remote operation to be pulled
    network.remoteOpsToPull = [
      {
        id: 'remote_op_1',
        type: 'create',
        entityType: 'activityTemplate',
        entityId: 'tpl_remote_1',
        data: { name: 'Evening Meditation', category: 'mindfulness', version: 1 },
        metadata: {
          id: 'tpl_remote_1',
          entityType: 'activityTemplate',
          entityId: 'tpl_remote_1',
          lastModified: Date.now(),
          version: 1,
          syncStatus: 'synced',
          retryCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        createdAt: Date.now(),
        priority: 'normal'
      }
    ]

    const engine = new ProductionSyncEngine({
      storageProvider: storage,
      networkAdapter: network,
      enableOptimisticUpdates: true,
      enableConflictResolution: true,
    })

    const netMgr = (engine as unknown as { networkManager: { forceCheck: () => Promise<void> } }).networkManager
    await netMgr.forceCheck()

    engine.registerEntity({
      entityType: 'activityTemplate',
      priority: 'normal'
    })

    // Sync pulls remote changes
    await engine.syncEntity('activityTemplate')

    const pulled = await engine.getEntity<{ name: string }>('activityTemplate', 'tpl_remote_1')
    expect(pulled.data?.name).toBe('Evening Meditation')
    expect(pulled.metadata?.syncStatus).toBe('synced')

    await engine.stop()
  })

  it('rolls back optimistic update cleanly on failure', async () => {
    const storage = new MockMemoryStorageProvider()
    const network = new MockTestNetworkAdapter()

    const engine = new ProductionSyncEngine({
      storageProvider: storage,
      networkAdapter: network,
      enableOptimisticUpdates: true,
    })

    // Seed pending metadata
    await storage.set('activityTemplate:failed_tpl', { name: 'Failed Tpl' })
    await storage.setMetadata('activityTemplate:failed_tpl', {
      id: 'failed_tpl',
      entityType: 'activityTemplate',
      entityId: 'failed_tpl',
      lastModified: Date.now(),
      version: 1,
      syncStatus: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Call private rollback via any / internal test invocation
    const privateEngine = engine as unknown as { rollbackOptimisticUpdate: (t: string, id: string) => Promise<void> }
    await privateEngine.rollbackOptimisticUpdate('activityTemplate', 'failed_tpl')

    const deleted = await storage.get('activityTemplate:failed_tpl')
    expect(deleted).toBeNull()

    await engine.stop()
  })
})
