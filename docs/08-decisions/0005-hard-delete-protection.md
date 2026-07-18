# ADR-005: Database Hard-Delete and Unscoped Mutation Protection

* **Status**: Approved
* **Date**: 2026-07-19
* **Authors**: Antigravity

---

## Context

Accidental data deletion is a critical risk, especially during local development, database seeding, or code execution by AI agents. In a database schema that models soft deletion using a nullable `deletedAt` field, human developers or AI coding models can easily run standard hard-deletes (`delete` or `deleteMany`) out of habit or training patterns.

Furthermore, executing unscoped bulk deletions (`db.model.deleteMany()`) without specific user-identifying where-filters poses a major threat of dropping entire table datasets, especially when developers attempt to run seeding scripts on the wrong database context (such as pointing to the production Supabase instance in their local `.env`).

## Decision

We will implement two layers of database deletion blocks:

1. **Prisma Client Extensions**: 
   Extend the Prisma client singleton in `lib/db.ts` using query hooks:
   * Block all hard deletes (`delete` and `deleteMany`) on models containing a `deletedAt` soft-delete field. The client will throw a runtime error urging developers to use `update` / `updateMany` to set `deletedAt = new Date()`.
   * Block all unscoped deletes (`deleteMany` without a `where` property, or with an empty `where: {}` block) globally.
   * Provide a bypass toggle: Allow these operations only when the environment variable `ALLOW_UNSAFE_DB_OPERATIONS` is explicitly set to `'true'`.

2. **Script Environment Guards**:
   Block seeding scripts (`prisma/seed.ts` and `scratch/seed-*.ts`) from executing if the connection string targets production:
   * Check if `DATABASE_URL` contains `supabase.com` or `pooler.supabase.com`, or if `NODE_ENV === 'production'`. If so, terminate execution immediately.
   * Set `process.env.ALLOW_UNSAFE_DB_OPERATIONS = 'true'` only inside the seeding process for safe local databases.

## Consequences

### Pros
* **Zero Accidental Wipes**: It is programmatically impossible for a web request, cron job, or local run to wipe tables or hard-delete users' records.
* **Safer AI Agents**: Any AI coding models that attempt to generate unsafe delete logic will fail safely at runtime.
* **Production Integrity**: Seeding can never be run against the live Supabase environment.

### Cons
* **Testing Complexity**: Unit tests that need to perform actual hard deletes or setup mock data clears must run with `ALLOW_UNSAFE_DB_OPERATIONS=true`.
* **Prisma Overhead**: All deletes run through an extra layer of hook validation (negligible performance impact).
