# Tracker OS – Visual Design Language & Component Standards

This document establishes the UI styling guidelines, component primitive parameters, and accessibility requirements for Tracker OS.

---

## 1. Visual Theme & Colors

Tracker OS utilizes a curated slate/zinc palette to deliver a high-contrast, premium aesthetic.

* **Mode Values**:
  * Light Mode: Background `slate-50`, Text `slate-800`, Surface cards `white`.
  * Dark Mode: Background `zinc-950`, Text `zinc-100`, Surface cards `zinc-900`.
* **Primary Accent**:
  * Indigo-600 (`#4f46e5`) - Used for highlights, active links, primary buttons.
* **Semantic States**:
  * Success: Emerald-500 (`#10b981`)
  * Warning: Amber-500 (`#f59e0b`)
  * Danger: Rose-600 (`#e11d48`)

---

## 2. Spacing Grid & Layout Metrics

We enforce an **8-point grid spacing system** to maintain layout consistency.

```
Spacing Tokens
├── --spacing-1 : 4px   (Tight margin gaps, badge items)
├── --spacing-2 : 8px   (Labels, checklist gaps)
├── --spacing-3 : 12px  (Widget details spacing, mobile card margins)
├── --spacing-4 : 16px  (Standard padding, card body margins)
├── --spacing-6 : 24px  (Desktop view grid gaps)
└── --spacing-8 : 32px  (Section headings gaps)
```

* **Border Radii**:
  * Badges & Tags: `--radius-sm` (4px)
  * Form inputs, small buttons: `--radius-md` (8px)
  * Cards, Dialog windows, Widgets: `--radius-lg` (12px)

---

## 3. Component Primitive Conventions

When implementing new UI controls, build them using the primitive classes defined in `design-system/`:

### A. Buttons (`design-system/components/Button.tsx`)
* **Hover State**: Shifts background color or opacity by 10%. Scale animation shrinks button by 2% on active clicks (`active:scale-[0.98]`).
* **Loading Indicator**: Renders an inline spinning SVG and disables user interaction.

### B. Cards (`design-system/components/Card.tsx`)
* **Elevation**: Employs light shadows (`shadow-sm`) with border borders (`border-[var(--color-border)]`).
* **Interaction**: Hover shifts cards by adding elevation (`hover:shadow-md`) and color shifts border states.

---

## 4. Accessibility (a11y) Requirements

To support clean accessibility and screen reader layouts, all components must adhere to:

* **Keyboard Navigation**:
  * All interactive elements (buttons, inputs, links) must have clear `:focus-visible` outline rings (Indigo-500, offset 2px).
  * Do not remove focus rings without providing alternative high-contrast styles.
* **Aria Labels**:
  * Any button that only contains an icon (e.g. close buttons, refresh icons) **must** contain an explicit `aria-label` attribute describing its behavior.
* **Dialog Modals**:
  * Modals must trap keyboard focus while active (preventing users from tabbing outside the dialog).
  * Esc keypress must automatically trigger close callbacks.
  * Body scrolling must be locked (`overflow: hidden`) during dialog views.

---

## 5. Today Dashboard Layout & Chronological Timeline

The Today Dashboard operates under a single-column, distraction-free central timeline centered layout to present daily priorities with zero visual clutter:

* **Central Layout**:
  - Max width of `max-w-2xl mx-auto` to create a centered, clean readable timeline feed.
  - Sidebar columns, quick action grids, active highlight cards, and leave balance cards are completely removed.
* **Contextual Header Subtitle**:
  - Stats chips are replaced with a single contextual sentence: e.g. `"Next: Meeting in 15 min"`, `"3 overdue activities"`, or `"Nothing scheduled for the next 2 hours"`.
* **Timeline Grouping & Collapsible Sections**:
  - Every section header is collapsible: `▼ OVERDUE` (red border for items past their due date), `▼ NOW`, `▼ NEXT`, `▶ LATER`, `▼ ANYTIME`, and `▶ COMPLETED` (collapsed by default).
* **Card Compression & Visual Standards**:
  - Card heights are compressed by an additional 20% to maximize density (fitting 10-12 items on screen).
  - Timed activities show start times (e.g. `09:00`) and duration tags (e.g. `90m`). Anytime tasks show checklist circles (`☐` or `✓`).
  - Priority badges translate wordy labels into concise codes: `P1` (orange), `P2` (gray), `P3` (hidden/transparent).
  - Standardized Left-Border Colors: Blue (Google Calendar), Green (Completed), Orange (P1 High priority), Purple (Local Activity).
* **Inline Reflection Editor**:
  - Located at the bottom of the timeline feed.
  - Collapsed by default showing `"Nothing written today"` and a `"Start Writing"` button.
  - Expanding it reveals a text area. Auto-saves using a 2.5s debounce timer, on blur, and on pressing `Ctrl + S`. Status indicators (`Saving...`, `Saved`) are displayed inline.

---

## 6. Design System & Component Primitives Enforcement

To preserve product consistency across modules:
* **Modal Dialogs**: All modals must use `<Modal>` from the design system. Do not construct ad-hoc backdrop overlays or close icon buttons.
* **Cards**: All data containers must wrap contents in `<Card>`, `<CardHeader>`, `<CardBody>`, or `<CardFooter>` to enforce uniform borders, backgrounds, and drop-shadow definitions.
* **Empty States**: Render the `<EmptyState>` primitive component containing standard placeholder text and icon vectors instead of simple italic text strings.
* **Colors & Spacing**: Avoid inline Tailwind utility classes (e.g. `bg-white`, `border-slate-200`, `p-6`). Instead, utilize design token CSS variables (e.g. `bg-[var(--color-bg-surface)]`, `border-[var(--color-border)]`, `p-[var(--spacing-6)]`).

