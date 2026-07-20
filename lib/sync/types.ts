/**
 * Sync Engine Core Types
 * Production-grade synchronization types and interfaces
 */

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflicted' | 'cancelled'
export type ConflictResolution = 'local' | 'remote' | 'merge' | 'manual'
export type NetworkStatus = 'online' | 'offline' | 'limited' | 'flapping'
export type OperationPriority = 'low' | 'normal' | 'high' | 'urgent' | 'realtime'
export type ErrorCategory = 'network' | 'conflict' | 'validation' | 'authorization' | 'rate_limit' | 'internal' | 'unknown'

// Base sync metadata with enhanced tracking
export interface SyncMetadata {
  id: string
  entityType: string
  entityId: string
  lastModified: number // Unix timestamp
  version: number
  syncStatus: SyncStatus
  lastSyncAttempt?: number
  retryCount: number
  nextRetryAt?: number
  conflictData?: unknown
  checksum?: string // Data integrity verification
  createdAt: number
  updatedAt: number
}

// Enhanced sync operation with transaction support and idempotency
export interface SyncOperation<T = unknown> {
  id: string // Deterministic ID for idempotency (entityType:entityId:version)
  type: 'create' | 'update' | 'delete'
  entityType: string
  entityId: string
  data: T
  metadata: SyncMetadata
  createdAt: number
  priority: OperationPriority
  
  // Transaction support
  transactionId?: string
  dependsOn?: string[] // Operation IDs this depends on
  
  // Idempotency and deduplication
  clientRequestId?: string // Client-generated UUID for duplicate detection
  expectedVersion?: number // Optimistic concurrency control
  
  // Retry configuration
  maxRetries?: number
  retryStrategy?: 'exponential' | 'linear' | 'fixed'
  
  // Cancellation support
  cancellationToken?: AbortSignal
  timeoutMs?: number
  
  // Additional context
  userId?: string
  source?: string // Which component/service initiated this
  tags?: string[] // For filtering and metrics
}

// Enhanced operation result with detailed error information
export interface SyncResult<T = unknown> {
  operation: SyncOperation<T>
  success: boolean
  error?: SyncError
  conflictResolution?: ConflictResolution
  resolvedData?: T
  serverVersion?: number
  timing: {
    queuedAt: number
    startedAt: number
    completedAt: number
    duration: number
  }
}

// Comprehensive error classification
export interface SyncError {
  category: ErrorCategory
  code: string
  message: string
  retryable: boolean
  retryAfter?: number // Server-suggested retry delay in ms
  context?: Record<string, unknown>
  cause?: Error
}

// Transaction support for atomic operations
export interface SyncTransaction {
  id: string
  operations: SyncOperation[]
  status: 'pending' | 'committed' | 'aborted'
  createdAt: number
  expiresAt: number
}

// Batch operation for efficiency
export interface SyncBatch<T = unknown> {
  id: string
  operations: SyncOperation<T>[]
  priority: OperationPriority
  createdAt: number
  maxSize: number
  timeoutMs: number
}

// Conflict resolution context
export interface ConflictContext<T = unknown> {
  localData: T
  remoteData: T
  localMetadata: SyncMetadata
  remoteMetadata: SyncMetadata
  entityType: string
  entityId: string
}

// Enhanced storage provider with transaction and persistence guarantees
export interface StorageProvider {
  // Basic CRUD operations with consistency guarantees
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: StorageOptions): Promise<void>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>

  // Batch operations with atomicity
  getMany<T>(keys: string[]): Promise<(T | null)[]>
  setMany<T>(entries: Array<{ key: string; value: T }>, options?: StorageOptions): Promise<void>
  deleteMany(keys: string[]): Promise<void>

  // Query operations with pagination
  list<T>(prefix?: string, options?: ListOptions): Promise<Array<{ key: string; value: T }>>
  count(prefix?: string): Promise<number>
  
  // Transaction support for atomicity
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>
  
  // Metadata operations with versioning
  getMetadata(key: string): Promise<SyncMetadata | null>
  setMetadata(key: string, metadata: SyncMetadata): Promise<void>
  listMetadata(prefix?: string): Promise<SyncMetadata[]>
  
  // Queue persistence for operation durability
  enqueueOperation(operation: SyncOperation): Promise<void>
  dequeueOperations(batchSize: number): Promise<SyncOperation[]>
  peekOperations(batchSize: number): Promise<SyncOperation[]>
  acknowledgeOperations(operationIds: string[]): Promise<void>
  
  // Cleanup and maintenance
  cleanup(olderThan: number): Promise<number> // Returns count of cleaned items
  clear(): Promise<void>
  
  // Health and diagnostics
  getStats(): Promise<StorageStats>
  isHealthy(): Promise<boolean>
}

export interface StorageOptions {
  ttl?: number // Time to live in milliseconds
  compress?: boolean
  encrypt?: boolean
}

export interface ListOptions {
  limit?: number
  offset?: number
  sortBy?: 'key' | 'created' | 'modified'
  sortOrder?: 'asc' | 'desc'
}

export interface StorageTransaction {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface StorageStats {
  totalKeys: number
  totalSize: number
  operationQueue: number
  metadata: number
  lastCleanup: number
}

// Enhanced network adapter with comprehensive error handling
export interface NetworkAdapter {
  // Core sync operations
  push<T>(batch: SyncBatch<T>): Promise<SyncResult<T>[]>
  pull(entityType: string, lastSyncTime: number, limit?: number): Promise<SyncOperation[]>
  
