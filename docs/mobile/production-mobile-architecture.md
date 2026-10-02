# Tracker Mobile — Production Architecture Audit

**Date**: 2026-10-02
**Mobile Commit**: `a642aa0` | **Parent Commit**: `1a05c9b`

---

## 1. Technology Stack

| Concern | Current | Status |
|---|---|---|
| Expo SDK | 57.0.26 | CURRENT |
| React Native | 0.86.3 | CURRENT |
| Expo Router | 57.0.24 | File-based routing |
| TypeScript | 5.9.3 | Strict mode |
| SQLite | expo-sqlite 57.0.3 | Present |
| SecureStore | expo-secure-store 57.0.4 | Session token only |
| Dev client | expo-dev-client 57.0.19 | For native builds |
| EAS | eas.json: dev / preview / production | Configured |
| Icons | lucide-react-native via TrackerIcon | Semantic abstraction |

---

## 2. Architecture Diagram (Current State)

```
UI (Screen components)
 |
useFocusEffect / useState / useCallback
 |
trackerApi.* (direct API client call)
 |
Server -> Postgres

           (cache-after-fetch / fallback-on-error)

     SQLite (activity_template, activity_log)
```

**Gap**: No Repository layer. Screens call API and SQLite directly.

**Target architecture**:

```
Screen
 |
Hook / ViewModel
 |
Repository
 |
SQLite (primary local truth)
 |
Outbox + Sync Engine
 |
Tracker API
```

---

## 3. Source-of-Truth Assessment

| Concern | Current State | Gap |
|---|---|---|
| Server | Authoritative remote truth | None |
| SQLite | Partial write-through cache after fetch | Not primary read path |
| React state | Screen-local copy of templates/logs | Domain data in useState |
| SecureStore | Session token only | Correct |
| UI state | Mixed with domain state | selectedDate/viewMode/loading mixed with data |

**Critical Gap**: Today screen loads templates/logs into React state first, then caches to SQLite. Correct flow: render from SQLite immediately, reconcile from server in background.

---

## 4. SQLite Architecture

| Concern | Current | Status |
|---|---|---|
| WAL mode | PRAGMA journal_mode = WAL | IMPLEMENTED |
| Foreign keys | PRAGMA foreign_keys = ON | IMPLEMENTED |
| Migrations | Sequential versioned via schema_migrations | IMPLEMENTED |
| Transactions | withTransactionAsync for multi-row ops | IMPLEMENTED |
| Schema versioning | schema_migrations tracks applied versions | IMPLEMENTED |
| Indexes | date, activity_date, mutation_queue | PARTIAL |

### Missing Tables

Missing for production:
- `calendar_event` — local cache of Google Calendar events
- `onboarding_state` — persist across app restarts
- `notification_state` — scheduled notification IDs
- `tombstones` — deleted entity IDs for sync deduplication

---

## 5. Repository Layer

| Concern | Current | Status |
|---|---|---|
| Repository abstraction | None | MISSING |
| getCachedTemplates | Global function in database.ts | Not a repository |
| cacheLogs | Global function in database.ts | Not a repository |
| Domain-oriented operations | Not present | MISSING |

Required: `TemplateRepository`, `LogRepository`, `CalendarRepository`, `OutboxRepository` with operations like `getTodayTasks(date)`, `completeTask(id)`, `getCalendarEvents(range)`.

---

## 6. Outbox (Mutation Queue)

| Concern | Current | Status |
|---|---|---|
| Schema | id, entity_type, entity_id, operation, payload_json, version, created_at | EXISTS but incomplete |
| Atomic mutations | Not implemented — direct API calls | MISSING |
| Retry logic | Not implemented | MISSING |
| mutation_id / attempt_count / status / last_error | Not in schema | MISSING |
| Drain worker | SafeSyncEngine.triggerSync is no-op | Intentionally bounded |

**Gap**: `mutation_queue` table exists but nothing writes to it. All mutations go directly to the API. Network failure = mutation lost.

