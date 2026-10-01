# Tracker Mobile — Architecture & Engineering Standards

This document establishes the mandatory rules and architectural invariants for the Tracker Mobile application (`m/`, [ChinmayOnGithub/tracker-mobile](https://github.com/ChinmayOnGithub/tracker-mobile)).

---

## 1. Primary Architecture Directive
- **Mobile is a native client of Tracker, not a second product**:
  - Web is the single source of truth for business invariants, domain definitions, database schemas, timestamps, recurrence logic, work-session calculation rules, and entitlement authorization.
  - Server domain services (`AuthService`, `WorkSessionService`, `ActivityService`, `TemplateService`, `JournalService`, etc.) own persistence and truth.
  - Mobile owns native Android/iOS presentation, native navigation (Expo Router), local SQLite caching, outbox mutation mechanics, and mobile-ergonomic interactions.
  - **Prohibition**: Never duplicate server business logic inside React Native screen components or client controllers.
  - Screens must strictly coordinate:
    ```
    UI Component → Feature Hook / Controller → API Client / Repository / Domain Contract
    ```

---

## 2. API Contract Rigor
- **Never assume a TypeScript interface is correct because it compiles**:
  - Every mobile endpoint contract must be compared against the actual server implementation.
  - Strict verification checklist for every endpoint:
    - Request & response field names (exact casing)
    - Optionality vs nullability
    - Enum value matching (e.g. priority, recurrenceType, mood)
    - Date format standards (`YYYY-MM-DD` for calendar days, ISO 8601 UTC for timestamps)
    - Entity ID types and presence
    - Version counter fields (`version: number`)
    - Soft-deletion fields (`deletedAt`)
    - Pagination & cursor semantics
    - Standardized error envelopes (`ApiEnvelope<T>`, `ApiErrorDetail`)
    - Authentication headers (`Authorization: Bearer <token>`) & Tenant isolation (`userId`)
  - **Derive/Reuse**: Avoid maintaining three disconnected definitions (server schema, web type, mobile type) without reason. Derive or share contracts where practical.

---

## 3. Offline-First Architecture & Outbox
- **Server is Authoritative Truth; SQLite is Cache + State + Outbox**:
  - SQLite is not a secondary source of truth. It stores:
    1. Local caches of templates, logs, sessions, notes, journals for instant offline render (<16ms).
    2. Local optimistic state.
    3. The mutation outbox (`mutation_queue`).
  - **Outbox Contract**:
    - User action updates local SQLite cache optimistically.
    - Mutation record is enqueued into `mutation_queue`.
    - Safe background sync drains the outbox to server endpoints idempotently.
    - Server reconciliation updates local records with authoritative IDs and versions.
  - **Prohibition**: Do not add direct network mutations that bypass the established local outbox architecture unless explicitly justified.

---

## 4. Universal Soft-Deletion Lifecycle
- All supported entities (Activities, Logs, Journals, Notes, Weights, Documents) must adhere to the universal lifecycle:
  ```
  CREATE            → local → sync
  EDIT              → local → sync
  DELETE            → soft-delete (deletedAt = now()) → moved to Bin → sync
  RESTORE           → restore (deletedAt = null)      → normal view  → sync
  PERMANENT DELETE  → explicit irreversible purge     → sync
  ```
- **Prohibitions**:
  - Never issue hard deletes (`delete` / `deleteMany`) on tables with `deletedAt`.
  - Never invent independent deletion models per module.
  - Strict typing: Use `BinEntityType = 'journal' | 'note' | 'activity_template' | 'weight'` instead of loose `string`.

---

## 5. UI, Iconography & Design System Standards
- **Canonical Design Language**:
  - Standardized semantic tokens in `m/src/theme/tokens.ts` (colors, spacing, radius, typography).
  - Standardized Lucide icon family via `<TrackerIcon name="..." />` (`m/src/components/TrackerIcon.tsx`).
  - Native styling using React Native `StyleSheet`.
- **Prohibitions**:
  - Do NOT hard-code raw hex colors (`#ff7557`, `#10b981`, `#090b0e`) in screen components — use semantic tokens (`colors.coral`, `colors.surface`, `colors.text`, etc.).
  - Do NOT use arbitrary spacing — use `spacing.xs` (4), `spacing.sm` (8), `spacing.md` (16), `spacing.lg` (24), `spacing.xl` (32).
  - Do NOT import directly from `lucide-react-native` or other icon packages in screens — use `<TrackerIcon>`.
  - Do NOT migrate to Tailwind/NativeWind without an empirical, measured maintenance justification.
- **Accessibility & Touch Targets**:
  - All interactive elements must maintain a minimum touch target size of 48×48px.
  - Every interactive component must provide an accessible `accessibilityLabel`.

---

## 6. Screen Size & Component Architecture
- **Avoid God Screens**:
  - No screen file should exceed 400–500 lines or accumulate multiple concerns (API orchestration, modal forms, list rendering, filter state, data transformation).
  - Required directory pattern for non-trivial features:
    ```
    src/features/<feature>/
      ├── <Feature>Screen.tsx   -- Screen coordinator / container
      ├── components/           -- Feature-specific cards, lists, modals
      ├── hooks/                -- Custom hooks (data fetching, optimistic mutations)
      └── types.ts              -- Local UI state / DTOs if not in domain
    ```
  - Extract only when it improves readability, unit testability, correctness, and component reuse.

---

## 7. Verification Gates & Status Integrity
- **Truth in Reporting**:
  - Never report a feature as "IMPLEMENTED" when only TypeScript passed.
  - Never report a feature as "Android tested" unless an actual Android runtime or device was executed.
- **Authoritative Status Vocabulary**:
  - `PLANNED`: Feature is specced/scoped but not started.
  - `IN PROGRESS`: Feature implementation actively underway.
  - `STATIC-VALIDATED`: Passes `tsc --noEmit` and `eslint` with 0 errors.
  - `TEST-VALIDATED`: Unit and integration tests written and passing in `bun test`.
  - `RUNTIME-VALIDATED`: Executed and verified on an actual Android device, emulator, or dev client.
  - `RELEASE-VALIDATED`: Standalone release APK built and verified end-to-end.
  - If Android runtime cannot be executed in the environment:
    ```
    ANDROID RUNTIME NOT EXECUTED — ENVIRONMENT LIMITATION
    ```
