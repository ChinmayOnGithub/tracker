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

## 3. UI Styling & Design System Architecture (CRITICAL)
Tracker uses a centralized **Token-Driven Design System** powered by Tailwind CSS 4 and CSS design tokens in `design-system/tokens.css`.
- **Core Principles**:
  - **Never invent a new visual pattern** when an existing shared component can represent it.
  - **Search the repository first**: Before creating any new UI component, check `@/design-system`.
  - **Variant-driven over duplication**: Prefer extending an existing canonical component with a variant or size option over creating a visually duplicate component.
  - **Semantic Tokens Only**: UI changes must consume semantic design tokens (`var(--surface)`, `var(--primary)`, `var(--border)`, `var(--foreground)`, `var(--muted-foreground)`, etc.) rather than hard-coded visual values (`text-slate-850`, `bg-zinc-900`) or uncontrolled arbitrary values.
  - **Pages own composition; Primitives own visual styling & accessibility**.
  - **Avoid "Everything is a card"**: Prefer lists, flat rows, and `<Surface variant="...">` or `<List>` primitives where applicable. Cards should only be used where grouping independent objects is structurally needed.
- **Prohibited**:
  - Do NOT write raw `<button>` elements in module panels — import `<Button>` or `<IconButton>`.
  - Do NOT write custom cards with ad-hoc border/shadow/margin classes — use `<Card>` or `<Surface>`.
  - Do NOT write unstyled `<input>`, `<textarea>`, or `<select>` tags — use canonical form primitives.
  - Do NOT create custom empty states with dashed borders — use canonical `<EmptyState>`.
  - Do NOT write custom section headers — use `<PageHeader>` or `<SectionHeader>`.
- **Mandatory Canonical Components (`@/design-system`)**:
  - `<Button>`, `<IconButton>`: Normalized sizes, loading state, variants, and accessible focus rings.
  - `<Surface>`, `<Card>`: Elevation hierarchy (`flat`, `subtle`, `interactive`, `raised`, `floating`).
  - `<PageHeader>`, `<SectionHeader>`: Standardized page and section hierarchy.
  - `<Input>`, `<Textarea>`, `<Select>`, `<FormField>`: Consistent form layout, labels, and validation.
  - `<Badge>`: Canonical status, priority, and metadata chips.
  - `<EmptyState>`, `<ErrorState>`: Standardized zero-data and failure UI.
  - `<Skeleton>`, `<PageSkeleton>`, `<ListSkeleton>`: Non-blocking local-first loading states.

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