**Required schema additions**:
- `mutation_id TEXT` — stable idempotency key
- `attempt_count INTEGER DEFAULT 0`
- `next_attempt_at TEXT`
- `status TEXT DEFAULT 'pending'` (pending/processing/done/failed)
- `last_error TEXT`

---

## 7. Sync Engine

| Concern | Current | Status |
|---|---|---|
| Central sync engine | SafeSyncEngine — intentional no-op boundary | CORRECTLY BOUNDED |
| Reason | Server lacks monotonic changelog or restartable cursor | Documented |
| Foreground reconciliation | useFocusEffect -> loadData() per screen | IMPLEMENTED |
| Concurrent sync protection | N/A while bounded | N/A |
| Network awareness | Not implemented | MISSING |
| AppState foregrounding | Not implemented | MISSING |

---

## 8. Auth and Session

| Concern | Current | Status |
|---|---|---|
| SecureStore for token | tracker.session.token via AFTER_FIRST_UNLOCK | IMPLEMENTED |
| Cold start restore | AuthProvider -> getToken() -> trackerApi.me() | IMPLEMENTED |
| 401 handling | performFetch fires sessionExpired -> AuthProvider clears user | IMPLEMENTED |
| Session state machine | isLoading / user != null / error | IMPLEMENTED |
| Token refresh | Not implemented (JWT long-lived) | ACCEPTABLE for MVP |
| Onboarding check | app/index.tsx checks onboarding on cold start | IMPLEMENTED |

---

## 9. Navigation and Routing

| Concern | Current | Status |
|---|---|---|
| Protected routes | (auth) / (app) separation | IMPLEMENTED |
| Tab navigation | 6 tabs: Today, Activities, Calendar, Journal, Notes, Settings | IMPLEMENTED |
| Typed routes | typedRoutes: true | IMPLEMENTED |
| Deep link scheme | tracker:// for OAuth callback | IMPLEMENTED |
| Tab state preservation | Default Expo Router behavior | IMPLEMENTED |
| unmountOnBlur | Not used | CORRECT |

---

## 10. Theme and Dark Mode

| Concern | Current | Status |
|---|---|---|
| Theme tokens | tokens.ts — single dark palette only | DARK ONLY |
| userInterfaceStyle | automatic in app.json | MISMATCH — no light palette |
| Semantic color usage | All screens use colors.* tokens | CONSISTENT |
| Raw color literals | Some rgba() literals in StyleSheet | MINOR |
| Light theme | Not implemented | MISSING |

---

## 11. Accessibility

| Concern | Current | Status |
|---|---|---|
| accessibilityRole | Present on buttons and tabs | PARTIAL |
| accessibilityLabel | Present on navigation controls | PARTIAL |
| accessibilityState | Used on calendar mode tabs | PARTIAL |
| accessibilityHint | Missing on most controls | MISSING |
| Task status semantic labels | Missing — visual text only | MISSING |
| Minimum touch targets | layout.minTouchTarget = 48px enforced via test | IMPLEMENTED |

---

## 12. Performance

| Concern | Current | Status |
|---|---|---|
| List rendering | View + map() — not virtualized | OK for small lists |
| Large task lists | No FlashList | Needed at scale |
| Memoization | useMemo for computeTaskOccurrences | IMPLEMENTED |
| Heavy work during render | None identified | CLEAN |
| Prefetching | Not implemented | MISSING |
| Performance instrumentation | Not implemented | MISSING |
| Tab remount on blur | Not configured to unmount | CORRECT |

---

## 13. Network and Offline

| Concern | Current | Status |
|---|---|---|
| Network detection | Not implemented | MISSING |
| Offline fallback | SQLite fallback in TodayScreen catch block | PARTIAL |
| Offline mutations | Not implemented — mutations fail offline | MISSING |
| Optimistic UI | Not implemented — UI waits for API | MISSING |
| AppState foregrounding | Not implemented | MISSING |

---

## 14. Security

