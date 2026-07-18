# Tracker – Contributing & Code Quality Standards

This document establishes the code quality checklists, commit message conventions, and repository standards for all contributors.

---

## 1. Coding Standards

1. **Strict TypeScript**: Avoid `any` type casting. Use precise return signatures and explicit interfaces.
2. **Discriminated Union Flags**: Return Server Action success flags as literal typecasts (e.g. `success: true as const` or `success: false as const`) to allow correct union discrimination in views.
3. **No Direct DB Calls in Components**: Client components must only call Server Actions or UI endpoints. All Prisma logic remains encapsulated in Services.
4. **Timezone neutrality**: Always write database queries and date comparisons timezone-safely (UTC midnights or ISO strings).

---

## 2. Commit Message Conventions

Tracker conforms to the **Conventional Commits** specification:

* `feat`: A new user-facing product feature.
* `fix`: A bug resolution.
* `docs`: Documentation edits.
* `style`: Styling adjustments (white-space, formatting, missing semi-colons).
* `refactor`: Code changes that neither fix a bug nor add a feature.
* `test`: Adding missing tests or correcting existing tests.
* `chore`: Maintenance updates (npm packages, configurations).

Example:
`feat(sync): add read-only Google Calendar agenda widget`

---

## 3. Pre-Commit Checklist

Before staging changes or submitting a Pull Request, run the validation script:

1. **Verify Formatting**: `bun run lint` (ensure ESLint resolves cleanly).
2. **Type Safety**: `bunx tsc --noEmit` (ensure no TypeScript errors).
3. **Run Unit Tests**: `bun test` (ensure all tests pass).
4. **Production Build check**: `bun run build` (ensure pages compile successfully).
