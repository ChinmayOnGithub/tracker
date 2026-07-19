<!-- BEGIN:tracker-system-guidelines -->
# Tracker Agent Guidelines

You MUST read and strictly adhere to the **AI Constitution** in [AI Constitution.md](file:///d:/github_projeccts/tracker/docs/07-ai/AI Constitution.md) and the handbook directories under `docs/` before writing any code.

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
<!-- END:tracker-system-guidelines -->
