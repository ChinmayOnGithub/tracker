# Tracker Web → Android Parity Matrix

**Date**: 2026-10-02  
**Parent Repository**: [ChinmayOnGithub/tracker](https://github.com/ChinmayOnGithub/tracker)  
**Mobile Repository / Submodule**: [ChinmayOnGithub/tracker-mobile](https://github.com/ChinmayOnGithub/tracker-mobile) (`m/`)  
**Parent HEAD**: `3e22d2acc8c3b411136d78d3464d3c22340313b8`  
**Mobile HEAD**: `ab10c6b44cb3b0ae6d091aeca4bd74b673a793a0`  

---

## 1. Feature Parity & Verification Audit

Status Classification Standards:
- `IMPLEMENTED + RUNTIME PROVEN`: Implemented, tested, and actively executed/proven in the Android runtime environment.
- `IMPLEMENTED + TEST PROVEN`: Fully implemented and validated via automated Bun/TS unit & integration test suites.
- `IMPLEMENTED + STATIC ONLY`: Compiles and passes typecheck/lint, pending automated test coverage.
- `PARTIAL`: Fundamental data structures or partial UI exist; remaining lifecycle/outbox work required.
- `PLANNED`: Specced and ready for implementation.
- `BLOCKED`: Dependency or environment limitation prevents progress.
- `WEB ONLY`: Browser/DOM-specific feature (e.g. SEO, web popups) not applicable to native mobile.
- `SERVER ONLY`: Server-side responsibility (e.g. billing reconciliation, Google webhook sync, entitlement validation).

| Module / Capability | Existing Implementation | Reusable Server / Domain Code | Native UI Work | API Endpoint | Offline & Storage | Test Coverage | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication & Registration** | `LoginScreen.tsx` with Sign In / Register tabs, SecureStore persistence, `AuthProvider.tsx` | `AuthService.login`, `AuthService.register`, `CredentialService` | Native Inputs, password visibility toggle, error displays | `/api/mobile/v1/auth/login`, `/register`, `/me` | `expo-secure-store` for JWT session tokens (never SQLite) | `auth-state.test.ts`, `api-client.test.ts`, `mobile-auth.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Today Dashboard** | `TodayScreen.tsx` with date navigation switcher, progress bar, checklist state cycling | `domain/recurrence.ts`, `domain/activity.ts` state machine | Date switcher bar, progress bar, embedded WorkSessionCard & WeightWidgetCard | `/api/mobile/v1/activities/templates`, `/logs` | SQLite caching of templates & daily logs | `date-utils.test.ts`, `foundation-flows.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Activities Management** | `ActivitiesScreen.tsx` with category filter pills, search, creation modal, color palette, soft delete | `domain/validation.ts`, `TemplateService.getUserTemplates`, `createTemplate` | Category pills, template cards, creation modal, soft delete dialog | `/api/mobile/v1/activities/templates`, `/templates/[id]` | SQLite template caching via `cacheTemplates` | `domain-activity.test.ts`, `domain-validation.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Activity Logs & Cycling** | Checklist cycling (cleared ➔ done ➔ canceled ➔ postponed ➔ cleared) | `ActivityService.logActivity`, recurrence rescheduling on postpone | Occurrence checkbox button with Lucide icons | `/api/mobile/v1/activities/logs` | Local optimistic state mutation | `domain-activity.test.ts`, `domain-recurrence.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Work Session** | `WorkSessionCard.tsx` with live ticking timer, start, pause, resume, finish, Office/WFH toggle | `domain/work.ts` (`calculateWorkSessionElapsed` with authoritative `startedAt = entered start` invariant), `WorkSessionService` | Live timer card, duration formatting, presence switch | `/api/mobile/v1/work/session` (GET, POST start/manual, PATCH, DELETE) | Local memory ticking; server persistence | `domain-work.test.ts`, `mobile-api-work-and-weight.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Weight Tracking** | `WeightWidgetCard.tsx` with 7-day recent weight display, log modal, automatic habit provisioning | `WeightService`, `logWeight`, `deleteWeightRecord` | 7-day weight row, quick log modal with decimal keypad | `/api/mobile/v1/weight` (GET history, POST log, DELETE) | Local memory history; server persistence | `domain-validation.test.ts`, `mobile-api-work-and-weight.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Journal** | `JournalScreen.tsx` with date switcher, 5 mood selectors, entry/gratitude/plan tabs, word count, save/delete | `JournalService.getByDate`, `JournalService.upsert`, `JournalService.delete`, `ActivityService` auto-link | Date navigator, mood chip selector, multiline native editor, word counter, status indicator | `/api/mobile/v1/journal` (GET date, POST upsert, DELETE) | Server persistence; local form dirty state | `mobile-api-journal.test.ts` (5/5 pass) | **IMPLEMENTED + RUNTIME PROVEN** |
| **Notes** | `NotesScreen.tsx` with live search, notes card list, full create/edit modal, word counter, soft delete | `db.note` repository, version counter incrementing, soft delete | Notes cards, search bar, create/edit modal, word count | `/api/mobile/v1/notes` (GET list, POST create, PATCH update, DELETE) | Server persistence; local search filtering | `mobile-api-notes.test.ts` (5/5 pass) | **IMPLEMENTED + RUNTIME PROVEN** |
| **Bin (Trash & Recovery)** | `BinScreen.tsx` with module filter chips (All, Journal, Notes, Activities, Weight), single-tap restore | Universal soft-delete model (`deletedAt != null` on tables) | Unified Bin list, entity icon badges, single-tap restore with alert | `/api/mobile/v1/bin` (GET aggregate, POST restore) | Server persistence | `mobile-api-bin.test.ts` (4/4 pass) | **IMPLEMENTED + RUNTIME PROVEN** |
| **Settings & Account** | `SettingsScreen.tsx` with profile info, account role, direct Bin launcher card, storage architecture, sign out | `AuthService.resolveAuthFromRequest`, user identity | Profile card, direct Bin navigation button, storage info, sign-out dialog | `/api/mobile/v1/auth/me` | Token removal from SecureStore on logout | `foundation-flows.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Recurrence Analysis** | Domain recurrence engine | `calculateNextDueDate`, `isActivityDueOnDate`, `addUTCDays` | N/A (pure domain computation) | Internal | N/A | `domain-recurrence.test.ts` (3/3 pass) | **IMPLEMENTED + TEST PROVEN** |
| **Conflict Resolution** | Domain conflict engine | `resolveConflict`, `arePayloadsEquivalent` | N/A (domain state machine) | Internal | N/A | `domain-conflict.test.ts` (3/3 pass) | **IMPLEMENTED + TEST PROVEN** |
| **Offline Cache** | SQLite database migrations 1 and 2 | `schema.prisma` mapping | N/A (persistence layer) | Internal | `expo-sqlite` tables: `activity_template`, `activity_log`, `sync_state`, `mutation_queue` | `db-migrations.test.ts`, `foundation-flows.test.ts` | **IMPLEMENTED + RUNTIME PROVEN** |
| **Mutation Outbox** | SQLite migration 2 table `mutation_queue` | Outbox pattern | Background sync indicator | Internal | Local SQLite table `mutation_queue` | `db-migrations.test.ts` | **PARTIAL** (Schema ready; dispatchers to be wired) |
| **Sync Engine** | `SafeSyncEngine` boundary | Server `/api/mobile/sync` | Sync status in settings | `/api/mobile/sync` | Caches sync token in `sync_state` | `sync-contract.test.ts`, `sync-verification.test.ts` | **PARTIAL** (Safe boundary active pending multi-entity pagination) |
| **Entitlements** | Server entitlement checking | `EntitlementService.hasFeature` | Feature gate error handling | Server internal | Server database | `security-suite-76.test.ts` | **SERVER ONLY** |
| **Google Calendar Sync**| Server background webhook | `GoogleCalendarService.ts`, lease lock | Event occurrence display | Server webhook | Server database | `calendar-sync.test.ts` | **SERVER ONLY** |
| **Calendar View** | Web `/calendar` views | Recurrence timeline occurrence generator | Native agenda list view, event detail card | `/api/calendar` | Planned SQLite cache | Not started | **PLANNED** |
| **Link Library** | Web `/links` collections | `LinkCollection`, `SavedLink`, `LinkTag` | Link cards, category tabs, external browser launcher | `/api/links` | Planned SQLite cache | Not started | **PLANNED** |
| **Vault** | Web `/vault` secure storage | AES-256-GCM encryption, `SecureDocument` | Passphrase unlock modal, file card list, upload/download | `/api/vault` | Memory-only keys | Not started | **PLANNED** |
| **Notifications** | Prisma template notification rules | Notification rule schemas | Native push / local scheduled reminders | Device push | Local notifications API | Not started | **PLANNED** |

---

## 2. Icon System Standardization
- **Canonical Family**: Lucide
- **Web**: `lucide-react`
- **Mobile**: `lucide-react-native` + `react-native-svg` (`15.15.4`)
- **Semantic Component**: `m/src/components/TrackerIcon.tsx`
  - Semantic names: `home`, `calendar`, `activity`, `work`, `weight`, `journal`, `notes`, `trash`, `settings`, `check`, `x`, `clock`, `plus`, `edit`, `restore`, etc.
  - Uniform sizes: `xs` (14), `sm` (18), `md` (22), `lg` (26), `xl` (32).
  - Controlled registry preventing dynamic bundle bloat.
  - Fully tested: `m/tests/unit/tracker-icon.test.ts` (81 assertions pass).

---

## 3. Styling & Token Architecture
- **Decision**: Maintained the robust React Native `StyleSheet` + semantic token system (`m/src/theme/tokens.ts`).
  - Colors: Aligned with Tracker's canonical brand palette (Background `#090b0e`, Surface `#14171d`, Brand Coral `#ff7557`, Primary Indigo `#6366f1`, Success `#22c55e`, Danger `#ef4444`).
  - Radius: Consistent scale (`sm`: 8, `md`: 12, `lg`: 16, `full`: 9999).
  - Spacing: 4px base (`xs`: 4, `sm`: 8, `md`: 16, `lg`: 24, `xl`: 32, `xxl`: 48).
  - Accessibility: Minimum 48px touch targets enforced across all interactive components.
