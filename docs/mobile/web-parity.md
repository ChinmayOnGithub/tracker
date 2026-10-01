# Tracker Web → Android Parity Matrix

**Date**: 2026-10-02  
**Parent Repository**: [ChinmayOnGithub/tracker](https://github.com/ChinmayOnGithub/tracker)  
**Mobile Repository / Submodule**: [ChinmayOnGithub/tracker-mobile](https://github.com/ChinmayOnGithub/tracker-mobile) (`m/`)  
**Architecture Principle**: One Tracker product. Canonical business/domain rules and database schemas are shared and authoritative; presentation is optimized natively for Android (React Native, Expo Router, Lucide icons, touch ergonomics).

---

## 1. Feature Parity Matrix

| Feature | Web Implementation | Mobile State | Domain Reuse | API Available | Native Work Done | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication & Registration** | `AuthView.tsx`, `app/actions/auth.ts`, `AuthService.ts` (passwords & legacy PINs, rate limiting) | `LoginScreen.tsx` (Sign In / Register tabs, show/hide password), `AuthProvider.tsx`, `SecureStore` token storage | Pure domain reuse (`AuthService.login`, `AuthService.register`) | `/api/mobile/v1/auth/login`, `/api/mobile/v1/auth/register`, `/api/mobile/v1/auth/me` | Native input styling, keyboard avoidance, SecureStore token persistence | **Implemented** |
| **Today Dashboard** | `TodayDashboard.tsx`, timeline occurrence generator, checklist state cycling, widgets (Work, Journal, Weight) | `TodayScreen.tsx` with date switcher bar, progress indicator, embedded WorkSessionCard & WeightWidgetCard, checklist state cycling | `domain/recurrence.ts`, `domain/activity.ts` status machine | `/api/mobile/v1/activities/templates`, `/api/mobile/v1/activities/logs` | Native date switcher bar, task progress bar, embedded work hours timer card, weight card | **Implemented** |
| **Activities Management** | `/activities`, `ActivityService.ts`, full CRUD, recurrence rule analysis, category filters, soft delete | `ActivitiesScreen.tsx` with category pills, template search, creation modal, color palette, soft delete | `domain/validation.ts`, `domain/recurrence.ts` | `/api/mobile/v1/activities/templates`, `/api/mobile/v1/activities/templates/[id]`, `/api/mobile/v1/activities/logs` | Create activity modal with category, recurrence, color palette, delete confirmation | **Implemented** |
| **Work Session (Timer)** | `WorkHoursWidget.tsx`, `WorkSessionService.ts`, presence logging, pause segments, authoritative start rule | `WorkSessionCard.tsx` with live ticking timer, start/pause/resume/finish controls, Office/WFH selector | `domain/work.ts` (`calculateWorkSessionElapsed` with authoritative `startedAt = entered start`) | `/api/mobile/v1/work/session` (GET active/date, POST start/manual, PATCH pause/resume/finish, DELETE) | Work timer card, start/stop/pause button, time adjustment, mode toggle | **Implemented** |
| **Weight Tracking** | `/weight`, `WeightWidget.tsx`, `WeightService.ts`, historical logs | `WeightWidgetCard.tsx` with 7-day recent weight display, log modal, automatic habit provisioning | Validation schema, decimal units, `logWeight` domain | `/api/mobile/v1/weight` (GET history, POST log, DELETE) | Weight entry modal, recent history list, trend card | **Implemented** |
| **Journal** | `/journal`, `JournalService.ts`, daily reflections, rich formatting, mood tags, gratitude, tomorrow's plan | `JournalScreen.tsx` with date switcher, 5 mood selectors, entry/gratitude/plan tabs, word count, save/delete | Pure domain reuse (`JournalService.getByDate`, `JournalService.upsert`, `JournalService.delete`) | `/api/mobile/v1/journal` (GET date, POST upsert, DELETE) | Date switcher bar, mood chip selector, multiline native editor, word counter, save indicator | **Implemented** |
| **Notes** | `/notes`, `NotesService.ts`, collections, title, body, search, soft delete | `NotesScreen.tsx` with live search, notes card list, full create/edit modal, word counter, soft delete | Pure domain reuse (`db.note`, versioning, soft delete) | `/api/mobile/v1/notes` (GET list, POST create, PATCH update, DELETE soft-delete) | Native notes list, search bar, create/edit modal, character & word count | **Implemented** |
| **Bin / Trash** | `/bin`, `BinService.ts`, soft-deleted entity aggregation (`deletedAt !== null`), restore | `BinScreen.tsx` with module filter chips (All, Journal, Notes, Activities, Weight), single-tap restore | Soft-delete architecture (`deletedAt !== null` on tables) | `/api/mobile/v1/bin` (GET aggregate deleted items, POST restore) | Unified Bin list, entity icon badges, single-tap restore action, undo feedback | **Implemented** |
| **Settings & Account** | `/settings`, `SettingsService.ts`, profile info, theme options, entitlements | `SettingsScreen.tsx` (username, email, role, Bin launcher card, storage architecture, sign out) | User identity contracts, role checking | `/api/mobile/v1/auth/me` | Account profile card, direct Bin navigation button, storage info, sign-out dialog | **Implemented** |
| **Calendar** | `/calendar`, `CalendarService.ts`, `GoogleCalendarService.ts`, Agenda/Day/Month, Google Sync | Recurrence engine generates timeline occurrences | Recurrence generation, agenda formatting | Shared server calendar sync | Agenda list view, sync status indicator | **Planned** |
| **Link Library** | `/links`, `LinkService.ts`, collections, tags, URL preview | Link contracts defined | Link data contracts | `/api/links` | Link cards, category tabs, copy/open external URL actions | **Planned** |
| **Vault** | `/vault`, `VaultService.ts`, client/server encryption, secure file store, access control | Security contracts defined | AES-256-GCM encryption & file metadata rules | `/api/vault` | Passphrase unlock gate, file list, upload picker, secure download | **Planned** |

---

## 2. Icon System Standardization
- **Canonical Family**: Lucide
- **Web**: `lucide-react`
- **Mobile**: `lucide-react-native`
- **Abstraction**: `TrackerIcon` in `m/src/components/TrackerIcon.tsx`
  - Semantic names: `home`, `calendar`, `activity`, `work`, `weight`, `journal`, `notes`, `link`, `vault`, `trash`, `settings`, `check`, `x`, `plus`, `edit`, `restore`, etc.
  - Uniform sizes: `xs` (14), `sm` (18), `md` (22), `lg` (26), `xl` (32).
  - Controlled registry preventing dynamic bundle bloat.
  - Fully tested: 3 unit tests, 81 assertions passing in `m/tests/unit/tracker-icon.test.ts`.

---

## 3. Styling & Token Architecture
- **Decision**: Maintained the robust `StyleSheet` + semantic token system (`m/src/theme/tokens.ts`).
  - Colors: Aligned with Tracker's canonical brand palette (Background `#090b0e`, Surface `#14171d`, Brand Coral `#ff7557`, Primary Indigo `#6366f1`, Success `#22c55e`, Danger `#ef4444`).
  - Radius: Consistent scale (`sm`: 8, `md`: 12, `lg`: 16, `full`: 9999).
  - Spacing: 4px base (`xs`: 4, `sm`: 8, `md`: 16, `lg`: 24, `xl`: 32, `xxl`: 48).
  - Accessibility: Minimum 48px touch targets enforced across all interactive components.
