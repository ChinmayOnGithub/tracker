<!-- BEGIN:tracker-system-guidelines -->
# Tracker Agent Guidelines

You MUST read and strictly adhere to the **AI Constitution** in [AI Constitution.md](file:///d:/github_projeccts/tracker/docs/07-ai/AI Constitution.md) and the rules under `.agents/rules/`:
* [Voice & Tone Guidelines](file:///d:/github_projeccts/tracker/.agents/rules/voice-and-tone.md)
* [Business Model & Product Principles](file:///d:/github_projeccts/tracker/.agents/rules/business-and-product.md)
* [Engineering & Architecture Standards](file:///d:/github_projeccts/tracker/.agents/rules/engineering-standards.md)
* Skills available: `tracker-core` ([SKILL.md](file:///d:/github_projeccts/tracker/.agents/skills/tracker-core/SKILL.md)) and `tracker-qa` ([SKILL.md](file:///d:/github_projeccts/tracker/.agents/skills/tracker-qa/SKILL.md)).

### 1. Database Safety Safeguards (CRITICAL)
* **Never** use hard delete queries (`delete` or `deleteMany`) on tables that support soft deletion (contain a `deletedAt` column). Use `update` or `updateMany` to set `deletedAt = new Date()`.
* **Never** write or propose unscoped bulk deletes (e.g. `deleteMany()` without a filtering `where` object) or unsafe migrations (`migrate reset`, `db push --force-reset`).
* The Prisma client in `lib/db.ts` contains query interceptors that will block hard deletes and unscoped deletes at runtime.

### 2. Styling Consistency (CRITICAL)
* The UI styling is custom modern **Shadcn Style** powered by Tailwind CSS 4 and global custom tokens in `design-system/tokens.css`.
* **Prohibited**: Do not write raw `<button>` elements, custom cards with custom borders/shadows, or custom styled text inputs in module panel files.
* **Mandatory**: You must import and reuse components from `@/design-system/components/*`:
  * `<Button>`: Standardizes loading indicators, sizes (`sm`/`md`/`lg`), colors, and micro-hover scaling.
  * `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>`: Standardizes structural card panels, border shadows, padding, and dark/light borders.
  * `<Input>`, `<Textarea>`, `<Select>`: Standardizes text boxes, error feedback blocks, focus rings, and input labels.

### 3. Business Logic Guidelines (NEW)
* **Activity vs Task Distinction**: Recurring templates (`ActivityTemplate`) model habits. Dashboard items are computed timeline occurrences (`TimelineItem`) or tasks.
* **Checklist Cycling Rules**:
  * Clicking task checkboxes cycles states directly without page/tab redirection side effects.
  * Non-Daily activities cycle: `Cleared` ➔ `Done` ➔ `Canceled` ➔ `Postponed` ➔ `Cleared`.
  * Daily activities cycle: `Cleared` ➔ `Done` ➔ `Canceled` ➔ `Cleared` (Postpone is skipped).
  * Marking a non-daily task `Postponed` must automatically reschedule the activity for the next day (`addUTCDays(log.date, 1)`) via the recurrence analysis. Any subsequent status change (Done/Canceled) must delete the postponed log, reverting the item to its normal recurrence logic.

### 4. Type Safety & Test Mocking Rules (CRITICAL)
* **No Unsafe Type Casts**: Do not use `as any`, `as unknown`, or `as object` to satisfy the TypeScript compiler unless there is no type-safe alternative. Always prefer narrowing types, defining explicit generic parameters, or extracting interface declarations.
* **Test Mocks & Bun Compatibility**: The repository uses `bun test` as its primary test runner. Test files under `__tests__` or `tests/` must import test block helpers (`describe`, `it`, `expect`, `beforeEach`, `afterEach`, `mock`) from `bun:test` instead of `vitest` or `@jest/globals`.
* **Database Mock Typing**: When mocking functions that return Prisma database entities (like `ActivityService.logActivity` returning `ActivityLog`), fully specify all properties required by the model (e.g. `userId`, `deletedAt`, `journalEntryId`, etc.) and import the model from `@prisma/client` to guarantee 100% strict type safety.
* **Clean Event Mocks**: Do not use `jest.clearAllMocks()` or `vi.clearAllMocks()` in `beforeEach` hooks in Bun tests as it causes reference errors. Instead, reset the mock call history manually by casting the mocked function to `{ mock?: { calls: unknown[][] } }` and setting its call list length to 0 (e.g., `(ActivityService.logActivity as { mock?: { calls: unknown[][] } })?.mock?.calls.length = 0`).
* **No Duplicate Implementations**: Never add duplicate methods (like `persistQueue` or `getStats`) to classes. Retain only one fully featured implementation, typically at the bottom of the module file.
<!-- END:tracker-system-guidelines -->


## AI Skill Routing

Use the on-demand skills under `.agents/skills/` instead of loading the whole AI methodology into context.

- Repository understanding: `project-analysis`, `project-audit`, `context-engineering`
- Requirements/domain: `grilling`, `domain-modeling`, `to-spec`, `to-tickets`
- Planning/orchestration: `planning-with-files`, `orchestration`, `project-memory`
- Architecture/backend: `system-design-first-principles`, `backend-design`, `api-design`, `database-design`, `data-modeling`
- Implementation quality: `test-driven-development`, `debugger`, `simplification`, `refactoring`, `repository-cleanup`
- Review/security: `code-review`, `pr-code-review`, `threat-model`, `security-review`, `dependency-audit`
- Operations: `observability-review`, `deployment-review`, `incident-review`, `performance-optimization`
- UI/web: `design-systems-frontend-architecture`, `ui-visual-composition`, `ux-usability-foundations`, `ux-writing-content-design`, `accessibility-inclusive-design`, `tailwind-css`, `web-quality`, `seo`
- Workflow: `git-workflow`, `documentation-and-adrs`, `why-we-do-this`, `retrospective`

Tracker-native skills remain authoritative for Tracker-specific behavior: `tracker-core` and `tracker-qa`.

### Context Rule
Load only the skill(s) required by the current task. Generic skills provide methodology only and must never override `SPEC.md`, the Tracker AI Constitution, architecture decisions, or `.agents/rules/`.

See `docs/07-ai/EXTERNAL_SKILLS.md` for provenance and `docs/07-ai/AI_WORKFLOW.md` for the development lifecycle.
