# Design Language v1.0 Specification

This document details the visual rules, layout structure, color guidelines, and interactive hierarchy of Tracker OS. Every component, screen, and utility must comply with these guidelines.

---

## 1. Information & Typographic Hierarchy

### Document Structure
- Every page has exactly one `<h1>` header defining the active workspace or view.
- Sub-headings must follow a strict sequential structure: `<h2>` for section headers, `<h3>` for cards, and `<h4>` for inline list item categories.

### Typography Scales (Inter / System Sans)
* **Page Title (h1)**: 20px / 1.25rem, Extra Bold, Tracking Tight (`text-xl font-black tracking-tight`).
* **Section Title (h2)**: 14px / 0.875rem, Bold, Tracking Tight (`text-sm font-bold tracking-tight`).
* **Card / Item Title (h3)**: 12px / 0.75rem, Semi-Bold, Standard (`text-xs font-semibold`).
* **Metadata & Badges (h4/span)**: 10px / 0.625rem, Extra Bold / Medium (`text-[10px] font-bold` or `font-medium`).
* **Body / Paragraphs**: 12px / 0.75rem, Regular / Medium (`text-xs font-normal` or `font-medium`).
* **Time / Numbers (Mono)**: 10px / 0.625rem, Bold Monospace (`font-mono text-[10px] font-bold`).

---

## 2. Color & Tone Philosophy

### Semantic Colors
All colors must utilize predefined semantic CSS variables mapping to active themes. Direct hex codes or tailwind color overrides (e.g. `text-blue-500`) are strictly forbidden.

* **Base Canvas**: `--color-bg-base` (Slate-50 in Light, Zinc-950 in Dark).
* **Surface Containers**: `--color-bg-surface` (White in Light, Zinc-900 in Dark).
* **Borders**: `--color-border` (Slate-200 in Light, Zinc-800 in Dark).
* **Text Main**: `--color-text-main` (Slate-900 in Light, Zinc-100 in Dark).
* **Text Muted**: `--color-text-muted` (Slate-500 in Light, Zinc-400 in Dark).
* **Primary Accent**: `--color-primary` (Indigo-500 in Light, Indigo-400 in Dark).
* **Primary Hover**: `--color-primary-hover` (Indigo-600 in Light, Indigo-500 in Dark).
* **Accent Selection**: `--color-accent` (Slate-100 in Light, Zinc-800 in Dark).

---

## 3. Spacing, Borders, and Radii Scales

### 8-Point Grid Spacing Scale
All margins, paddings, gap sizes, and heights must align to the 8-point grid:
- `4px` (`--spacing-1`): Micro gaps, badge paddings, outline offsets.
- `8px` (`--spacing-2`): List item gaps, form input labels.
- `12px` (`--spacing-3`): Inner card padding, small screen elements.
- `16px` (`--spacing-4`): Page borders, grid gap spans, sidebar paddings.
- `24px` (`--spacing-6`): Header bottom margins, section divisions.
- `32px` (`--spacing-8`): Large hero paddings, zero-state spacings.

### Borders
- Card, Input, Sidebar, Header, Modal, and List boundaries must use a uniform 1px solid border matching `--color-border`.

### Radii Scale
- **Small (4px)**: `--radius-sm` — Badges, small checkboxes, indicator dots.
- **Medium (8px)**: `--radius-md` — Buttons, inputs, textareas, selectors, cards.
- **Large (12px)**: `--radius-lg` — Modals, slide-in drawers, main wrapper lists.

---

## 4. Animation Language

- Transitions must never feel slow or slide across large distances.
- **Normal Transitions**: `--motion-duration-normal` (200ms) with ease-standard curve (`cubic-bezier(0.4, 0, 0.2, 1)`). Used for drawers, modals, and tab switches.
- **Fast Transitions**: `--motion-duration-fast` (150ms) with ease-decelerate curve (`cubic-bezier(0, 0, 0.2, 1)`). Used for button hovers, checklist completions, state changes, and focus indicators.

---

## 5. Interaction & State Specifications

- **Hover**: Shift backgrounds by 10% opacity change (e.g. `hover:bg-[var(--color-accent)]/60`). Text main color should become more prominent.
- **Focus**: Standardize focus states to clear focus-visible borders. Avoid browser defaults. Use `focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]`.
- **Active / Pressed**: Subtle scale reduction on click (`active:scale-[0.98]` or `active:bg-opacity-90`).
- **Disabled**: Apply 40% opacity (`opacity-40`) and disable cursor input (`cursor-not-allowed`).

---

## 6. Accessibility & Responsiveness

- All icons must have clear labeling (`aria-label` or description texts) for screen readers.
- All interactive controls must support full keyboard navigation (Tab indices, Enter to select, Escape to close).
- Layouts must dynamically wrap:
  - **Desktop (>1024px)**: Dual column display (Permanent Sidebar + Workspace).
  - **Tablet (768px - 1024px)**: Collapsed sidebar (slide drawer on hamburger menu trigger).
  - **Mobile (<768px)**: Full width linear layout stack. Spacing scales down (spacing-4 becomes spacing-3).

---

## 7. Core Screen Archetypes

### Today Dashboard
- High density overview timeline.
- Segments activities into Overdue, Now, Next, Later, Anytime, and Completed.
- Zero decorative metrics cards or dashboards.

### Calendar View
- 7x5 cell grid layout.
- Integrates Google Calendar event details directly next to local occurrences using color borders.
- Hovering day cells highlights target date options.

### Forms & Dialogs
- Single scroll modals (no multi-step wizards).
- Place advanced or optional attributes inside a collapsed accordion.
- Action footers must always right-align buttons (Secondary/Cancel first, Primary/Save last).
