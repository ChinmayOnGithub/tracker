# Runtime Validation & Verification Protocol

This document establishes the verification taxonomy, environment distinctions, and end-to-end acceptance protocol for the Tracker mobile application.

---

## 1. Strict Verification Status Vocabulary

Never claim a feature is complete merely because TypeScript compiles or tests pass in isolation. Every feature, milestone, or issue must declare one of the following exact statuses:

| Status | Verification Level | Meaning |
|---|---|---|
| `PLANNED` | None | Feature is designed or scheduled; no implementation yet. |
| `IN PROGRESS` | Partial | Implementation is actively underway. |
| `STATIC VERIFIED` | Compile-time | TypeScript typecheck (`tsc --noEmit`) and ESLint pass with zero errors. |
| `UNIT VERIFIED` | Isolated Logic | Domain state machines, date arithmetic, and token scales pass automated unit tests. |
| `INTEGRATION VERIFIED` | Boundary | Database schemas, API endpoints, and authentication middleware pass end-to-end contract tests. |
| `REAL DEVICE VERIFIED` | Native Runtime | Exercised on an actual physical Android device or Android emulator development build (`adb`). |
| `PRODUCTION BUILD VERIFIED` | Release Candidate | Verified inside a standalone production APK / AAB build with minification and hermes engine. |
| `BLOCKED` | Dependent | Progress blocked by environment or external dependency. |

---

## 2. Environment Distinctions

### Expo Go vs Native Android Development Build:
- **Expo Go**: Convenient for rapid UI iteration, live reload, and styling checks.
- **Limitation**: Expo Go does **not** support native OAuth deep-linking redirects, custom native modules, or background tasks.
- **Rule**: Expo Go execution is **not** equivalent to `REAL DEVICE VERIFIED` or native Android validation.
- If native Android emulator or physical device is not attached via `adb`:
  > `ANDROID RUNTIME NOT EXECUTED — ENVIRONMENT LIMITATION`

---

## 3. Complete User Journey Acceptance Checklist (Section 42)

The production MVP is complete when the following end-to-end journey is proven on a real Android development build:

1. [ ] Install and launch application cold.
2. [ ] Authenticate via Google Sign-In with deep-link return to `tracker://auth-callback`.
3. [ ] If new account, complete Onboarding (focus areas, work capacity, first-day plan).
4. [ ] Arrive at Today screen.
5. [ ] Verify today's actionable Tasks appear with priority indicators.
6. [ ] Tap checkbox to Complete task (`pending` ➔ `done`).
7. [ ] Tap checkbox to Skip / Cancel task (`done` ➔ `skipped`).
8. [ ] Tap checkbox or menu to Postpone task (`skipped` ➔ `postponed`).
9. [ ] Navigate to tomorrow: verify postponed task is due tomorrow.
10. [ ] Re-postpone / restore: verify task returns to its original scheduled date.
11. [ ] Open Calendar: verify Month, Week, Day, and Today views.
12. [ ] Verify Tracker tasks and Google Calendar events appear with distinct visual identities.
13. [ ] Connect Google Calendar: verify initial full sync populates Google events.
14. [ ] Modify task in Tracker: verify Google Calendar event updates.
15. [ ] Modify event in Google Calendar: verify Tracker event reconciles upon sync.
16. [ ] Disconnect network (airplane mode): complete a task locally.
17. [ ] Verify local UI updates immediately and task is stored in SQLite outbox.
18. [ ] Reconnect network: verify outbox drains and server reflects completion.
19. [ ] Kill and reopen app: verify state, session, and cache survive cold start.
