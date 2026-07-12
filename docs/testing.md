# Tracker OS – Testing Strategy & Roadmap

This document outlines the testing philosophy, unit-testing guidelines, and upcoming testing roadmap for Tracker OS.

---

## 1. Testing Philosophy

We value **correctness and stability over code coverage percentages**. We write automated tests for critical business logic rather than chasing mock percentages on UI rendering pages.

### Focus Priorities
1. **Security & Cryptography**: Session validation, token encryption/decryption keys.
2. **Business Calculations**: Habit recurrences, leave allowances, weight change logs.
3. **Data Parsers**: Google Calendar event converters, mobile sync SQLite push parsers.

---

## 2. Test execution (Bun Test)

Tracker uses **Bun Test** because it is built-in, lightning-fast, and natively resolves TypeScript without compilation compilation overheads.

* **Run tests**: `bun test`
* **Run specific suite**: `bun test tests/session.test.ts`

### Test File Conventions
* Test files are placed directly under `tests/` at the root of the project.
* Name format: `<feature-or-module>.test.ts` (all lowercase, hyphenated).

---

## 3. Mocking Guidelines

When testing database or network-dependent services:
1. **Google APIs**: Mock fetch calls using standard Bun mock signatures or local interceptors.
2. **Database Queries**: Mock the Prisma client `db` instance where possible, or use isolated SQLite/Postgres test schemas.

---

## 4. Testing Roadmap

Below is the testing implementation schedule for subsequent phases:

| Module / Feature | Logic to Test | Test File | Target Phase |
| --- | --- | --- | --- |
| **Auth** | Session signing, timeout expirations, tamper checks | `tests/session.test.ts` | Complete |
| **Cryptography** | AES-256-GCM encryption strength, IV offsets | `tests/google-encryption.test.ts` | Complete |
| **Calendar Sync** | Google Event timezone parsing, timezone-safe groupings | `tests/google-calendar-actions.test.ts` | Complete |
| **Calendar Service** | Token refresh, caching, Retry-After backoffs | `tests/google-calendar-service.test.ts` | Complete |
| **OAuth Security** | State parameter UUIDs, PKCE verifiers, JWKS decoding | `tests/oauth-flow.test.ts` | Complete |
| **Today Dashboard** | Active event matching, countdowns, due habits filter | `tests/today-dashboard.test.ts` | Complete |
| **UX & Polish** | Priority badges, Contextual subtitles, Command filtering | `tests/polish-ux.test.ts` | Complete |
| **Habit Engine** | Recurrence calculations (weekly/monthly/yearly loops) | `tests/habit-recurrence.test.ts` | Next Phase |
| **Mobile Sync** | SQLite push JSON parse conversions | `tests/mobile-sync.test.ts` | Next Phase |

---

## 5. Write Operations (CRUD) Testing Protocol
When writing tests for write APIs (Create, Update, Delete):
1. **Mock Fetch Payload Interception**: Save options body locally inside fetch mock to inspect and assert that the POST/PATCH payload matches the expected schema.
2. **Property Overriding**: Rather than globally mocking service modules via `mock.module` (which creates cross-test namespace pollution), override class constructor methods directly in `beforeEach` and restore them in `afterEach`.
3. **Idempotence & Graceful Recovery**: Test that deletion on 404/410 status returns success (`true`), and updates propagate the appropriate error message.

---

## 6. Today Dashboard Testing Protocol
To maintain high-speed TypeScript compilation and avoid JSDOM/heavy React testing dependencies:
1. **Pure Helper Decoupling**: All logical computations (active event finding, time label parsing, due habits filters) are decoupled from component render wrappers and moved to `modules/sync/google-calendar/utils/dashboardHelpers.ts`.
2. **Time-Sensitive Mocks**: Countdown tests pass specific static current times (`Date`) instead of calling `new Date()`, making tests deterministic and immune to execution time drifts.
3. **UX Helpers**: Subtitle calculations and priority badge maps are validated in `tests/polish-ux.test.ts` to ensure Apple-like dense layout rendering logic is robust.



