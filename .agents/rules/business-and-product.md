# Tracker OS — Business Model & Product Principles

## 1. Product Mission
Tracker OS empowers ambitious individuals to organize their daily habits, work sessions, health metrics, documents, and personal reflections inside a single, blazing-fast, distraction-free environment.

---

## 2. Core Value Pillars
1. **Local-First & Offline Resilience**:
   - The application works seamlessly offline using IndexedDB via `lib/sync/` and `lib/store/store.tsx`.
   - Mutations are applied optimistically to the local state immediately, appended to an offline write queue, and reconciled asynchronously in the background.
2. **Habits vs. Tasks Separation**:
   - **Activity Templates (`ActivityTemplate`)**: Blueprints for recurring habits (daily, weekly, monthly, custom). They are never duplicated across days.
   - **Occurrences (`TimelineItem`)**: Computed on-the-fly at runtime by the recurrence engine (`lib/timeline/recurrenceEngine.ts`). They are never persisted to the database.
   - **Records (`ActivityLog`)**: Historical facts marking completion, amount, notes, or postponement for a specific date.
3. **Checklist Cycling & Postponing**:
   - Non-Daily activities cycle: `Cleared` ➔ `Done` ➔ `Canceled` ➔ `Postponed` ➔ `Cleared`.
   - Daily activities cycle: `Cleared` ➔ `Done` ➔ `Canceled` ➔ `Cleared`.
   - Marking `Postponed` automatically reschedules the activity for the next day via UTC recurrence analysis.

---

## 3. Subscription & Billing Tier Matrix
All capability checks must flow through `EntitlementService` (`lib/billing/EntitlementService.ts`). Never hardcode client-side paywalls.

| Feature / Capability | Free Tier | Tracker Pro Tier (`PRO_MONTHLY` / `PRO_ANNUAL`) |
| :--- | :--- | :--- |
| **Activity Habits & Tasks** | Up to 15 active templates | Unlimited active templates |
| **Timeline & Recurrence Engine** | Full access | Full access |
| **Work Sessions & Time Tracking** | Full access | Full access |
| **Daily Journaling** | Read-only historical entries | Full write access with prompts, moods, reflections |
| **Documents & Vault Storage** | Up to 10 files / 50MB max | Unlimited files / 10GB cloud storage |
| **Google Calendar Integration** | Read-only import | Bidirectional two-way auto sync |
| **Data Export & Local Backup** | JSON Snapshot Export | Automated cloud backup snapshots & restore |
| **Master Search Engine** | Core search | Global deep search across all modules & journal |

---

## 4. Multi-Tenant Security & Isolation
- **No Shared State**: Every query and mutation MUST be scoped to the authenticated `userId`.
- **Guest Access Authorization**: Guests accessing a shared workspace operate strictly within their granted permissions (`guestPermissions`). Guests never have owner rights (`isOwner: false`).
- **Billing Anti-Tampering**: Plan prices, currency calculations, and checkout sessions are calculated server-authoritatively. Webhook signatures (`x-razorpay-signature`) are cryptographically verified before granting access.
