# Tracker Web → Android Parity Matrix

**Date**: 2026-10-02  
**Parent Repository**: [ChinmayOnGithub/tracker](https://github.com/ChinmayOnGithub/tracker)  
**Mobile Repository / Submodule**: [ChinmayOnGithub/tracker-mobile](https://github.com/ChinmayOnGithub/tracker-mobile) (`m/`)  
**Architecture Principle**: One Tracker product. Canonical business/domain rules and database schemas are shared and authoritative; presentation is optimized natively for Android (React Native, Expo Router, Lucide icons, touch ergonomics).

---

## 1. Feature Parity Matrix

| Feature | Web Implementation | Existing Mobile State | Domain Reuse | API Available | Native Work Needed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication & Registration** | `AuthView.tsx`, `app/actions/auth.ts`, `AuthService.ts` (passwords & legacy PINs, rate limiting) | `LoginScreen.tsx` (Sign In / Register tabs, show/hide password), `AuthProvider.tsx`, `SecureStore` token storage | Pure domain reuse (`AuthService.login`, `AuthService.register`) | `/api/mobile/v1/auth/login`, `/api/mobile/v1/auth/register`, `/api/mobile/v1/auth/me` | Native input styling, keyboard avoidance, biometric unlock (future) | **Implemented** |
| **Today Dashboard** | `TodayDashboard.tsx`, timeline occurrence generator, checklist state cycling, widgets (Work, Journal, Weight) | `TodayScreen.tsx` (template/log fetching, status toggle, SQLite caching) | `domain/recurrence.ts`, `domain/activity.ts` status machine | `/api/mobile/v1/activities/templates`, `/api/mobile/v1/activities/logs` | Native date switcher, task progress ring/bar, work hours timer card, widget integration | **Partially Implemented** |
| **Activities Management** | `/activities`, `ActivityService.ts`, full CRUD, recurrence rule analysis, category filters, soft delete | `ActivitiesScreen.tsx` with search and offline SQLite caching | `domain/validation.ts`, `domain/recurrence.ts` | `/api/mobile/v1/activities/templates`, `/api/mobile/v1/activities/logs` | Create/Edit activity modal sheet, recurrence picker, delete confirmation | **Partially Implemented** |
| **Work Session (Timer)** | `WorkHoursWidget.tsx`, `WorkSessionService.ts`, presence logging, pause segments, authoritative start rule | `domain/work.ts` state machine & elapsed calculator | `domain/work.ts` (`calculateWorkSessionElapsed`) | `/api/mobile/v1/work/session` (to be mounted) | Work timer card, start/stop/pause button, time adjustment modal | **In Progress** |
| **Weight Tracking** | `/weight`, `WeightWidget.tsx`, `WeightService.ts`, historical logs | `domain/validation.ts` (`createWeightSchema`) | Validation schema, decimal units | `/api/mobile/v1/weight` (to be mounted) | Weight entry modal, recent history list, weight trend card | **In Progress** |
| **Journal** | `/journal`, `JournalService.ts`, daily reflections, rich formatting, image attachments, memories | Not started | Journal entry date semantics, media upload rules | `/api/mobile/v1/journal` (to be mounted) | Native text editor, date navigator, image picker, offline drafting | **Planned** |
| **Notes** | `/notes`, `NotesService.ts`, collections, pinning, tags, freeform ideas | Not started | Notes data model & tags | `/api/mobile/v1/notes` (to be mounted) | Card list, search, tag filters, note detail editor | **Planned** |
| **Calendar** | `/calendar`, `CalendarService.ts`, `GoogleCalendarService.ts`, Agenda/Day/Month, Google Sync | `domain/recurrence.ts` timeline occurrences | Recurrence generation, agenda formatting | `/api/mobile/v1/calendar` (to be mounted) | Native agenda list view, event detail card, sync status badge | **Planned** |
| **Link Library** | `/links`, `LinkService.ts`, collections, tags, URL preview | Not started | Link data contracts | `/api/mobile/v1/links` (to be mounted) | Link cards, category tabs, copy/open external URL actions | **Planned** |
| **Vault** | `/vault`, `VaultService.ts`, client/server encryption, secure file store, access control | Not started | Encryption & file metadata rules | `/api/mobile/v1/vault` (to be mounted) | Passphrase unlock gate, file list, upload picker, secure download | **Planned** |
| **Bin / Trash** | `/bin`, `BinService.ts`, soft-deleted entity aggregation (`deletedAt !== null`), restore, delete forever | SQLite Migration 2 has `deleted_at` and tombstone propagation | Unified tombstone model | `/api/mobile/v1/bin` (to be mounted) | Trash item list by module, single/bulk restore, permanent purge | **Planned** |
| **Settings & Account** | `/settings`, `SettingsService.ts`, profile info, theme options, entitlements | `SettingsScreen.tsx` (username, email, sync/offline info, sign out) | Entitlement contracts (`domain/contracts/entitlements.ts`) | `/api/mobile/v1/auth/me`, `/api/mobile/v1/settings` | Personal accent color selector, SQLite cache reset, app version info | **Partially Implemented** |

---

## 2. Icon System Standardization
- **Canonical Family**: Lucide
- **Web**: `lucide-react`
- **Mobile**: `lucide-react-native`
- **Abstraction**: `TrackerIcon` in `m/src/components/TrackerIcon.tsx`
  - Semantic names: `home`, `calendar`, `activity`, `work`, `weight`, `journal`, `notes`, `link`, `vault`, `trash`, `settings`, `check`, `x`, `plus`, `edit`, `restore`, etc.
  - Uniform sizes: `xs` (14), `sm` (18), `md` (22), `lg` (26), `xl` (32).
  - Controlled registry preventing dynamic bundle bloat.

---

## 3. Styling & Token Architecture
- **Decision**: Maintained the robust `StyleSheet` + semantic token system (`m/src/theme/tokens.ts`).
  - Colors: Aligned with Tracker's canonical brand palette (Background `#090b0e`, Surface `#14171d`, Brand Coral `#ff7557`, Primary Indigo `#6366f1`, Success `#22c55e`, Danger `#ef4444`).
  - Radius: Consistent scale (`sm`: 8, `md`: 12, `lg`: 16, `full`: 9999).
  - Spacing: 4px base (`xs`: 4, `sm`: 8, `md`: 16, `lg`: 24, `xl`: 32, `xxl`: 48).
  - Accessibility: Minimum 48px touch targets enforced across all interactive components.

---

## 4. Next Implementation Execution Steps
1. **Work Session Vertical Slice**:
   - Backend endpoint: `/api/mobile/v1/work/session` (start, pause, resume, finish).
   - Domain reuse: `calculateWorkSessionElapsed` with authoritative `startedAt = entered start` invariant.
   - Mobile UI: Work timer card on Today screen and dedicated Work modal.
2. **Weight Vertical Slice**:
   - Backend endpoint: `/api/mobile/v1/weight` (log, list, delete).
   - Mobile UI: Quick weight entry and trend chart.
3. **Activities Complete CRUD**:
   - Create and Edit template modal sheet with recurrence selector.
4. **Offline Sync & Outbox**:
   - Queue local mutations into SQLite `mutation_queue` and dispatch idempotently.
