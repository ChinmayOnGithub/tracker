# Design Tokens Specification

This document records the exact token configuration for Tracker OS. These tokens represent the permanent visual assets of the product. Developers must strictly consume these tokens.

---

## 1. Color Palette Tokens

| CSS Custom Variable | Light Value (Token) | Dark Value (Token) | Semantic Description |
|---------------------|-------------------|-------------------|----------------------|
| `--color-bg-base` | `#f8fafc` (Slate-50) | `#09090b` (Zinc-950) | Core page canvas background. |
| `--color-bg-surface` | `#ffffff` (White) | `#18181b` (Zinc-900) | Card panel/surface background. |
| `--color-border` | `#e2e8f0` (Slate-200) | `#27272a` (Zinc-800) | 1px border separator boundary. |
| `--color-text-main` | `#0f172a` (Slate-900) | `#f4f4f5` (Zinc-100) | High-contrast readable typography. |
| `--color-text-muted`| `#64748b` (Slate-500) | `#a1a1aa` (Zinc-400) | Subtitles, labels, and secondary texts. |
| `--color-primary` | `#6366f1` (Indigo-500)| `#818cf8` (Indigo-400)| Primary focus action and indicators. |
| `--color-primary-hover`| `#4f46e5` (Indigo-600)| `#6366f1` (Indigo-500)| Focus states and pressed states. |
| `--color-accent` | `#f1f5f9` (Slate-100) | `#27272a` (Zinc-800) | Sidebar active states, hover overlays. |

---

## 2. Spacing Scale Tokens

All margin, padding, gap, and grid variables are mapped to a strict 8-point system:

| CSS Custom Variable | Pixel Size | Tailwind Equivalent | Use Case Example |
|---------------------|------------|---------------------|------------------|
| `--spacing-1` | `4px` | `1` / `0.25rem` | Inner badge padding, checkbox offset. |
| `--spacing-2` | `8px` | `2` / `0.5rem` | Gap between checklist items, labels. |
| `--spacing-3` | `12px` | `3` / `0.75rem` | Inner Card padding, item offsets. |
| `--spacing-4` | `16px` | `4` / `1rem` | Main container padding, grid gaps. |
| `--spacing-6` | `24px` | `6` / `1.5rem` | Section offsets, main workspace top-margins. |
| `--spacing-8` | `32px` | `8` / `2rem` | Page margins, empty state paddings. |

---

## 3. Border & Border-Radius Tokens

All containers, modals, overlays, and buttons must conform to these boundary parameters:

* **Border Size**: Strict `1px` width.
* **Border Type**: `solid` (with `--color-border`). Double borders are forbidden.
* **Radii Scales**:
  * `--radius-sm` (`4px`): Used for badges, indicators, and small icons.
  * `--radius-md` (`8px`): Standard boundary radius for buttons, textareas, inputs, and card elements.
  * `--radius-lg` (`12px`): Frame corner radius for slide-out drawers, main modal frames, and workspace blocks.

---

## 4. Shadow Tokens

No heavy, colored, or diffused shadows are allowed:

| Shadow Name | CSS Token Configuration | Use Case Example |
|-------------|-------------------------|------------------|
| **Standard Shadow** | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Regular cards, header bounds. |
| **Elevated Shadow** | `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)` | Overlay Modals, Slide Drawers. |

---

## 5. Motion and Animation Tokens

All UI transitions must stay below 200ms:

* `--motion-duration-fast` (`150ms`): Button hover transitions, checked state shifts.
* `--motion-duration-normal` (`200ms`): Modals opening, drawer slides.
* `--motion-ease-standard` (`cubic-bezier(0.4, 0, 0.2, 1)`): Entry/exit animations.
* `--motion-ease-decelerate` (`cubic-bezier(0, 0, 0.2, 1)`): Immediate click reaction.
