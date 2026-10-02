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

### 5. Mobile Engineering Standards (CRITICAL)
* **Native Client, Not Second Product**: Reuse canonical server domain services (`AuthService`, `WorkSessionService`, `ActivityService`, `JournalService`). Do not duplicate business rules in React Native.
* **SQLite as Cache & Outbox**: Persistent truth remains server-side. SQLite provides instant local render and optimistic `mutation_queue`.
* **Universal Deletion Lifecycle**: `Delete` ➔ moved to `Bin` (`deletedAt != null`) ➔ `Restore` (`deletedAt = null`).
* **Design System & Icons**: Standardized Lucide icons via `<TrackerIcon name="..." />` (`m/src/components/TrackerIcon.tsx`). Semantic tokens from `theme/tokens.ts`. Minimum 48px touch targets.
* **Component Architecture**: Avoid God screens (>400 lines). Extract to `components/`, `hooks/`, `presentation/`.
* **Verification Integrity**: Use exact statuses (`STATIC-VALIDATED`, `TEST-VALIDATED`, `RUNTIME-VALIDATED`). Never report Android tested without runtime execution.
<!-- END:tracker-system-guidelines -->


## AI Skill Routing

Use the on-demand skills under `.agents/skills/` instead of loading the whole AI methodology into context.

### General Engineering Skills
- Repository understanding: `project-analysis`, `project-audit`, `context-engineering`
- Requirements/domain: `grilling`, `domain-modeling`, `to-spec`, `to-tickets`
- Planning/orchestration: `planning-with-files`, `orchestration`, `project-memory`
- Architecture/backend: `system-design-first-principles`, `backend-design`, `api-design`, `database-design`, `data-modeling`
- Implementation quality: `test-driven-development`, `debugger`, `simplification`, `refactoring`, `repository-cleanup`
- Review/security: `code-review`, `pr-code-review`, `threat-model`, `security-review`, `dependency-audit`
- Operations: `observability-review`, `deployment-review`, `incident-review`, `performance-optimization`
- UI/web: `design-systems-frontend-architecture`, `ui-visual-composition`, `ux-usability-foundations`, `ux-writing-content-design`, `accessibility-inclusive-design`, `tailwind-css`, `web-quality`, `seo`
- Workflow: `git-workflow`, `documentation-and-adrs`, `why-we-do-this`, `retrospective`

### Mobile Skill Routing (Expo / React Native)

> **Rule**: Always load `expo-overview` first for any Expo/EAS task. It detects the goal and routes to the right sub-skill. Never load all mobile skills at once.

| User goal | Skills to load (in order) |
|-----------|--------------------------|
| Any Expo/EAS task | `expo-overview` → then route below |
| Navigation, routing, tabs, modals, sheets | `expo-router` |
| Native UI, Apple HIG, SF Symbols, semantic colors | `expo-native-ui` |
| Native controls: BottomSheet, Picker, Slider, Switch | `expo-ui` |
| Animations, gestures, Reanimated, haptics | `expo-animation` |
| Design tokens, component library, theme consistency | `expo-design-system` |
| Any networking, API calls, caching, offline states | `expo-data-fetching` |
| Web → native migration, DOM → RN, CSS → StyleSheet | `expo-web-to-native` |
| Development build, physical device, Expo Go limits | `expo-dev-client` |
| Agent-driven simulator, cloud iOS/Android, screenshots | `eas-simulator` |
| Native module (Swift/Kotlin), config plugin | `expo-module` |
| CI/CD, build pipelines, workflows | `eas-workflows` |
| OTA updates, runtime versions, rollouts | `eas-update` |
| OTA crash rate, adoption, payload size | `eas-update-insights` |
| Launch performance, TTI, production observability | `eas-observe` |
| Android/iOS build, TestFlight, Play Store, App Store | `eas-app-stores` |
| Adding React Native to existing native app | `expo-brownfield` |
| iOS App Clip | `expo-app-clip` |
| DOM components in webview | `expo-dom` |
| SDK upgrade, dependency compatibility | `expo-upgrade` |
| Official example integrations (Stripe, Clerk, etc.) | `expo-examples` |
| Accessibility (TalkBack, VoiceOver) | `accessibility-inclusive-design` |
| Submit skill feedback or bug reports | `expo-skill-feedback` |
| Evaluate a skill end-to-end | `expo-skill-eval` |

#### Example dispatch patterns
```
"Fix Android OAuth crash"
  → expo-overview → expo-dev-client → debugger

"Add gesture-based swipe-to-delete"
  → expo-overview → expo-animation

"Ship to Google Play"
  → expo-overview → eas-app-stores

"Offline mutation not syncing"
  → expo-data-fetching → tracker-core → debugger

"App startup is slow on Android"
  → expo-observe → eas-update-insights → performance-optimization

"Agent: screenshot and verify the login screen"
  → eas-simulator (requires expo-mcp local capabilities)
```

### Expo MCP Server

The Expo MCP server is configured in `.agents/mcp_config.json`. It provides:
- Live Expo documentation fetching
- Compatible package installation via `npx expo install`
- EAS build monitoring and crash data
- **Local capabilities** (screenshots, simulator interaction, DevTools) when `expo-mcp` is installed

**Local capabilities setup** (already installed — `expo-mcp@0.2.4` in `m/`):
```sh
# Start dev server with MCP capabilities enabled
cd m
EXPO_UNSTABLE_MCP_SERVER=1 npx expo start
```
After starting, reconnect/restart the MCP server connection in Antigravity to refresh capabilities.

> **Authentication**: The Expo MCP server requires OAuth. You will be prompted to authenticate with your Expo account on first use.

### Tracker-Native Skills (Authoritative)

`tracker-core` and `tracker-qa` remain authoritative for Tracker-specific behavior. Generic Expo skills provide methodology only and must never override:
- `SPEC.md`
- The Tracker AI Constitution (`docs/07-ai/AI Constitution.md`)
- Architecture decisions in `.agents/rules/`
- Domain semantics (Activity, TaskOccurrence, recurrence, outbox, postpone)

### Context Rule
Load **only** the skill(s) required by the current task. Generic skills provide methodology only.

See `docs/07-ai/EXTERNAL_SKILLS.md` for provenance and `docs/07-ai/AI_WORKFLOW.md` for the development lifecycle.
