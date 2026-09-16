# Mobile-Readiness Architecture Audit

> **Repository**: Tracker (Personal Operating System)  
> **Status**: Living Architecture Audit  
> **Target**: Multi-Client Expansion (Next.js Web + Future Expo/React Native Mobile)

---

## 1. Executive Summary & Objective

Tracker is an offline-first personal operating system designed to provide deep tracking for activities, habits, calendar occurrences, journal entries, leave balances, body weight, documents, and work presence.

This document establishes the architecture foundation for a **scalable multi-client architecture** supporting:
1. The existing **Next.js Web Application** (production runtime).
2. A future **Expo / React Native Mobile Application** sharing the same backend.
3. A single **PostgreSQL Database** as the authoritative source of truth.
4. Shared application services and domain use-cases.
5. Cross-client offline capabilities and robust synchronization.
6. Strict multi-tenant / multi-account data isolation.

### Non-Negotiable Guardrails
- **No Rewrite**: Preserve existing working architecture, database models, and service layer.
- **No Monorepo Overhead**: Maintain a plain workspace initially without Turborepo/Nx.
- **No Alternative Protocols**: No tRPC, no GraphQL, no microservices, no second backend.
- **No Split Database**: Mobile and web connect to the same PostgreSQL schema.
- **Thin Transport Adapters**: HTTP Route Handlers (`/api/mobile/v1/...`) act strictly as thin controllers calling existing application services.
- **Server Authority**: The server always authenticates sessions and resolves `userId`. Client-supplied user/owner identifiers are never trusted.

---

