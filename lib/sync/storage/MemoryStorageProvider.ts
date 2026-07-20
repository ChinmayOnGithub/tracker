/**
 * Production Memory Storage Provider
 * Thread-safe, transactional in-memory storage with persistence simulation
 */

import { StorageProvider, SyncMetadata, SyncOperation, StorageOptions, ListOptions, StorageTransaction, StorageStats } from '../types'

interface MemoryEntry<T = unknown> {
  value: T
  metadata: {
    createdAt: number
    updatedAt: number
    ttl?: number
    size: number
  }
}

class MemoryTransaction implements StorageTransaction {
  private operations: Array<{ type: 'set' | 'delete'; key: string; value?: unknown }> = []
  private committed = false
  private rolledBack = false

  constructor(private provider: MemoryStorageProvider) {}

  async get<T>(key: string): Promise<T | null> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction is already finalized')
    }
    
    // Check pending operations first
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i]
      if (op.key === key) {
        return op.type === 'delete' ? null : (op.value as T)
      }
    }
    
    return this.provider.get<T>(key)
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction is already finalized')
    }
    
    this.operations.push({ type: 'set', key, value })
  }

  async delete(key: string): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction is already finalized')
    }
    
    this.operations.push({ type: 'delete', key })
  }

  async commit(): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction is already finalized')
    }
    
    // Apply all operations atomically
    for (const op of this.operations) {
      if (op.type === 'set') {
        await this.provider.set(op.key, op.value!)
      } else {
        await this.provider.delete(op.key)
      }
    }
    
    this.committed = true
  }

  async rollback(): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction is already finalized')
    }
    
    this.operations.length = 0
    this.rolledBack = true
  }
}

export class MemoryStorageProvider implements StorageProvider {
  private storage = new Map<string, MemoryEntry>()
  private metadata = new Map<string, SyncMetadata>()
  private operationQueue: SyncOperation[] = []
  private locks = new Map<string, Promise<void>>()
  private stats = {
    totalOperations: 0,
    totalBytes: 0,
    lastCleanup: Date.now()
  }

  // Basic CRUD operations with error handling
  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.storage.get(key)
      if (!entry) return null
      
      // Check TTL
      if (entry.metadata.ttl && Date.now() > entry.metadata.ttl) {
        await this.delete(key)
        return null
      }
      
