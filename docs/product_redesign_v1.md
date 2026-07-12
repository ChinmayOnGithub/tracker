# Tracker OS — Product Redesign v1 Specification

This document details the product design overhaul of Tracker OS, moving from a developer-built grid dashboard into a premium, calm, desktop-grade personal operating system.

---

## 1. TODAY SCREEN (The Command Center)

### Before
- A grid of task sections (Overdue, Now, Next, Later, Anytime, Completed) wrapped inside individual card borders, paired with a debounced text-reflection field at the bottom.
- Visual weight is fragmented across multiple boxes, headers, and action icons.

### Problems
- **Card Clutter**: Each timeline bucket is wrapped in a hard Card container, creating visual boxes inside boxes (dashboard feeling).
- **No Focus Anchor**: There is no strong visual contrast showing the *current active moment*.
- **Scattered Actions**: Hover actions are cluttered on the right edge, causing layout shifting.

### Proposed Layout (Unified Linear Feed)
- A clean, borderless center column feed (`max-w-xl mx-auto`).
- The screen is divided into three natural focus zones:
  1. **Immediate Focus**: A dense, high-contrast block showing what is active *Now* or *Overdue*, highlighted by a left-hand thick indicator.
  2. **The Agenda Timeline**: A timeline feed representing *Next*, *Later*, and *Anytime* items.
  3. **Writing Surface (Reflection)**: Integrated directly into the page flow at the end of the timeline, rather than separated by card dividers.

### UX Reasoning
- **Information First**: Removing card borders decreases visual boundaries, making text elements the primary indicators.
- **Calmness**: Timeline items are rendered as a continuous list, resembling Apple Reminders or Things 3.

### Wireframe
```
+--------------------------------------------------------------+
| Today                                       [New Activity]   |
| Sunday, July 12 • 1 overdue task                             |
| ------------------------------------------------------------ |
|                                                              |
|   ! OVERDUE (1)                                              |
|     [ ] Review Expenses (P1)                                 |
|                                                              |
|   ● NOW                                                      |
|     [ ] Core Domain Refactor (09:00 - 11:30)                 |
|                                                              |
|   ○ NEXT & LATER                                             |
|     [ ] Weekly Team Synch (13:00)                            |
|     [ ] Log Weight (18:00)                                   |
|                                                              |
|   - ANYTIME                                                  |
|     [ ] Push Commit (Personal)                               |
|                                                              |
|   ✓ COMPLETED (2)                                            |
|     [x] Read Docs                                            |
|                                                              |
| ------------------------------------------------------------ |
|  Daily Reflection                                            |
|  [ Write how today was...                                ]   |
+--------------------------------------------------------------+
```

### Interaction Flow
1. Checkbox click completes/undos the task with a smooth fade-out (duration 150ms).
2. Hovering an item reveals discrete actions (Skip, Snooze, Edit) on the right edge without layout reflows.

---

## 2. CALENDAR (Notion-Calendar Inspired Planner)

### Before
- A monthly calendar grid taking up the entire viewport, with week/agenda views hidden under segmented control buttons.

### Problems
- **Month Fatigue**: A month view is static and doesn't help users plan their immediate days.
- **Agenda Disconnection**: Google Calendar sync events and local template occurrences are difficult to cross-reference within monthly day boxes.

### Proposed Layout (Agenda-First Split Layout)
- **Left Column (1/3 Width)**: Clean, high-density 14-day vertical Agenda timeline showing all upcoming task details, time bounds, and locations.
- **Right Column (2/3 Width)**: Dynamic Week grid showing visual hour slots and time allocations, letting users drag/drop items or map out calendars.
- Month grid acts as a collapsed navigation popover rather than the primary interface.

### UX Reasoning
- **Agenda-First**: Planning starts with "What is my schedule tomorrow/this week?" rather than "What is my schedule on the 28th of next month?".
- **Density**: Cross-referencing Google Calendar events with local tasks in a split layout reduces layout switching.

