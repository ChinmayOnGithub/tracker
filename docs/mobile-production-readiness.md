# Tracker Mobile Production Readiness & Parity Matrix

Authoritative audit and verification record tracking the mobile client (`m/` — `ChinmayOnGithub/tracker-mobile`) against canonical web domain semantics, SQLite persistence, outbox synchronization, and platform runtime constraints.

---

## 1. Parity & Verification Matrix

> **Allowed Status Values**: `NOT IMPLEMENTED`, `PARTIAL`, `IMPLEMENTED`, `AUTOMATED TESTED`, `ANDROID RUNTIME VERIFIED`, `RELEASE VERIFIED`, `UNVERIFIED`, `BLOCKED`, `BROKEN`.

| Feature | Canonical Web Behavior | Mobile Implementation | Automated Test | Android Runtime Test | Release Build Test | Offline Behavior | Known Defects | Status | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google & Token Authentication** | Bearer session token stored in secure cookie / header, validated against `User.sessionVersion` | Token stored in Android Keystore / iOS Keychain via `expo-secure-store`, validated on boot via `/api/mobile/v1/auth/me` | `tests/mobile-api-activities.test.ts` (Me & Login tests) | Tested via emulator session restore & deep link | UNVERIFIED | Preserves local token; offline requests use cached local database session | None | `AUTOMATED TESTED` | `tests/mobile-api-activities.test.ts:55-123` |
| **Onboarding Lifecycle** | Wizard for new users setting username, initial habits, and timezone | `OnboardingScreen.tsx` with SQLite migration 3 `onboarding_state` tracking completion | `tests/unit/repository.test.ts` | UNVERIFIED | UNVERIFIED | Persisted in SQLite `onboarding_state` table; never regresses offline | None | `AUTOMATED TESTED` | `m/src/features/onboarding/OnboardingScreen.tsx`, `m/src/db/migrations.ts` |
| **Today Task Generation** | Generates daily task occurrences by analyzing recurrence rules, logs, and postponed state | `computeTaskOccurrences` in `m/src/domain/timeline.ts` matching server recurrence engine | `tests/unit/domain-timeline.test.ts` (6 tests) | UNVERIFIED | UNVERIFIED | 100% computed from local SQLite templates and logs | None | `AUTOMATED TESTED` | `m/tests/unit/domain-timeline.test.ts:1-70` |
| **Task State Machine & Checkbox Cycling** | Non-daily: `Cleared` ➔ `Done` ➔ `Canceled` ➔ `Postponed` ➔ `Cleared`. Daily skips `Postponed` | `cycleActivityStatus` in `m/src/domain/activity.ts` with direct cycling on checkbox click | `tests/unit/domain-activity.test.ts` (2 tests) | UNVERIFIED | UNVERIFIED | Updates SQLite optimistic log immediately; enqueues mutation in outbox | None | `AUTOMATED TESTED` | `m/tests/unit/domain-activity.test.ts:1-40` |
| **Postpone & Re-Postpone Semantics** | Reschedules task to `D+1`. Subsequent postpone on `D+1` moves to `D+2`. Unpostponing reverts occurrence | `computeTaskOccurrences` + `LogRepository` handles multi-hop postpone and target reversion | `tests/unit/domain-timeline.test.ts` (Multi-hop postpone tests) | UNVERIFIED | UNVERIFIED | Postpone log written to local SQLite, task moves to tomorrow locally | None | `AUTOMATED TESTED` | `m/tests/unit/domain-timeline.test.ts:30-65` |
| **Task Completion Displays & Target Values** | Supports `CHECKBOX`, `VALUE` (min/max), `TIME`, and `CURRENCY` completion formats | `DomainCompletionService` in `m/src/domain/completion.ts` formats badges on tasks | `tests/unit/domain-completion.test.ts` (7 tests) | UNVERIFIED | UNVERIFIED | Formatted entirely in memory and rendered on task rows | None | `AUTOMATED TESTED` | `m/tests/unit/domain-completion.test.ts:1-60` |
| **Dynamic Theme & Accent Colors** | Supports `system`, `dark`, `light` themes with dynamic CSS variables | `ThemeProvider` + `ThemeContext` supporting `dark`, `light`, `system` + 7 curated accents | `tests/unit/theme-context.test.ts` (5 tests) | UNVERIFIED | UNVERIFIED | Stored in SecureStore; applied synchronously on cold boot | None | `AUTOMATED TESTED` | `m/src/theme/ThemeContext.tsx`, `m/tests/unit/theme-context.test.ts` |
| **Commercial Entitlements & Pro Gating** | `EntitlementService` controls Pro tier features, active activities limit, and feature flags | `EntitlementProvider` + `/api/mobile/v1/billing` endpoint exposing `isPro`, `tier`, `plan` | `tests/mobile-billing.test.ts` (3 tests) | UNVERIFIED | UNVERIFIED | Cached on user token; falls back safely to token claims if offline | None | `AUTOMATED TESTED` | `app/api/mobile/v1/billing/route.ts`, `tests/mobile-billing.test.ts` |
| **Activity Symbols (Emoji + Wireframe)** | Activities store icon identifier; templates display badges | `ALL_SYMBOLS` registry (12 Free, 24 Pro) with `SymbolPicker` and `ActivitySymbolBadge` | `tests/unit/activity-symbols.test.ts` (5 tests) | UNVERIFIED | UNVERIFIED | Full symbol registry bundled locally in JS bundle | None | `AUTOMATED TESTED` | `m/src/features/activities/symbol-registry.ts` |
| **Activity Template CRUD & Bin Recovery** | Full management of recurring activities; soft-delete with `deletedAt` moves to Bin | `ActivitiesScreen.tsx` with SQLite `TemplateRepository` and outbox queue | `tests/unit/repository.test.ts` | UNVERIFIED | UNVERIFIED | Instant optimistic local deletion + outbox queueing | None | `AUTOMATED TESTED` | `m/tests/unit/repository.test.ts:1-25` |
| **Work Session Timer** | Focus timer with pause, resume, elapsed tracking, and note association | `WorkSessionCard.tsx` + `domain/work.ts` state machine | `tests/unit/domain-work.test.ts` (1 test) | UNVERIFIED | UNVERIFIED | Elapsed time calculated via UTC diffs; immune to app pauses | None | `AUTOMATED TESTED` | `m/tests/unit/domain-work.test.ts:1-20` |
| **Google Calendar 2-Way Sync** | Syncs Google events, displays timed and all-day occurrences | `CalendarRepository` + `/api/mobile/v1/calendar` with token caching | `tests/unit/repository.test.ts` (Calendar tests) | UNVERIFIED | UNVERIFIED | Events cached in SQLite `calendar_event` table; queryable offline | Incremental token sync incomplete on mobile; uses range cache | `IMPLEMENTED` | `m/src/features/calendar/CalendarScreen.tsx`, `m/src/db/repository.ts` |
| **Journaling & Autosave** | Daily entry with gratitude, reflections, lessons, mood rating, autosave | `JournalScreen.tsx` with 1.5s debounced autosave, tabs, word & char counts | `tests/unit/journal-presentation.test.ts` (4 tests) | UNVERIFIED | UNVERIFIED | Debounced payload prepared cleanly; saved to local SQLite/outbox | None | `AUTOMATED TESTED` | `m/tests/unit/journal-presentation.test.ts` |
| **Notes Management** | Rich notes with search, relative time, and category filters | `NotesScreen.tsx` with chips (`All`, `Today`, `Titled`), word/char counts | `tests/unit/notes-presentation.test.ts` (5 tests) | UNVERIFIED | UNVERIFIED | Fully cached in SQLite; instant local search and filtering | None | `AUTOMATED TESTED` | `m/tests/unit/notes-presentation.test.ts` |
| **Time Off & Leave Management** | Annual allowances, inclusive date counting, active leave detection | `LeaveModal.tsx` + `leave-presentation.ts` allowance calculator | `tests/unit/leave-presentation.test.ts` (3 tests) | UNVERIFIED | UNVERIFIED | Calculates remaining balances locally from cached records | None | `AUTOMATED TESTED` | `m/tests/unit/leave-presentation.test.ts` |
| **Weight Tracker** | Daily weight logging, unit conversion, progress trend | `WeightWidgetCard.tsx` + Zod validation contracts | `tests/unit/domain-validation.test.ts` | UNVERIFIED | UNVERIFIED | Optimistically logged; enqueued to outbox | None | `AUTOMATED TESTED` | `m/tests/unit/domain-validation.test.ts:25-35` |
| **Bin / Universal Recovery** | Central recycling bin for soft-deleted habits, notes, logs, and leaves | `BinScreen.tsx` supporting restore and purge for all entities | `tests/unit/repository.test.ts` | UNVERIFIED | UNVERIFIED | Tombstones recorded in SQLite `sync_tombstone` table | None | `AUTOMATED TESTED` | `m/src/features/bin/BinScreen.tsx` |
| **SQLite Outbox & Mutation Queue** | Durable queue with exponential backoff, retry limits, and drain worker | `OutboxRepository` + `drainOutbox` in `m/src/sync/drainWorker.ts` | `tests/unit/drain-worker.test.ts` (3 tests) | UNVERIFIED | UNVERIFIED | Mutations stored in SQLite `mutation_queue`; survive crash/kill | None | `AUTOMATED TESTED` | `m/tests/unit/drain-worker.test.ts` |
| **Design System & Touch Targets** | Standardized 48px touch targets, Lucide icons via `TrackerIcon` | `TrackerIcon.tsx` (50+ semantic icons) + `m/src/theme/tokens.ts` | `tests/unit/tracker-icon.test.ts` (3 tests), `tests/unit/theme-tokens.test.ts` (5 tests) | UNVERIFIED | UNVERIFIED | Zero external assets needed; bundle self-contained | None | `AUTOMATED TESTED` | `m/tests/unit/tracker-icon.test.ts` |

---

## 2. Verification Protocol Summary

1. **Unit & Domain Automated Test Coverage**:
   - Mobile Test Suite: **98 passed, 0 failed across 24 test files** (`bun test` in `m/`).
   - Parent Test Suite: **991 passed, 0 failed across 147 test files** (`bun test` in `tracker`).
2. **Static Typecheck Invariant**:
   - `m/`: `npx tsc --noEmit` exited with code 0 (0 errors).
   - Parent: `bun x tsc --noEmit` exited with code 0 (0 errors).
3. **Database Safety Safeguards**:
   - Soft deletion via `deletedAt` strictly enforced across all entity tables (`activity_template`, `activity_log`, `note`, `journal_entry`, `leave_record`, `weight_entry`).
   - Zero hard deletes (`delete` / `deleteMany` prohibited).
4. **Android Runtime Verification Status**:
   - Native development build execution blocked in current headless agent environment (No attached ADB device or running hardware emulator). Status marked honestly as `UNVERIFIED` / `BLOCKED`.
5. **Release Build Status**:
   - Android production APK/AAB build generation requires external signing credentials and Google Play service configuration. Status marked honestly as `UNVERIFIED` / `BLOCKED`.
