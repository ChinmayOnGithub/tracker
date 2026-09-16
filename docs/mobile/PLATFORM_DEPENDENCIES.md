# Platform Dependencies & Module Boundary Matrix

> **Status**: Architectural Standard  
> **Scope**: Dependency Isolation, Forbidden Imports & Adapter Requirements

---

## 1. Code Classification Matrix

To preserve system stability and enable seamless mobile client integration, Tracker classifies all codebase modules into strict runtime categories:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RUNTIME ENVIRONMENTS                            │
├───────────────────┬───────────────────┬────────────────────────────────┤
│    SERVER ONLY    │    CLIENT ONLY    │        PLATFORM NEUTRAL        │
│  (Next.js Node)   │   (Web / Native)  │   (Portable across all runtimes)│
├───────────────────┼───────────────────┼────────────────────────────────┤
│ • Prisma ORM      │ • React 19 UI     │ • Domain Business Logic        │
│ • lib/db.ts       │ • Tailwind CSS    │ • Recurrence Computations      │
│ • next/headers    │ • Radix / Lucide  │ • Date/Time Utilities          │
│ • next/cache      │ • window / DOM    │ • Zod Validation Schemas       │
│ • Server Actions  │ • IndexedDBEngine │ • DTO Contracts & Types        │
│ • crypto (PBKDF2) │ • expo-secure-store│ • Sync Queue & Conflict Logic  │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

---

## 2. Granular Inventory

### 2.1 Platform-Neutral (Universal)
These modules contain pure TypeScript algorithms, contracts, or data transformations with zero platform-specific globals:
- **`lib/recurrence.ts`**: Timeline computations, recurring occurrence generation, timezone-aware dates.
- **`lib/dateUtils.ts`**: Date math, `createLocalDateTime`, ISO formatters.
- **`lib/validations/*`**: Zod schemas (`template.ts`, `journal.ts`, `leave.ts`, `weight.ts`, `note.ts`).
- **`lib/sync/types.ts`**: Sync engine interfaces (`SyncOperation`, `StorageProvider`, `NetworkAdapter`).
- **`lib/sync/queue/SyncQueue.ts`**: Queue ordering, retry backoff algorithms.
- **`lib/sync/core/ConflictResolver.ts`**: Last-Write-Wins and deterministic merge algorithms.
- **`types/*`**: Universal domain interfaces and DTOs.

### 2.2 Server-Only (Next.js Runtime)
These modules interact directly with PostgreSQL, file system, or Node APIs and **must never be imported into client bundles**:
- **`prisma/*` & `@prisma/client`**: Database schema, generated queries, migrations.
- **`lib/db.ts`**: Prisma client instance and query safety interceptors.
- **`lib/session.ts`**: Session token signing and verification using Node `crypto`.
- **`lib/auth-guards.ts`**: Server-side role and capability verification.
- **`lib/services/*`**: `ActivityService`, `WorkSessionService`, `DefaultActivitiesService`, etc.
- **`app/actions/*`**: Server Actions coupled to `next/headers` (`cookies()`) and `next/cache` (`revalidatePath()`).
- **`app/api/*`**: Next.js HTTP Route Handlers.

### 2.3 Web-Only / Browser-Only
These modules depend on web browser DOM APIs or web-specific UI packages:
- **`components/*`**: React DOM UI components, Tailwind CSS styling, Radix primitives.
- **`design-system/*`**: Web tokens, button styles, card panels.
- **`lib/database/local/IndexedDBEngine.ts`**: Directly accesses `window.indexedDB`.
- **`@tiptap/*`**: Rich text editor for web journal.
- **`@dnd-kit/*`**: Drag-and-drop toolkit for web dashboard widgets.
- **`localStorage` / `sessionStorage`**: Browser-local storage keys.

### 2.4 Mobile-Only (Future Expo Application)
Modules dedicated to mobile native runtimes:
- **`expo-secure-store`**: Keychain / EncryptedSharedPreferences for session token persistence.
- **`expo-sqlite`**: Durable local SQLite database backing `StorageProvider`.
- **`@react-native-community/netinfo`**: Mobile connectivity event monitor.
- **React Native UI Components**: Mobile screens, navigation stacks, gesture handlers.

---

## 3. Strict Boundary Rules & Forbidden Imports

### 3.1 What Mobile Client Code Must NEVER Import
Mobile client code (under future `apps/mobile` or mobile packages) is strictly prohibited from importing:
```
❌ @prisma/client
❌ @/lib/db
❌ next/headers
❌ next/navigation
❌ next/cache
❌ @/app/actions/* (Server Actions)
❌ @/lib/services/* (Direct Prisma database services)
❌ server-only environment variables (DATABASE_URL, AUTH_SECRET, AUTH_SALT)
```

**Reason**: Importing any of these will either crash the Metro bundler or introduce catastrophic security vulnerabilities by attempting to execute server ORM queries on a client device without credentials.

### 3.2 What Platform-Neutral Shared Code Must NEVER Import
Code intended for universal sharing must never import:
```
❌ react / react-dom / react-native
❌ window / document / navigator / localStorage / indexedDB
❌ next/*
❌ expo-*
❌ @prisma/client
```

---

## 4. Adapter Boundary Pattern

Where platform-specific capabilities are required by shared domain abstractions, an **Adapter Interface** is used:

```
                  ┌──────────────────────────────┐
                  │    Shared SyncEngine Core    │
                  │   (lib/sync/core/SyncEngine) │
                  └──────────────┬───────────────┘
                                 │ Depends on interface
                                 ▼
                  ┌──────────────────────────────┐
                  │   StorageProvider Interface  │
                  │     (lib/sync/types.ts)      │
                  └──────▲────────────────▲──────┘
                         │                │
            Implements   │                │   Implements
       ┌─────────────────┴────┐      ┌────┴─────────────────┐
       │ Web Storage Adapter  │      │ Mobile Storage Adapter│
       │ (IndexedDB / Memory) │      │   (SQLite / Durable) │
       └──────────────────────┘      └──────────────────────┘
```

By enforcing this adapter pattern, Tracker achieves complete cross-client portability without duplicating business rules, validation schemas, or database logic.
