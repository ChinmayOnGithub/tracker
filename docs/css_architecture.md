# CSS Styling Architecture

This document describes the structure, stratification, and stylesheet hierarchy of Tracker OS. Every visual component must follow this layering rule.

---

## 1. Styling Layers & Precedence

All styles are organized into a strict bottom-up cascade:

```
tokens.css (CSS variables)
   ↓
globals.css (CSS base resets)
   ↓
design-system (Reusable primitives: Card, Button, Input)
   ↓
components (Complex widgets: Today timeline list, Calendar Grid)
   ↓
screens (Views: today, calendar, settings panels)
   ↓
utilities (Tailwind CSS custom overrides)
```

1. **`tokens.css`**: Declares global variables for colors, spacings, borders, and animations inside `:root` and `.dark`. No custom class names belong here.
2. **`globals.css`**: Standardizes HTML element defaults (body backgrounds, layout structure, scrollbar behavior, font families).
3. **`design-system/`**: Common UI primitives. All styling here is bound directly to CSS token variables.
4. **`components/`**: Feature-specific UI nodes (e.g. `TimelineItem`, `BulkActionBar`). They consume primitives, never declaring custom inline styles.
5. **`screens/`**: Organizes layout components on full pages (TodayDashboard, Calendar page).
6. **`utilities`**: Auxiliary classes. Only used for layout placement, flexing, grid spans, and widths.

---

## 2. Hard Styling Constraints (Strict Rules)

Future developers must strictly follow these rules:

* **Never Use Raw Colors**: Hex codes (e.g. `#6366f1`) or raw Tailwind color scales (e.g. `text-indigo-500`, `bg-slate-50`) must never be coded inside custom widgets. Always reference the semantic variable (e.g. `text-[var(--color-primary)]` or `bg-[var(--color-bg-base)]`).
* **Never Use Arbitrary Spacing**: Margins, paddings, and absolute gaps must map to the 8pt scale. Custom tailwind sizes (e.g. `p-3.5`, `m-7`, `gap-[15px]`) are prohibited. Use `p-3` (`12px`), `p-4` (`16px`), etc.
* **Never Duplicate Animations**: Transition durations and curves must map to `--motion-duration-fast` (150ms) or `--motion-duration-normal` (200ms).
* **Never Duplicate Breakpoints**: Responsive wrappers must strictly follow Tailwind's default breakpoints (`sm:`, `md:`, `lg:`). Custom media queries are banned.
* **Never Create Screen-Specific Button Styles**: All buttons must consume the design system's `<Button>` primitive to prevent local button style drift.