| Concern | Current | Status |
|---|---|---|
| Secrets in SecureStore | Token stored correctly | IMPLEMENTED |
| Secrets in logs | No token logging identified | CLEAN |
| Deep link validation | auth-callback.tsx validates token/username | IMPLEMENTED |
| API authorization | All calls use Bearer token | IMPLEMENTED |
| AsyncStorage for secrets | Not used | CORRECT |
| SecureStore Android backup | configureAndroidBackup: true | IMPLEMENTED |

---

## 15. Testing

| Concern | Current | Status |
|---|---|---|
| Unit tests | 44 pass — domain, db, sync, tokens, api-client | IMPLEMENTED |
| Integration tests | 2 pass — foundation flows | MINIMAL |
| Repository tests | None — no repositories yet | MISSING |
| Outbox tests | Sync contract (no-op boundary) | BOUNDED |
| Auth tests | Auth state validation | PARTIAL |
| UI/accessibility tests | None | MISSING |

---

## 16. Production Hardening — Priority Queue

### P0 (Blocking for offline-capable production)

1. **Outbox schema hardening** — add `mutation_id`, `attempt_count`, `next_attempt_at`, `status`, `last_error`
2. **Atomic local mutations** — SQLite + outbox in one transaction before API call
3. **Optimistic UI** — render SQLite state immediately; reconcile in background
4. **Network awareness** — detect offline/online state, gate sync accordingly
5. **AppState foregrounding** — freshness check on background -> active transition

### P1 (Production quality)

6. **Repository layer** — `TemplateRepository`, `LogRepository`, `CalendarRepository`, `OutboxRepository`
7. **Light theme** — complete second palette and dynamic token switching
8. **Accessibility hardening** — `accessibilityHint` on all controls, task status labels
9. **Calendar event SQLite cache** — `calendar_event` table for offline calendar rendering
10. **Prefetching** — fetch tomorrow + adjacent calendar range after interactive

### P2 (Polish and observability)

11. **Performance instrumentation** — cold start, screen mount, SQLite query timing
12. **Development sync debug screen** — auth, network, outbox count, last sync, DB row counts
13. **FlashList migration** — for activities list at scale
14. **Notification state table** — persist scheduled notification IDs
15. **Tombstone table** — deleted entity IDs for sync deduplication

---

## 17. Runtime Validation Status

| Feature | Status |
|---|---|
| Google OAuth cold start | STATIC-VALIDATED |
| Session restore | STATIC-VALIDATED |
| Today screen offline fallback | STATIC-VALIDATED |
| Task cycling (state machine) | TEST-VALIDATED — unit tests pass |
| Calendar month/week/day | STATIC-VALIDATED |
| SQLite migrations | TEST-VALIDATED |
| Onboarding flow | STATIC-VALIDATED |
| Dark mode rendering | STATIC-VALIDATED |
| Android native build | NOT RUNTIME-VALIDATED — no device connected |
| iOS native build | NOT RUNTIME-VALIDATED |

---

## 18. Final Status Table

| Category | Status |
|---|---|
| Architecture | PARTIAL — no repository layer; screens call API/SQLite directly |
| SQLite | IMPLEMENTED — WAL, migrations, indexes, transactions |
| Caching | PARTIAL — write-through after fetch; not primary read path |
| Outbox | PARTIAL — schema exists; no atomic mutations, no drain |
| Sync | IMPLEMENTED (bounded) — SafeSyncEngine correctly disabled |
| Session | IMPLEMENTED — SecureStore, cold start, 401 handling |
| Navigation | IMPLEMENTED — protected routes, tabs, deep links |
| Performance | PARTIAL — memoization present; no instrumentation or prefetch |
| Accessibility | PARTIAL — roles/labels present; hints and task labels missing |
| Permissions | IMPLEMENTED — minimal, no unnecessary permissions |
| Theme | PARTIAL — dark only; no light theme |
| Background work | NOT IMPLEMENTED — foreground reconciliation only |
| Security | IMPLEMENTED — SecureStore only, no log leaks |
| Testing | PARTIAL — 44 unit tests; no repository/UI tests |
| Runtime validation | NOT RUNTIME-VALIDATED — environment limitation |
