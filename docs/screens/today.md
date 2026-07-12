# Screen Specification: Today Dashboard

## 1. Purpose
The Today Dashboard is the main control center of the user's life, compiling overdue tasks, upcoming appointments, and daily routines in chronological buckets.

---

## 2. Layout & Structure
- **Layout**: Single column centralized feed (`max-w-2xl mx-auto`).
- **Paddings**: Page padding of `24px` on desktop, `16px` on mobile.
- **Top Margin**: `24px` from page header boundary.

---

## 3. Core Components Used
- `<TodayDashboard>`: Central wrapper.
- `<Skeleton>`: For calendar/timeline async loading placeholder.
- `<EmptyState>`: Rendered when both local items and calendar events are empty.
- `<Card>`: Outer wrappers for timeline item nodes.
- `<Button>`: Quick completion or undo action triggers.

---

## 4. Allowed Interactions
- **Habit Check**: Click checkbox to mark activity complete (fires transition check under 150ms).
- **Undo Check**: Clicking green checkbox on completed item deletes log.
- **Snooze**: Direct inline clock button click shifts timed template +15 minutes.
- **Skip**: Direct inline X button marks task skipped for today.
- **Reschedule**: Shifts task target date to tomorrow.
- **Edit**: Inline edit icon button triggers `<TemplateModal>` for that activity.

---

## 5. Design Constraints (Forbidden Items)
- **No Analytics Widgets**: Do not place charts, completion streak statistics, heatmaps, or progress widgets.
- **No Decorative Graphics**: Only display functional activity icons.
