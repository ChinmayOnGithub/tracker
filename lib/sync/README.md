# Tracker Sync Engine

Production-grade synchronization system providing instant UI responsiveness through optimistic updates, background synchronization, and conflict resolution.

## Architecture Overview

The Sync Engine is designed with modularity and extensibility in mind:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Hook    │    │  Sync Service   │    │  Sync Engine    │
│  (useSyncEngine)│────│ (ActivitySync)  │────│     (Core)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┼───────────────────────────────┐
        │                                               │                               │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Storage Layer  │    │  Network Layer  │    │  Sync Queue     │    │ Event System    │
│  (Pluggable)    │    │  (HTTP/WS)      │    │  (Retry Logic)  │    │ (Type Safe)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Features

### 1. Optimistic Updates
- **Instant UI**: Changes appear immediately, sync happens in background
- **Rollback**: Failed operations can be reverted automatically
- **Status Tracking**: Each entity has sync metadata (pending, syncing, synced, failed)

### 2. Pluggable Storage
- **Memory Provider**: Fast, ephemeral storage for development
- **IndexedDB Provider**: Browser-based persistent storage (TODO)
- **SQLite Provider**: Mobile/Expo persistent storage (TODO) 
- **Redis Provider**: Server-side distributed storage (TODO)

### 3. Network Resilience
- **Automatic Retry**: Exponential backoff with jitter
- **Offline Support**: Queue operations when offline, sync when online
- **Connection Quality**: Detect limited/slow connections
- **Batch Processing**: Efficient bulk operations

### 4. Conflict Resolution
- **Last Writer Wins**: Default strategy with timestamp comparison
- **Custom Resolvers**: Entity-specific conflict resolution logic
- **Three-way Merge**: Preserve important changes from both sides
- **Manual Resolution**: UI hooks for complex conflicts (TODO)

### 5. Real-time Synchronization
- **Event-driven**: React to domain events
- **Incremental Sync**: Only sync changes since last sync
- **Priority Queues**: Important operations sync first
- **Background Sync**: Automatic periodic synchronization

## Usage Examples

### Basic Setup

```typescript
import { useSyncEngine } from '@/lib/sync/hooks/useSyncEngine'

function MyComponent() {
  const {
    isOnline,
    createActivityLog,
    updateActivityLog,
    deleteActivityLog
  } = useSyncEngine(userId)

  const handleCreateLog = async () => {
    // This will update UI immediately and sync in background
    await createActivityLog({
      activityId: 'activity-123',
      date: '2024-01-15',
      status: 'done'
    })
  }
}
```

### Custom Storage Provider

```typescript
import { StorageProvider } from '@/lib/sync/types'

class IndexedDBStorageProvider implements StorageProvider {
  async get<T>(key: string): Promise<T | null> {
    // IndexedDB implementation
  }
  
  async set<T>(key: string, value: T): Promise<void> {
    // IndexedDB implementation
  }
  
  // ... other methods
}

// Use with sync engine
const syncEngine = new SyncEngine({
  storageProvider: new IndexedDBStorageProvider(),
  // ... other config
})
```

### Conflict Resolution

```typescript
// Custom conflict resolver for activity logs
const resolveActivityConflict = async (context) => {
  const { localData, remoteData } = context
  
  // Prefer completion status over other statuses
  if (localData.status === 'done' && remoteData.status !== 'done') {
    return { resolution: 'local' }
  }
  
  // Default to latest timestamp
  return localData.lastModified > remoteData.lastModified
    ? { resolution: 'local' }
    : { resolution: 'remote' }
}

syncEngine.registerEntity({
  entityType: 'activityLog',
  conflictResolver: resolveActivityConflict
})
```

## API Reference

### Core Types

```typescript
interface SyncOperation<T> {
  id: string
  type: 'create' | 'update' | 'delete'
  entityType: string
  entityId: string
  data: T
  metadata: SyncMetadata
  createdAt: number
  priority: number
}

interface SyncMetadata {
  id: string
  lastModified: number
  version: number
  syncStatus: SyncStatus
  lastSyncAttempt?: number
  retryCount?: number
}
```

### Storage Provider Interface

