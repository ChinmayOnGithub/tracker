# Naming Conventions Specification

This document details the naming conventions for files, directory structures, symbols, database tables, and variables in Tracker OS.

---

## 1. Directory & File Nomenclature

* **Folders / Directories**: Always use kebab-case (`components/`, `design-system/`, `google-calendar/`).
* **React Components**: Always PascalCase (`TodayDashboard.tsx`, `TemplateModal.tsx`).
* **Hooks**: camelCase prefix with `use` (`useRouter`, `useTransition`).
* **Server Actions**: camelCase, grouped in files corresponding to modules (e.g. `journal.ts` -> `upsertJournalEntry`).
* **Domain Services**: PascalCase class names ending with `Service` (e.g. `ActivityService.ts`).
* **Test Files**: Match the target file name with `.test.ts` extension (e.g. `google-calendar-service.test.ts`).

---

## 2. Code Symbols & Variables

* **Database Models (Prisma)**: PascalCase, singular (e.g. `ActivityTemplate`, `ActivityLog`).
* **Database Columns**: camelCase (e.g. `recurrenceType`, `calendarProvider`).
* **Prisma Enums**: UPPERCASE with underscores (e.g. `RecurrenceType`, `Priority`).
* **Types / Interfaces**: PascalCase. Props interfaces must append `Props` (e.g. `TodayDashboardProps`).
* **CSS Custom Variables**: lowercase with hyphens prefix with `--color-`, `--spacing-`, or `--radius-` (e.g. `--color-bg-base`, `--spacing-4`, `--radius-md`).
* **Tailwind Class Names**: Standard lowercase hyphenated utility tokens. Bypassing token parameters using arbitrary bracket syntax (e.g. `p-[14px]`, `bg-[#121212]`) is strictly forbidden.