### Wireframe
```
+--------------------------------------------------------------+
| July 2026                               [Today] [<] [>]      |
| ------------------------------------------------------------ |
|  [ AGENDA - NEXT 14 DAYS ]   | [ WEEK VIEW - 7 DAYS GRID ]   |
|                              |                               |
|  Today (Sun 12)              |      Sun 12  Mon 13  Tue 14   |
|   09:00 Core Refactor        | 09:00 [Task]                  |
|   13:00 Team Synch           | 10:00        [Meeting]        |
|                              | 11:00                 [Task]  |
|  Tomorrow (Mon 13)           |                               |
|   10:00 Client Meeting       |                               |
|                              |                               |
+--------------------------------------------------------------+
```

### Interaction Flow
1. Selecting a day on the Agenda instantly scrolls the Week grid to that specific day context.
2. Clicking a slot in the Week grid opens `<TemplateModal>` pre-populated with that day/time.

---

## 3. ACTIVITIES (Things 3 Inspired Manager)

### Before
- Search bar, three filter selects, sorting dropdown, and a bulk selection bar placed on top of cards showing template information.

### Problems
- **Visual Overhead**: The screen looks like a database admin console.
- **Slow Creation**: Creating or editing forces navigation through complex inputs.

### Proposed Layout (Ultra-Minimal List)
- Single page checklist layout:
  - **Top Row**: Instant search bar (`Search activities...`) with no label, completely borderless, anchored by a bottom separator.
  - **Left Side**: Simple vertical folder menu of categories (All, Personal, Work, Health, Chores).
  - **Right Side**: Clean checklist showing active templates.
- Advanced filters are hidden inside a toggle, making search the primary interface.

### UX Reasoning
- **Things 3 Philosophy**: Tasks should feel like simple lines of text. Card containers are removed.
- **Search-First**: Finding templates is fastest when entering a query directly in an auto-focused search bar.

### Wireframe
```
+--------------------------------------------------------------+
| [Search activities... (cmd+k)]                [New Activity] |
| ------------------------------------------------------------ |
|  CATEGORIES       |  ACTIVITIES                              |
|                   |                                          |
|  - All            |  [ ] Daily Journal (Daily • Personal)    |
|  - Personal       |  [ ] Gym Workout (Weekly • Fitness)      |
|  - Work           |  [ ] Rent Payment (Monthly • Finance)    |
|  - Health         |                                          |
|                   |                                          |
+--------------------------------------------------------------+
```

### Interaction Flow
1. Focus search bar (`Cmd + K`), type a query, and the activities list filters instantly.
2. Double-clicking an activity item launches the inline edit drawer on the right.

---

## 4. JOURNAL (Apple Notes Canvas)

### Before
- Two column grid. Left side lists past dates as small cards, right side contains the editor fields.

### Problems
- **Bypassed Editor**: The actual writing workspace is compressed and surrounded by secondary metadata inputs.
- **Card Fragmentation**: Selecting dates requires paging through multiple card components.

### Proposed Layout (Focused Canvas)
- **Left Sidebar**: Thin scrollbar listing entries sorted by date (Title, Date, snippet text).
- **Right Editor Workspace (Apple Notes style)**:
  - Full-screen wide canvas, desaturated base, zero border bounds.
  - Large bold heading for the date.
  - Minimal mood emoji picker inline.
  - A clean writing surface that expands vertically.

### UX Reasoning
- **Apple Notes Philosophy**: Writing requires complete visual calm. Stripping card frames, borders, and margins helps the user focus entirely on capturing ideas.

### Wireframe
```
+--------------------------------------------------------------+
| JOURNAL                                       [New Entry]    |
| ------------------------------------------------------------ |
|  ENTRIES HISTORY  |  WRITING CANVAS                          |
|                   |                                          |
|  July 12, 2026    |  Sunday, July 12                         |
|   Today felt cal  |  Mood: [ 🤩 ] [ 😊 ] [ 😐 ] [ 😔 ] [ 😤 ] |
|                   |                                          |
|  July 11, 2026    |  Write today's reflection here...        |
|   Reviewing expen |                                          |
|                   |                                          |
+--------------------------------------------------------------+
```

### Interaction Flow
1. Selecting an entry on the left list loads the content on the right.
2. Autosave commits content to PostgreSQL in the background.
