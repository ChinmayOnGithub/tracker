# Tracker OS – Architecture, Database & UI Design Guidelines

This document establishes the official development rules for Tracker OS. All future features, refactorings, database schemas, and user interfaces must adhere strictly to these principles to maintain scalability, security, and styling consistency.

---

## 1. System Architecture Guidelines

We enforce a strict **Domain-Driven Modular Boundary** layout.

### A. Modular Isolation
* All domain logic, components, types, and services reside in `modules/`.
* Code under `modules/<domain>/` must be encapsulated. Do not import internal files of other modules directly. 
* Share public endpoints/components through barrel files (`modules/<domain>/index.ts`).

### B. Client / Server Boundary & Barrel Rules
* Next.js App Router utilizes Server Actions (`"use server"`) and Client Components (`"use client"`).
* **Rule**: Services and repository classes that handle database access or file systems must NEVER be exported in barrel files (`index.ts`) imported by client components. Doing so compiles server code into client bundles, triggering build-time failures.
* Data queries must reside inside server actions or dedicated backend service files.

### C. Direct Database Queries
* **Rule**: Frontend/UI components must NEVER invoke `db` (Prisma client) directly. 
* All queries and writes must be handled through Server Actions in `@/app/actions` or service layers in `@/modules/<domain>/services`, which are then invoked by the UI.

---

## 2. Database Protection & Lifecycle Rules

We treat user data as highly critical. We implement both static rules and runtime query guards to prevent accidental deletion or corruption.

### A. Banned Command Executions
* **DO NOT** run `prisma migrate reset` or `prisma db push --force-reset` on any staging/production environment. These commands wipe the database.
* To perform a schema change:
  1. Generate a migration locally: `bunx prisma migrate dev --name <migration_name>`
  2. Test locally with safe seed data.
  3. Deploy the migration to production: `bunx prisma migrate deploy`

### B. Soft-Deletion Policy
* Any model that contains a `deletedAt` field (e.g. `JournalEntry`, `Note`, `ActivityTemplate`, `ActivityLog`, `WeightRecord`, `LeaveRecord`, `WishlistItem`, `SecureDocument`, `LinkCollection`, `SavedLink`, `LinkedEventMapping`) must use **Soft Deletes**.
* **Rule**: Hard deletes (`db.<model>.delete` or `db.<model>.deleteMany`) are forbidden on these tables.
* To delete a record, run an update statement:
  ```typescript
  await db.note.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
  ```

### C. Unscoped Deletes Block
* **Rule**: Bulk delete operations without target scopes are banned.
* Any call to `deleteMany()` without a `where` property (or with an empty `where: {}` block) is intercepted by the Prisma engine guard in `lib/db.ts` and will throw a fatal error during runtime to prevent bulk-table truncation.

### D. Environment Seeding Guards
* Database seeding (`prisma/seed.ts` or scratch scripts) is blocked on production databases (containing `supabase.com` in their connection strings or running with `NODE_ENV === 'production'`).

---

## 3. UI Design & Typography (Modern Shadcn Style)

The Tracker interface must look sleek, crisp, premium, and unified. We follow a tailored **Shadcn-inspired Design System**.

### A. Typography Hierarchy
* Primary Font: `Inter` or standard iOS/macOS system-sans.
* Text styling rules:
  * **Page Headers**: `text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50`
  * **Section Headers**: `text-lg font-semibold text-zinc-900 dark:text-zinc-50`
  * **Card Headers**: `text-base font-semibold text-zinc-800 dark:text-zinc-200`
  * **Body Text**: `text-sm text-zinc-600 dark:text-zinc-300`
  * **Muted/Helper Text**: `text-xs text-zinc-400 dark:text-zinc-500`

### B. Colors & Semantic Tokens
* Use variables from `@/design-system/tokens.css` inside tailwind configs or classes:
  * Surface Background: `bg-[var(--color-bg-surface)]` (pure white / zinc-900)
  * Base Background: `bg-[var(--color-bg-base)]` (slate-50 / zinc-950)
  * Subtle Borders: `border-[var(--color-border)]` (1px opaque grey / transparent-white-10%)
  * Interactive Primary: `bg-[var(--color-primary)]` (system-blue / indigo-400)
* Avoid hardcoding flat tailwind color shades (like `bg-red-500` or `text-blue-600`) for structural themes. Always support light & dark transitions using the `.dark` class.

### C. Component Reuse Rule (Banning Raw Styled Blocks)
* To keep the UI consistent, developers must never build custom buttons, raw cards, or customized text inputs using ad-hoc classes. 
* You **MUST** import and use these shared components from `@/design-system/components/*`:
  * **Button**: `<Button variant="primary" size="md">Text</Button>` (contains built-in micro-scaling click feedback, spinners, outline/danger states).
  * **Card**: Use `<Card>`, `<CardHeader>`, `<CardBody>`, and `<CardFooter>` to layout content blocks. This guarantees a unified border, border radius (`rounded-[var(--card-radius)]`), shadows, transition ease, and consistent padding.
  * **Input / Textarea / Select**: Always use `<Input>`, `<Textarea>`, or `<Select>` from the design system to ensure uniform border highlights, focus ring scales, error messaging styles, and label padding.

---

## 4. Development Checklist (Do's and Don'ts)

### Backend & Database Operations

| What to DO | What NOT to Do |
| :--- | :--- |
| **Do** check if a model has `deletedAt` and implement update-based soft deletion instead. | **Don't** call `db.<model>.delete` or `deleteMany` on soft-deletable tables. |
| **Do** specify target filters in all delete/update commands (e.g. scoping by `userId`). | **Don't** execute unscoped `deleteMany()` or empty `{}` updates. |
| **Do** use `prisma migrate dev` for applying schema changes during local development. | **Don't** use `prisma db push` on staging/production to push schema changes. |
| **Do** check that connection strings are local/safe before running database seeding scripts. | **Don't** run seeds or resets on database connections pointing to Supabase or production. |
| **Do** wrap service database transactions in event handlers and handle exceptions gracefully. | **Don't** let error propagation crash server processes due to unhandled promise rejections. |

### UI & Component Layouts

| What to DO | What NOT to Do |
| :--- | :--- |
| **Do** use `<Button>`, `<Card>`, and `<Input>` primitives from `@/design-system/components/*`. | **Don't** build raw `<button>` or custom inputs with arbitrary CSS border/shadow parameters. |
| **Do** use design system color tokens (`var(--color-bg-base)`, etc.) to support light/dark modes. | **Don't** hardcode flat tailwind colors like `bg-white` or `bg-zinc-800` directly. |
| **Do** use transition modifiers for interactive states (e.g., scale and fade animations). | **Don't** leave hover states static or implement sudden changes without standard easing duration. |
| **Do** use Inter font and standard text class helpers (`tracking-tight`, `font-semibold`). | **Don't** use arbitrary inline styles or browser-default typography settings. |
| **Do** ensure interactive elements have clear visual states for focus, active, hover, and disabled. | **Don't** use generic default inputs or outline-less focuses that look basic or un-polished. |
