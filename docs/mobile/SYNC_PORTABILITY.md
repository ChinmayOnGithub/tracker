# Synchronization Portability & Architecture Specification

> **Status**: Architectural Standard  
> **Scope**: Offline Sync Engine Portability Across Web and Mobile

---

## 1. Overview & Current Architecture

Tracker features an offline-first architecture designed to allow uninterrupted productivity regardless of network availability.

The synchronization system is structured into layered abstractions:
```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION CLIENT                       │
│  (UI Components, Local Repositories, Optimistic Stores)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Dispatches mutations
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     SYNC ENGINE CORE                        │
│  (ProductionSyncEngine, SyncQueue, ConflictResolver)        │
│  • Manages operation lifecycle (pending ➔ syncing ➔ synced)  │
│  • Enforces concurrency limits, retries, and batching       │
│  • Platform-neutral TypeScript logic                        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼ Uses                          ▼ Uses
┌──────────────────────────────┐ ┌────────────────────────────┐
│      STORAGE PROVIDER        │ │      NETWORK ADAPTER       │
│  (Abstract StorageProvider)  │ │ (Abstract NetworkAdapter)  │
│  • Web: IndexedDB / Memory   │ │ • Web: Fetch / Actions     │
│  • Mobile: SQLite / KV       │ │ • Mobile: HTTP REST Client │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 2. Core Sync Abstractions (`lib/sync/types.ts`)

The existing engine in `lib/sync/` was built on modular interfaces:

### 2.1 SyncOperation
Represents a discrete mutation queued locally:
```ts
export interface SyncOperation<T = unknown> {
  id: string // Deterministic ID (entityType:entityId:version)
  type: 'create' | 'update' | 'delete'
  entityType: string
  entityId: string
  data: T
  metadata: SyncMetadata
  createdAt: number
  priority: OperationPriority
  clientRequestId?: string // UUID for duplicate delivery prevention
  expectedVersion?: number // Concurrency control
  maxRetries?: number
  retryStrategy?: 'exponential' | 'linear' | 'fixed'
  userId?: string
}
```

### 2.2 StorageProvider
Abstracts durable queue and local entity persistence:
```ts
export interface StorageProvider {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: StorageOptions): Promise<void>
  delete(key: string): Promise<void>
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>
  
  // Durable Queue Methods
  enqueueOperation(operation: SyncOperation): Promise<void>
  dequeueOperations(batchSize: number): Promise<SyncOperation[]>
  peekOperations(batchSize: number): Promise<SyncOperation[]>
  acknowledgeOperations(operationIds: string[]): Promise<void>
}
```

### 2.3 NetworkAdapter
Abstracts the wire protocol:
```ts
export interface NetworkAdapter {
  push<T>(batch: SyncBatch<T>): Promise<SyncResult<T>[]>
  pull(entityType: string, lastSyncTime: number, limit?: number): Promise<SyncOperation[]>
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): Promise<boolean>
  getNetworkStatus(): Promise<NetworkStatus>
}
```

---

## 3. Platform Portability Assessment

### 3.1 What is Already Platform-Neutral?
- **SyncQueue Logic (`SyncQueue.ts`)**: Queue ordering, retry countdowns, priority sorting, and backoff mathematics are 100% pure TypeScript.
- **Conflict Resolver (`ConflictResolver.ts`)**: Last-Write-Wins (LWW) resolution, timestamp comparisons, and vector merges have zero browser or Node dependencies.
- **Data Models & Types (`lib/sync/types.ts`)**: Fully platform-neutral.

### 3.2 What is Web-Specific?
- **`IndexedDBEngine.ts`**:
  Directly accesses `window.indexedDB`. Cannot run in React Native / Expo without an adapter.
- **`ConnectivityMonitor.ts` / Browser Network Checks**:
  Listens to `window.addEventListener('online')` and `navigator.onLine`.
- **`RemoteActivityRepository.ts`**:
  Imports Next.js Server Actions directly (`app/actions/log.ts`), which cannot be bundled into React Native.

### 3.3 Mobile Adapter Requirements
| Layer | Web Implementation | Mobile Implementation |
| :--- | :--- | :--- |
| **Storage Provider** | `IndexedDBEngine` / `MemoryStorageProvider` | Durable SQLite table (`expo-sqlite`) or KV adapter implementing `StorageProvider`. |
| **Connectivity** | `window.addEventListener('online')` | `NetInfo` (`@react-native-community/netinfo`) implementing `NetworkStatus`. |
| **Wire Transport** | Direct Server Action or HTTP fetch | `HttpNetworkAdapter` sending batches to `/api/mobile/v1/sync` or REST endpoints. |

---

## 4. Conflict Resolution & Idempotency Rules

1. **Deterministic Operation IDs**:
   Operations use `${entityType}:${entityId}:${version}` to eliminate duplicate processing.
2. **Server-Side Idempotent Upsert**:
   When mutations reach PostgreSQL, they use Prisma `upsert` or check existing record timestamps. Retrying a previously successful mutation yields `200 OK` without creating duplicate records.
3. **Universal Soft Deletes (Tombstones)**:
   Deleting an entity sets `deletedAt: new Date()`. Soft-deleted records are retained in PostgreSQL and locally, ensuring that offline sync can cleanly propagate deletions without resurrecting records.
4. **Timestamp-Anchored Reconciliation**:
   Sync pulls supply a `lastSyncedAt` timestamp. The server returns only entities updated or deleted since that cursor:
   ```ts
   where: {
     userId,
     updatedAt: { gt: new Date(lastSyncedAt) }
   }
   ```

---

## 5. Mobile Readiness & Recommendations

- **Do Not Replace the Sync Engine**:
  Tracker's existing `ProductionSyncEngine` is sophisticated and well-tested. Replacing it with WatermelonDB or ElectricSQL would introduce unnecessary framework bloat and destabilize the working web application.
- **Adapter Strategy**:
  When building the mobile vertical slice, implement a clean `StorageProvider` for mobile using SQLite, plug it into the existing `ProductionSyncEngine`, and reuse all queue and conflict logic untouched.