```typescript
interface StorageProvider {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  
  // Batch operations
  getMany<T>(keys: string[]): Promise<(T | null)[]>
  setMany<T>(entries: Array<{ key: string; value: T }>): Promise<void>
  
  // Metadata
  getMetadata(key: string): Promise<SyncMetadata | null>
  setMetadata(key: string, metadata: SyncMetadata): Promise<void>
}
```

### Network Adapter Interface

```typescript
interface NetworkAdapter {
  push<T>(operations: SyncOperation<T>[]): Promise<SyncResult<T>[]>
  pull(lastSyncTime: number): Promise<SyncOperation[]>
  isOnline(): Promise<boolean>
  getNetworkStatus(): NetworkStatus
}
```

## Migration Guide

### Step 1: Existing Component (Before)

```typescript
// Old approach: Direct server actions
import { createLog } from '@/app/actions/log'

const handleSave = async () => {
  const result = await createLog(data)
  if (result.success) {
    router.refresh() // Full page refresh
  }
}
```

### Step 2: Sync-Enabled Component (After)

```typescript
// New approach: Optimistic updates with sync
import { useSyncEngine } from '@/lib/sync/hooks/useSyncEngine'

const { createActivityLog } = useSyncEngine(userId)

const handleSave = async () => {
  // UI updates immediately, syncs in background
  await createActivityLog(data)
  // No router.refresh() needed - state is managed optimistically
}
```

### Step 3: Add Sync Status UI

```typescript
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator'

function MyComponent() {
  const { isOnline, isSyncing, syncStats, forceSync } = useSyncEngine(userId)
  
  return (
    <div>
      <SyncStatusIndicator
        isOnline={isOnline}
        isSyncing={isSyncing}
        queueSize={syncStats.queueSize}
        onForceSync={forceSync}
      />
      {/* Rest of component */}
    </div>
  )
}
```

## Performance Considerations

### Memory Management
- **Bounded Caches**: Prevent memory leaks in long-running sessions
- **LRU Eviction**: Remove least recently used data when limits reached
- **Metadata Separation**: Store sync metadata separately from entity data

### Network Efficiency
- **Batch Operations**: Group multiple changes into single network requests
- **Compression**: Use gzip/brotli for large payloads
- **Delta Sync**: Only send changed fields, not entire entities
- **Connection Pooling**: Reuse HTTP connections

### Storage Optimization
- **Incremental Sync**: Track last sync timestamp per entity type
- **Garbage Collection**: Remove old sync operations and metadata
- **Indexing**: Use efficient keys for fast lookups

## Testing Strategy

### Unit Tests
- Storage provider implementations
- Conflict resolution logic
- Network retry mechanisms
- Event emission and handling

### Integration Tests
- End-to-end sync workflows
- Network failure scenarios
- Concurrent modification handling
- Cross-device synchronization

### Performance Tests
- Large dataset synchronization
- Memory usage under load
- Network latency simulation
- Storage provider benchmarks

## Future Roadmap

### Phase 1: Core Implementation ✅
- [x] Basic sync engine architecture
- [x] Memory storage provider
- [x] Activity log synchronization
- [x] React hooks integration
- [x] Basic conflict resolution

### Phase 2: Production Features
- [ ] IndexedDB storage provider
- [ ] Advanced conflict resolution UI
- [ ] Real-time WebSocket sync
- [ ] Encryption for sensitive data
- [ ] Sync analytics and monitoring

### Phase 3: Mobile & Offline
- [ ] SQLite storage for React Native
- [ ] Background sync for mobile
- [ ] Offline-first architecture
- [ ] Cross-platform data consistency

### Phase 4: Advanced Features
- [ ] Multi-user collaboration
- [ ] Operational transforms
- [ ] Distributed sync nodes
- [ ] Event sourcing integration

## Contributing

1. **Follow Architecture**: Maintain separation of concerns between layers
2. **Type Safety**: All interfaces must be strongly typed
3. **Error Handling**: Graceful degradation when sync fails
4. **Testing**: Unit tests required for all new providers/adapters
5. **Documentation**: Update this README for any architectural changes

## License

Same license as the main Tracker application.