<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:tracker-system-guidelines -->
# Tracker Agent Guidelines

You MUST read and strictly adhere to the **AI Constitution** in [AI Constitution.md](file:///d:/github_projeccts/tracker/docs/07-ai/AI Constitution.md) and the rules under `.agents/rules/`:
* [Voice & Tone Guidelines](file:///d:/github_projeccts/tracker/.agents/rules/voice-and-tone.md)
* [Business Model & Product Principles](file:///d:/github_projeccts/tracker/.agents/rules/business-and-product.md)
* [Engineering & Architecture Standards](file:///d:/github_projeccts/tracker/.agents/rules/engineering-standards.md)
* [Mobile Architecture & Standards](file:///d:/github_projeccts/tracker/.agents/rules/mobile-architecture-and-standards.md)
* Skills available: `tracker-core` ([SKILL.md](file:///d:/github_projeccts/tracker/.agents/skills/tracker-core/SKILL.md)), `tracker-qa` ([SKILL.md](file:///d:/github_projeccts/tracker/.agents/skills/tracker-qa/SKILL.md)), and official `expo-*` skills under `.agents/skills/`.

### 1. Database Safety Safeguards (CRITICAL)
* **Never** use hard delete queries (`delete` or `deleteMany`) on tables that support soft deletion (contain a `deletedAt` column). Use `update` or `updateMany` to set `deletedAt = new Date()`.
* **Never** write or propose unscoped bulk deletes (e.g. `deleteMany()` without a filtering `where` object) or unsafe migrations (`migrate reset`, `db push --force-reset`).
* The Prisma client in `lib/db.ts` contains query interceptors that will block hard deletes and unscoped deletes at runtime.

### 2. Styling Consistency (CRITICAL)
* The UI styling is custom modern **Shadcn Style** powered by Tailwind CSS 4 and global custom tokens in `design-system/tokens.css` on Web.
* **Prohibited**: Do not write raw `<button>` elements, custom cards with custom borders/shadows, or custom styled text inputs in module panel files.
* **Mandatory**: You must import and reuse components from `@/design-system/components/*` on Web, and `@/components/*` + semantic tokens from `@/theme/tokens` on Mobile.

### 3. Mobile Engineering Standards (CRITICAL)
* **Native Client, Not Second Product**: Reuse canonical server domain services (`AuthService`, `WorkSessionService`, `ActivityService`, `JournalService`). Do not duplicate business rules in React Native.
* **SQLite as Cache & Outbox**: Persistent truth remains server-side. SQLite provides instant local render and optimistic `mutation_queue`.
* **Universal Deletion Lifecycle**: `Delete` ➔ moved to `Bin` (`deletedAt != null`) ➔ `Restore` (`deletedAt = null`).
* **Design System & Icons**: Standardized Lucide icons via `<TrackerIcon name="..." />` (`m/src/components/TrackerIcon.tsx`). Semantic tokens from `theme/tokens.ts`. Minimum 48px touch targets.
* **Component Architecture**: Avoid God screens (>400 lines). Extract to `components/`, `hooks/`, `presentation/`.
* **Verification Integrity**: Use exact statuses (`STATIC-VALIDATED`, `TEST-VALIDATED`, `RUNTIME-VALIDATED`). Never report Android tested without runtime execution.
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
