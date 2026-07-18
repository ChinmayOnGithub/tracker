# Tracker OS – AI Constitution

This document contains the immutable engineering and design laws of Tracker OS. Every AI agent, subagent, and human engineer must strictly follow these rules. No feature, refactoring, or database migration is considered complete unless it conforms to these constitutional laws.

---

## 1. Core Architecture Laws

### Law 1.1: Modular Boundaries
All domain features must be isolated inside `modules/<domain>/`. Direct cross-importing of internal files between modules is forbidden. Share features only through public barrel files (`modules/<domain>/index.ts`).

### Law 1.2: Client-Server Leakage Prevention
Server-only service classes, database drivers, or cryptographic modules must **NEVER** be exported from barrel files (`index.ts`) that are imported by React Client Components (`"use client"`). Doing so causes compilation errors due to server-side code leakage in client bundles.

### Law 1.3: No Direct Database Queries in UI
UI components must never import or call the Prisma database client (`db`) directly. All data reads and mutations must pass through:
1. Server Actions in `app/actions/` or `modules/<domain>/actions.ts`.
2. Encapsulated Service classes inside `modules/<domain>/services/`.

---

## 2. Database Safety Laws

### Law 2.1: Soft-Deletion Mandate
Any table supporting soft-deletion (contains a `deletedAt DateTime?` column in [schema.prisma](file:///d:/github_projeccts/tracker/prisma/schema.prisma)) must **NEVER** be hard-deleted using `delete` or `deleteMany`. You must update the record setting `deletedAt` to the current date/time instead.
* **Prisma Guard Lock**: The Prisma client in `lib/db.ts` will raise a runtime exception and block any accidental hard deletes on these models.

### Law 2.2: Unscoped Deletes Blockage
Executing `deleteMany()` without a filtering `where` object (or with an empty `where: {}` block) is strictly forbidden. 
* **Prisma Guard Lock**: The client will intercept and block unscoped deletes at runtime to prevent accidental data wipes.

### Law 2.3: Production Seeding Guard
Seeding scripts (`prisma/seed.ts` or `scratch/seed-*.ts`) must **NEVER** run when `DATABASE_URL` contains `supabase.com` or `pooler.supabase.com`, or when `NODE_ENV === 'production'`.
* Seeding must only target local development databases (such as SQLite `dev.db` or local development PostgreSQL).

---

## 3. UI Design & Styling Laws (Modern Shadcn Style)

### Law 3.1: Strict Primitive Reuse
You are **prohibited** from writing custom button tags, raw cards, or custom input boxes using ad-hoc tailwind classes. You **MUST** import and reuse components from `@/design-system/components/*`:
* **Button**: `<Button variant="..." size="...">` enforces standard hover scale, loading indicators, active clicks, and transitions.
* **Card**: `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>` layout structural card wrappers, enforcing standard border-radius, shadows, transitions, padding, and borders.
* **Input / Textarea / Select**: Uniform input field borders, focus rings, hover outlines, error indicators, and labels.

### Law 3.2: Typography System
Always use Inter/System-Sans typography with unified styling classes:
* Page Titles: `text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50`
* Section Titles: `text-lg font-semibold text-zinc-900 dark:text-zinc-50`
* Subtitles: `text-sm text-zinc-500 dark:text-zinc-400`
* Body Copy: `text-sm text-zinc-700 dark:text-zinc-300`

### Law 3.3: Theme Token Compliance
Avoid hardcoding flat color values (`bg-white`, `bg-zinc-800`). Use design-system variables (`bg-[var(--color-bg-surface)]`, `border-[var(--color-border)]`) to support smooth light and dark mode switches via `.dark`.

---

## 4. Definition of Done Checklist

Every new feature, refactoring, or bug fix is incomplete until it satisfies this checklist:

### Database & Repository
- [ ] Schema changes documented in [schema.prisma](file:///d:/github_projeccts/tracker/prisma/schema.prisma) with explicit soft-delete support (`deletedAt`).
- [ ] Database access encapsulated in service layers, not frontend code.
- [ ] Hard deletes and unscoped deletes avoided.

### UI & Styling
- [ ] Checked that no raw `<button>` or custom-styled cards were introduced. All reuse design-system components.
- [ ] Typography fits the Inter scale (`tracking-tight` on bold headers, correct line-heights).
- [ ] Support for both Light and Dark mode transitions using tokens verified.
- [ ] Interactive elements feature micro-interactions (hover scales, transition-timing-function).

### Engineering & Quality
- [ ] TypeScript checks pass cleanly (`bunx tsc --noEmit`).
- [ ] No compilation warnings or server-action leaks in client files.
- [ ] Unit tests updated/created under `tests/` and run successfully (`bun test`).
