# Offline-First Architecture & Mutation Outbox Specification

This document defines the offline-first SQLite cache, mutation outbox, and synchronization architecture for the Tracker mobile application.

---

## 1. Architectural Model

The mobile application operates local-first. The user must be able to complete tasks, log habits, and browse today's schedule without an active internet connection.

```text
User Action (e.g. Complete Task)
            │
            ▼
┌───────────────────────────────────────────────┐
│              Local Transaction                │
│  1. Update SQLite local cache table           │
│  2. Insert record into `mutation_queue`       │
└───────────────────────┬───────────────────────┘
                        │ (Immediate UI update)
                        ▼
┌───────────────────────────────────────────────┐
│               Sync Dispatcher                 │
│  - Online? ──► Drain `mutation_queue`         │
│  - Offline? ─► Retain in queue for reconnect  │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
               HTTP /api/mobile/v1/*
                        │
                        ▼
              Authoritative Server
```

---

## 2. SQLite Schema & Migrations

Local storage uses `expo-sqlite` with strictly sequential ascending migrations:

### Tables:
1. `activity_template`: Local cache of user's habit/task definitions.
2. `activity_log`: Local cache of user's activity logs and task completion states.
3. `sync_state`: Stores local sync cursor, last sync timestamp, and status.
4. `mutation_queue`: Outbox table storing queued offline mutations:
   - `id`: Client UUID primary key
   - `entity_type`: `'activity_log' | 'activity_template' | 'weight' | 'note'`
   - `entity_id`: Target entity ID
   - `mutation_type`: `'CREATE' | 'UPDATE' | 'DELETE'`
   - `payload`: Serialized JSON payload
   - `client_timestamp`: UTC timestamp of user interaction
   - `version`: Optimistic version number
   - `retry_count`: Incremented on failed dispatch attempts
   - `status`: `'pending' | 'in_flight' | 'failed'`

---

## 3. Atomic Outbox Invariant

**Rule**: An operation that changes local state must insert its outbox record in the same atomic SQLite transaction:

```ts
await db.withTransactionAsync(async () => {
  // 1. Update local cache
  await db.runAsync(
    `UPDATE activity_log SET status = ?, completed = 1 WHERE id = ?`,
    ['done', logId]
  )
  // 2. Insert mutation into outbox
  await db.runAsync(
    `INSERT INTO mutation_queue (id, entity_type, entity_id, mutation_type, payload, client_timestamp, version, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [mutationId, 'activity_log', logId, 'UPDATE', JSON.stringify({ status: 'done' }), new Date().toISOString(), version]
  )
})
```

*The app must never reach a state where local UI displays a completed task, but the outbox mutation was lost.*

---

## 4. Idempotent Outbox Drain & Conflict Resolution

1. **Client-Assigned UUIDs**:
   - Every mutation has a unique UUID. Retrying a failed network request sends the exact same UUID.
   - The server acknowledges repeated payloads with `200 OK` rather than duplicating the record.
2. **Conflict Resolution (`resolveConflict`)**:
   - If server and client have modified the same entity while offline:
   - Compare `updatedAt` timestamps.
   - If timestamps differ, the newer timestamp wins.
   - If timestamps are identical, the higher `version` integer breaks the tie.
3. **Rollback on Unrecoverable Rejection**:
   - If the server rejects a mutation with a 4xx error (e.g. `403 FORBIDDEN` or unrecoverable constraint), the mutation is marked failed and local cache reverts to server state upon next sync.