      return entry.value as T
    } catch (error) {
      throw new Error(`Failed to get key ${key}: ${error}`)
    }
  }

  async set<T>(key: string, value: T, options?: StorageOptions): Promise<void> {
    try {
      // Wait for any existing locks
      await this.waitForLock(key)
      
      const releaseLock = await this.acquireLock(key)
      
      try {
        const now = Date.now()
        const serialized = JSON.stringify(value)
        const size = new Blob([serialized]).size
        
        const entry: MemoryEntry<T> = {
          value,
          metadata: {
            createdAt: this.storage.has(key) ? this.storage.get(key)!.metadata.createdAt : now,
            updatedAt: now,
            ttl: options?.ttl ? now + options.ttl : undefined,
            size
          }
        }
        
        const oldEntry = this.storage.get(key)
        this.storage.set(key, entry)
        
        // Update stats
        this.stats.totalOperations++
        if (oldEntry) {
          this.stats.totalBytes += (size - oldEntry.metadata.size)
        } else {
          this.stats.totalBytes += size
        }
      } finally {
        releaseLock()
      }
    } catch (error) {
      throw new Error(`Failed to set key ${key}: ${error}`)
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.waitForLock(key)
      const releaseLock = await this.acquireLock(key)
      
      try {
        const entry = this.storage.get(key)
        if (entry) {
          this.storage.delete(key)
          this.metadata.delete(key)
          this.stats.totalBytes -= entry.metadata.size
          this.stats.totalOperations++
        }
      } finally {
        releaseLock()
      }
    } catch (error) {
      throw new Error(`Failed to delete key ${key}: ${error}`)
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key)
    return value !== null
  }

  // Batch operations with atomicity
  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)))
  }

  async setMany<T>(entries: Array<{ key: string; value: T }>, _options?: StorageOptions): Promise<void> {
    // Use transaction for atomicity
    await this.transaction(async (tx) => {
      for (const { key, value } of entries) {
        await tx.set(key, value)
      }
    })
  }

  async deleteMany(keys: string[]): Promise<void> {
    // Use transaction for atomicity
    await this.transaction(async (tx) => {
      for (const key of keys) {
        await tx.delete(key)
      }
    })
  }

  // Query operations with pagination and sorting
  async list<T>(prefix?: string, options: ListOptions = {}): Promise<Array<{ key: string; value: T }>> {
    const {
      limit = 100,
      offset = 0,
      sortBy = 'key',
      sortOrder = 'asc'
    } = options

    const entries = Array.from(this.storage.entries())
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([key, entry]) => ({ key, value: entry.value as T, ...entry.metadata }))

    // Sort
    entries.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let aVal: any, bVal: any
      switch (sortBy) {
        case 'created':
          aVal = a.createdAt
          bVal = b.createdAt
          break
        case 'modified':
          aVal = a.updatedAt
          bVal = b.updatedAt
          break
        default:
          aVal = a.key
          bVal = b.key
      }
      
      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === 'desc' ? -result : result
    })

    // Paginate
    return entries
      .slice(offset, offset + limit)
      .map(({ key, value }) => ({ key, value }))
  }

  async count(prefix?: string): Promise<number> {
    if (!prefix) return this.storage.size
    
    let count = 0
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) count++
    }
    return count
  }

  // Transaction support for atomicity
  async transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T> {
    const tx = new MemoryTransaction(this)
    try {
      const result = await fn(tx)
      await tx.commit()
      return result
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }

  // Metadata operations with versioning
  async getMetadata(key: string): Promise<SyncMetadata | null> {
    return this.metadata.get(key) || null
  }

  async setMetadata(key: string, metadata: SyncMetadata): Promise<void> {
    this.metadata.set(key, { ...metadata, updatedAt: Date.now() })
  }

  async listMetadata(prefix?: string): Promise<SyncMetadata[]> {
    const result: SyncMetadata[] = []
    for (const [key, metadata] of this.metadata.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        result.push(metadata)
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // Queue persistence for operation durability
  async enqueueOperation(operation: SyncOperation): Promise<void> {
    // Check for duplicates based on clientRequestId
    if (operation.clientRequestId) {
      const existing = this.operationQueue.find(op => op.clientRequestId === operation.clientRequestId)
      if (existing) {
        throw new Error(`Duplicate operation: ${operation.clientRequestId}`)
      }
    }
    
    // Insert based on priority
    const priority = this.getPriorityValue(operation.priority)
    let insertIndex = this.operationQueue.length
    
    for (let i = 0; i < this.operationQueue.length; i++) {
      if (this.getPriorityValue(this.operationQueue[i].priority) < priority) {
        insertIndex = i
        break
      }
    }
    
    this.operationQueue.splice(insertIndex, 0, operation)
  }

  async dequeueOperations(batchSize: number): Promise<SyncOperation[]> {
    const operations = this.operationQueue.splice(0, Math.min(batchSize, this.operationQueue.length))
    return operations
  }

  async peekOperations(batchSize: number): Promise<SyncOperation[]> {
    return this.operationQueue.slice(0, Math.min(batchSize, this.operationQueue.length))
  }

  async acknowledgeOperations(operationIds: string[]): Promise<void> {
    this.operationQueue = this.operationQueue.filter(op => !operationIds.includes(op.id))
  }

  // Cleanup and maintenance
  async cleanup(olderThan: number): Promise<number> {
    let deletedCount = 0
    
    // Clean up expired entries
    for (const [key, entry] of this.storage.entries()) {
      if (entry.metadata.ttl && Date.now() > entry.metadata.ttl) {
        await this.delete(key)
        deletedCount++
      } else if (entry.metadata.updatedAt < olderThan) {
        await this.delete(key)
        deletedCount++
      }
    }
    
    // Clean up old metadata
    for (const [key, metadata] of this.metadata.entries()) {
      if (metadata.updatedAt < olderThan && !this.storage.has(key)) {
        this.metadata.delete(key)
        deletedCount++
      }
    }
    
    this.stats.lastCleanup = Date.now()
    return deletedCount
  }

  async clear(): Promise<void> {
    this.storage.clear()
    this.metadata.clear()
    this.operationQueue.length = 0
    this.stats.totalBytes = 0
    this.stats.totalOperations = 0
  }

  // Health and diagnostics
  async getStats(): Promise<StorageStats> {
    return {
      totalKeys: this.storage.size,
      totalSize: this.stats.totalBytes,
      operationQueue: this.operationQueue.length,
      metadata: this.metadata.size,
      lastCleanup: this.stats.lastCleanup
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Basic health checks
      const testKey = '__health_check__'
      await this.set(testKey, 'test')
      const value = await this.get(testKey)
      await this.delete(testKey)
      
      return value === 'test'
    } catch {
      return false
    }
  }

  // Private helper methods
  private getPriorityValue(priority: string): number {
    const priorities = { 'realtime': 5, 'urgent': 4, 'high': 3, 'normal': 2, 'low': 1 }
    return priorities[priority as keyof typeof priorities] || 2
  }

  /**
   * Acquire lock using Promise-based coordination
   * Fixed: Proper async lock mechanism instead of Set-based
   */
  private async acquireLock(key: string): Promise<() => void> {
    // Wait for existing lock
    while (this.locks.has(key)) {
      await this.locks.get(key)
    }
    
    // Create new lock
    let releaseFn: () => void
    const lockPromise = new Promise<void>(resolve => {
      releaseFn = resolve
    })
    
    this.locks.set(key, lockPromise)
    
    // Return release function
    return () => {
      this.locks.delete(key)
      releaseFn!()
    }
  }

  /**
   * Wait for existing lock to be released
   */
  private async waitForLock(key: string): Promise<void> {
    const existing = this.locks.get(key)
    if (existing) {
      await existing
    }
  }

  // Additional methods for debugging and introspection
  size(): number {
    return this.storage.size
  }

  keys(): string[] {
    return Array.from(this.storage.keys())
  }

  getQueueSize(): number {
    return this.operationQueue.length
  }

  dump(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of this.storage.entries()) {
      result[key] = entry.value
    }
    return result
  }
}