  // Connection management
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): Promise<boolean>
  getNetworkStatus(): Promise<NetworkStatus>
  
  // Health and monitoring
  ping(): Promise<number> // Returns latency in ms
  getConnectionQuality(): Promise<ConnectionQuality>
  
  // Real-time subscriptions (optional)
  subscribe?(entityType: string, callback: (operation: SyncOperation) => void): Promise<() => void>
}

export interface ConnectionQuality {
  latency: number // ms
  bandwidth: number // bytes/sec estimate
  reliability: number // 0-1 score based on recent success rate
  lastTested: number
}

// Comprehensive retry configuration
export interface RetryConfig {
  maxAttempts: number
  baseDelay: number // Initial delay in ms
  maxDelay: number // Cap on retry delay
  strategy: 'exponential' | 'linear' | 'fixed'
  jitter: boolean // Add randomization to prevent thundering herd
  backoffMultiplier: number // For exponential strategy
  retryableErrors: ErrorCategory[] // Which errors should trigger retry
}

// Sync event types with enhanced metrics
export type SyncEventMap = {
  'sync:started': { entityTypes: string[]; batchId: string }
  'sync:progress': { completed: number; total: number; entityType?: string; batchId: string }
  'sync:completed': { results: SyncResult[]; duration: number; batchId: string }
  'sync:failed': { error: SyncError; entityType?: string; batchId: string }
  'sync:conflict': { conflict: ConflictContext; resolutionStrategy?: ConflictResolution }
  'sync:cancelled': { operationId: string; reason: string }
  
  'network:statusChanged': { status: NetworkStatus; previousStatus: NetworkStatus }
  'network:flapping': { count: number; duration: number }
  'network:reconnected': { downtime: number; queueSize: number }
  
  'operation:queued': { operation: SyncOperation; queueSize: number }
  'operation:started': { operation: SyncOperation; attempt: number }
  'operation:completed': { operation: SyncOperation; result: SyncResult }
  'operation:failed': { operation: SyncOperation; error: SyncError; willRetry: boolean }
  'operation:cancelled': { operation: SyncOperation; reason: string }
  
  'queue:overflow': { droppedOperations: number; queueSize: number }
  'queue:recovered': { operationCount: number; oldestOperation: number }
  
  'storage:error': { error: Error; operation: string }
  'storage:cleanup': { deletedCount: number; freedBytes: number }
  
  'metrics:heartbeat': { metrics: SyncMetrics }
}

// Comprehensive sync metrics for monitoring
export interface SyncMetrics {
  // Operation metrics
  totalOperations: number
  successfulOperations: number
  failedOperations: number
  cancelledOperations: number
  
  // Queue metrics
  queueSize: number
  averageQueueTime: number
  oldestQueuedOperation: number
  
  // Network metrics
  networkStatus: NetworkStatus
  averageLatency: number
  successRate: number // Last 100 operations
  lastSyncTime: number
  
  // Error metrics
  errorsByCategory: Record<ErrorCategory, number>
  retryRate: number
  
  // Performance metrics
  averageOperationDuration: number
  peakQueueSize: number
  memoryUsage: number
  
  // Storage metrics
  storageSize: number
  metadataSize: number
  
  timestamp: number
}

// Configuration interfaces with production defaults
export interface SyncEngineConfig {
  // Core settings
  batchSize: number
  batchTimeoutMs: number
  maxConcurrentBatches: number
  
  // Retry configuration
  retryConfig: RetryConfig
  
  // Network settings
  networkTimeout: number
  connectionPoolSize: number
  
  // Queue management
  maxQueueSize: number
  queuePersistence: boolean
  priorityLevels: number
  
  // Performance tuning
  enableOptimisticUpdates: boolean
  enableConflictResolution: boolean
  enableCompression: boolean
  enableEncryption: boolean
  
  // Memory management
  maxMemoryUsage: number // bytes
  cleanupInterval: number // ms
  metadataRetention: number // ms
  
  // Monitoring
  metricsInterval: number // ms
  enableDetailedMetrics: boolean
  
  // Dependencies
  storageProvider: StorageProvider
  networkAdapter: NetworkAdapter
  logger?: SyncLogger
}

// Entity-specific sync configuration
export interface EntitySyncConfig {
  entityType: string
  syncInterval?: number
  batchSize?: number
  conflictResolver?: ConflictResolver
  enableRealtime?: boolean
  priority: OperationPriority
  retryConfig?: Partial<RetryConfig>
  
  // Entity-specific optimizations
  enableDeltaSync?: boolean
  compressionThreshold?: number // bytes
  encryptionRequired?: boolean
  
  // Lifecycle hooks
  beforeSync?: (operations: SyncOperation[]) => Promise<void>
  afterSync?: (results: SyncResult[]) => Promise<void>
  onConflict?: (conflict: ConflictContext) => Promise<void>
}

// Logging interface for observability
export interface SyncLogger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: Error, context?: Record<string, unknown>): void
  
  // Structured metrics logging
  metric(name: string, value: number, tags?: Record<string, string>): void
  
  // Performance tracking
  startTiming(label: string): () => void
  
  // Health check logging
  healthCheck(component: string, status: 'healthy' | 'degraded' | 'unhealthy', details?: Record<string, unknown>): void
}

// Conflict resolver function type with enhanced context
export type ConflictResolver<T = unknown> = (
  context: ConflictContext<T>
) => Promise<{ resolution: ConflictResolution; data?: T; reason?: string }>