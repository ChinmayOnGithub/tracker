# Activity vs Task Logic

In this application, the concepts of **Activities** (Habits) and **Tasks** are defined by the following business logic:

1. **Activities (Habits)**:
   - Activities represent recurring items or habits (e.g., daily workout, meditation, bills, medicine, casual checks).
   - They are created as recurring templates (`ActivityTemplate`).
   - On any given day (such as **Today**), these active recurring templates automatically evaluate as scheduled task occurrences on your timeline.

2. **Tasks (Timeline Occurrences)**:
   - Every evaluated activity occurrence for the day is treated as a trackable **Task** inside the dashboard.
   - Users can manually create individual tasks for the day if needed.
   - Statuses are tracked on a per-day basis through an `ActivityLog` mapping.

3. **Checklist Cycling States**:
   - Each checklist task cycles through discrete lifecycle states:
     1. **Cleared (Incomplete)**: The task is active and needs attention.
     2. **Done**: Marked as completed successfully.
     3. **Canceled**: Marked as skipped or skipped/canceled for the day.
     4. **Postponed**: Delayed or rescheduled to a future date.
   - **Daily Exclusions**: Activities scheduled with a `daily` recurrence type are **not allowed to be postponed**. Therefore, their checklist cycle skips the postponed state: `Cleared` ➔ `Done` ➔ `Canceled` ➔ `Cleared`.
   - **Next-day Postpone Scheduling**: When a non-daily task is marked as `Postponed`, the recurrence engine schedules it to automatically move and appear on the **next day's timeline**. Marking it Done or Canceled on that day removes the postponed state, placing it back on its normal recurrence schedule without duplicating.
   - All state cycles write and update logs directly in the database to preserve historical tracking.
