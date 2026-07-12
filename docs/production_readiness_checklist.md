# Tracker OS – Production Readiness Checklist

This checklist defines the criteria that must be met before deploying Tracker OS changes to production environments.

---

## 1. Code Quality & Standards
* [ ] **Lint checks**: `bun run lint` executes successfully with 0 errors.
* [ ] **Type safety**: `bunx tsc --noEmit` compiles cleanly with 0 errors.
* [ ] **Pre-commit Hooks**: Husky is active and running pre-commit script suites.

---

## 2. Testing & Coverage
* [ ] **Unit Tests**: `bun test` passes successfully on every build.
* [ ] **Regression checks**: Crucial business math (cryptography, sessions) is covered by test suites in `/tests`.

---

## 3. Security Hardening
* [ ] **Secrets Encryption**: `GOOGLE_OAUTH_ENCRYPTION_KEY` is set to a secure, random 32-character key.
* [ ] **HTTP Headers**: Enforce HTTPS and check that cookies are sent with `HttpOnly` and `SameSite=Lax` properties.
* [ ] **Validation Layer**: Centralized environment validator (`lib/env.ts`) checks all required variables at startup.
* [ ] **Parameterized Queries**: All database inputs leverage Prisma's parameterized queries to prevent SQL injections.

---

## 4. Performance & Caching
* [ ] **Cache Warmers**: `/api/sync/calendar` endpoint runs on a recurring cron trigger to warm up calendar cache in the background.
* [ ] **N+1 Queries**: Ensure page data loaders batch sub-resources in unified database roundtrips.
* [ ] **Asset Size**: CSS and JS outputs are optimized and minified.

---

## 5. Environment & Deployment Setup
* [ ] **Environment variables**: All variables listed in `.env.example` are set on the hosting provider (e.g. Vercel, Railway, Render).
* [ ] **Prisma migrations**: `prisma migrate deploy` runs as a post-install step on all deployment builds.