## 2. Current Architecture Inventory

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                  │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
│  │   Existing Next.js Web UI    │    │   Future Expo Mobile App     │  │
│  │  (React 19, Tailwind CSS 4)  │    │   (React Native, Expo)       │  │
│  └──────────────┬───────────────┘    └──────────────┬───────────────┘  │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ (Server Actions & HTTP)           │ (REST / JSON + Bearer)
┌─────────────────▼───────────────────────────────────▼──────────────────┐
│                      TRANSPORT / ADAPTER LAYER                         │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
│  │ Next.js Server Actions       │    │ Next.js Route Handlers       │  │
│  │ (app/actions/*.ts)           │    │ (/api/mobile/v1/*)           │  │
│  │ • Cookie Auth Verification   │    │ • Bearer Auth Verification   │  │
│  │ • Zod Input Validation       │    │ • Zod Input Validation       │  │
│  │ • Path Revalidation          │    │ • Clean DTO & Error Envelope │  │
│  └──────────────┬───────────────┘    └──────────────┬───────────────┘  │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  └─────────────────┬─────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     APPLICATION SERVICE LAYER                          │
│  ActivityService · SyncedActivityService · CalendarService ·           │
│  WorkSessionService · DefaultActivitiesService · TimelineService       │
│  • Enforces business invariants and state machine rules                │
│  • Single writers to database entities                                 │
│  • Publishes domain events to EventBus                                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DATA REPOSITORY / PRISMA LAYER                     │
│  Prisma Client (lib/db.ts)                                             │
│  • Query interceptors blocking hard deletes on tables with deletedAt   │
│  • Scoped multi-tenant queries                                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        POSTGRESQL DATABASE                             │
│  Single ground truth for all web and mobile accounts                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown
| Layer | Current Implementation | Mobile Readiness Assessment |
| :--- | :--- | :--- |
| **Database** | PostgreSQL (Prisma ORM in `prisma/schema.prisma`) | **100% Ready**: Comprehensive schema with `userId` scoping and `deletedAt` soft deletion. |
| **Authentication** | Username + 4-digit PIN (PBKDF2 salted) + Google OAuth, signed HMAC-SHA256 session tokens (`lib/session.ts`) | **Ready**: Session tokens are platform-neutral and already accepted in Bearer headers. Mobile needs an HTTP login endpoint. |
| **Authorization** | `lib/auth-guards.ts` (`requireAuth`, `requireOwnership`, `requireCapability`) | **Ready**: Ownership guards query Prisma dynamically by `userId`. |
| **Service Layer** | `lib/services/` (`ActivityService`, `TimelineService`, `DefaultActivitiesService`, etc.) | **Ready**: Business logic is separated from web UI and Server Actions. |
| **Validation** | Zod schemas in `lib/validations/` (`template.ts`, `journal.ts`, etc.) | **Ready**: Input validation schemas exist and can be shared between actions and route handlers. |
| **Offline Sync** | `lib/sync/` (`ProductionSyncEngine`, `SyncQueue`, `ConflictResolver`, `StorageProvider`) | **90% Ready**: Engine is abstracted over `StorageProvider` and `NetworkAdapter`. Needs mobile storage adapter (SQLite). |
| **Web Transport** | Server Actions in `app/actions/*.ts` | **Web-specific**: Coupled to `next/headers` (cookies) and `next/cache` (`revalidatePath`). |
| **Mobile Transport**| `app/api/mobile/sync/route.ts` (existing prototype) | **Partial**: Prototype exists; needs structured `/api/mobile/v1/...` routes over application services. |

---

## 3. Mobile-Readiness Strengths

1. **Clean Service-Action Separation**:
   In Tracker, Server Actions in `app/actions/` do not embed raw business algorithms. They validate authentication, parse input, and immediately delegate to `ActivityService`, `SyncedActivityService`, `WorkSessionService`, etc. Route Handlers can directly call these exact same services without duplicating logic.

2. **Platform-Neutral Session Tokens**:
   `lib/session.ts` signs a base64url payload with HMAC-SHA256. It does not depend on browser APIs or Next.js internals. The token is verifiable in both cookie contexts and HTTP `Authorization: Bearer <token>` headers.

3. **Universal Soft Deletion**:
   Prisma interceptors in `lib/db.ts` protect all records with `deletedAt`. Soft-deletion tombstones allow seamless synchronization and deletion propagation across offline clients.

4. **Modular Sync Engine Abstractions**:
   `lib/sync/types.ts` already specifies `StorageProvider` and `NetworkAdapter` contracts. The sync engine does not have hardcoded browser assumptions in its core state machine.

5. **Universal Multi-Tenant Scoping**:
   All core tables (`ActivityTemplate`, `ActivityLog`, `Note`, `JournalEntry`, `LeaveRecord`, `WeightRecord`, `UserSetting`) feature mandatory `userId` foreign keys and compound unique constraints (e.g. `@@unique([userId, date])`).

---

## 4. Mobile-Readiness Blockers & Architectural Gaps

1. **Lack of HTTP Auth Issuance Endpoint**:
   Web logs in via `verifyPinAction` in `app/actions/auth.ts`, which sets an `httpOnly` cookie. Mobile cannot easily execute Server Actions. Mobile requires an explicit HTTP route (e.g. `POST /api/mobile/v1/auth/login`) returning `{ token, user }`.

2. **Direct Server Action Coupling in Client Repositories**:
   `RemoteActivityLogRepository.ts` currently imports `createLog`, `updateLog`, `deleteLog` from `app/actions/log.ts`. This works in Next.js web client bundles, but React Native cannot import files containing `"use server"` or `next/cache`.

3. **Absence of Standardized REST CRUD Route Handlers**:
   While `app/api/mobile/sync` exists, mobile also requires targeted endpoints for direct CRUD operations (e.g., retrieving activities, logging a single occurrence, toggling status) when online or during vertical slice operations.

4. **Browser-Coupled Offline Store in Web**:
   `IndexedDBEngine.ts` calls `window.indexedDB`. For mobile, the sync engine requires a storage provider implementation backed by SQLite or durable mobile KV.

---

## 5. High-Risk Areas & Mitigation

| High-Risk Area | Threat | Mitigation |
| :--- | :--- | :--- |
| **Cross-Account Data Leakage** | Client supplying an arbitrary `userId` or `ownerId` in request bodies | Never read `userId` from request body. Extract and verify `userId` exclusively from server-verified session (`verifySession`). |
| **Duplicate Mutation Ingestion** | Network retries from mobile causing duplicate activity logs | Implement deterministic idempotency keys (`clientRequestId` or `id`) with idempotent `upsert` semantics. |
| **Token Theft / Leakage** | Storing session tokens in unencrypted mobile storage | Mandate platform secure storage (Expo `SecureStore`); forbid plain `AsyncStorage` for credentials. |
| **Timezone & Date Divergence** | Mobile local dates misaligning with server date queries | Mandate canonical `YYYY-MM-DD` strings for calendar dates and UTC ISO-8601 strings for segment timestamps (`createLocalDateTime`). |

---

## 6. Phased Implementation Roadmap

1. **Phase 1: Architecture Documentation (Current)**:
   - Establish canonical documentation under `docs/mobile/`.
2. **Phase 2: Authentication Endpoint**:
   - Provide `POST /api/mobile/v1/auth/login` and `GET /api/mobile/v1/auth/me`.
3. **Phase 3: Shared Validation & DTO Contracts**:
   - Extract/standardize request and response DTO schemas for Activities/Tasks.
4. **Phase 4: Activities / Tasks Mobile API Route Handlers**:
   - Build `/api/mobile/v1/activities/templates` and `/api/mobile/v1/activities/logs`.
5. **Phase 5: Portable Sync Adapters**:
   - Ensure `StorageProvider` contracts are platform-neutral and decouple web-only imports.
6. **Phase 6: End-to-End Vertical Slice Validation**:
   - Validate full flow with regression tests covering auth, CRUD, offline mutation, and idempotency.

---

## 7. Explicit Non-Goals

- **No Framework Migration**: Do not migrate from Next.js or introduce Remix/Astro.
- **No Microservices**: Keep all route handlers in the Next.js server runtime.
- **No tRPC / GraphQL**: Stick to lightweight, versioned JSON REST route handlers.
- **No Mass Package Extraction**: Do not split code into premature monorepo packages until an active mobile client package consumes it.
- **No Unrelated UI Changes**: Do not touch web dashboard UI, styling, or widgets.
