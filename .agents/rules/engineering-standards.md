# Tracker OS — Engineering & Architecture Standards

## 1. The Sacred 4-Layer Mutation Architecture
Every state mutation MUST follow this flow in strict sequence:
```
Client UI Component (components/*)
       ↓
Server Action (app/actions/*.ts)   -- Validates session, parses schema with Zod, checks entitlements
       ↓
Domain Service (lib/services/*)     -- Contains all business logic, invariants, and events
       ↓
Database via Prisma (lib/db.ts)    -- Protected by runtime interceptors
```

### Prohibitions:
- **Never** query Prisma directly from client components.
- **Never** put business logic inside Server Actions (they are thin controllers).
- **Never** import server-only code (Prisma, encryption, cookies) into client-side bundles.

---

## 2. Database Safety Safeguards (CRITICAL)
- **Universal Soft-Delete**: Any table with a `deletedAt DateTime?` column in `prisma/schema.prisma` must NEVER be hard-deleted using `db.<model>.delete` or `db.<model>.deleteMany`. Always use `update` or `updateMany` to set `deletedAt = new Date()`.
- **No Unscoped Deletes**: Prisma client in `lib/db.ts` contains query interceptors that throw errors on `deleteMany()` or `updateMany()` without a filtering `where` object.
- **No Dangerous Migrations**: Never propose or run `db push --force-reset` or `migrate reset` on production or developer databases.

---

## 3. UI Styling & Design System (CRITICAL)
Tracker uses a bespoke **Shadcn Style** powered by Tailwind CSS 4 and CSS design tokens (`design-system/tokens.css`).
- **Prohibited**:
  - Do NOT write raw `<button>` elements in module panels.
  - Do NOT write custom cards with ad-hoc border/shadow/margin classes.
  - Do NOT write unstyled `<input>` or `<textarea>` tags.
- **Mandatory Imports**:
  - `<Button>` from `@/design-system/components/Button`: standardizes loading states, sizes, colors, and micro-hover scaling.
  - `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>` from `@/design-system/components/Card`: standardizes structural card panels and borders.
  - `<Input>`, `<Textarea>`, `<Select>` from `@/design-system/components/Input`: standardizes focus rings, dark/light themes, and error feedback.

---

## 4. Type Safety & Bun Compatibility (CRITICAL)
- **Strictly Typed**: Never use `as any`, `as unknown`, or `as object` to bypass TypeScript. Always define proper generic interfaces or use type narrowing.
- **Bun Test Compatibility**: The repository uses `bun test` as its primary test runner:
  - Import test block helpers (`describe`, `it`, `expect`, `beforeEach`, `afterEach`, `mock`) from `bun:test`.
  - **Clean Mock Resets**: Do not use `jest.clearAllMocks()` or `vi.clearAllMocks()`. Reset mock call history by casting the function and setting its length to 0:
    ```typescript
    (myMockFunction as { mock?: { calls: unknown[][] } })?.mock?.calls.length = 0
    ```
  - **Module Mocks in Bun**: Use `mock.module('@/path', () => ({ ... }))` inside `beforeEach` instead of assigning to read-only ES module imports.
- **No Duplicate Implementations**: Never add duplicate methods (like `persistQueue` or `getStats`) to classes. Keep a single canonical implementation.
