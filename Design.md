# Tracker Design System & UI Specifications (Design.md)

**Version:** 2.0.0  
**Design Paradigm:** Premium Shadcn-style components integrated with Linear's technical product density, near-black canvas depth, and keyboard-first productivity patterns.

This document defines the exact visual, structural, and behavioral standards for the Tracker user interface. All future features and modifications must adhere strictly to these rules.

---

## 1. Visual Philosophy & Aesthetic

Tracker combines **Shadcn-inspired component boundaries** with **Linear's density and deep surfaces**:
- **Zero Decorative Noise**: Depth is achieved entirely through a multi-step surface color ladder and hairline borders. No large fuzzy drop shadows or atmospheric gradients are allowed on dark pages.
- **Deep Canvas Anchor**: The default workspace canvas is a near-black slate (#010102).
- **Keyboard-First Rhythm**: Every panel layout must display relevant hotkeys inside visual `<kbd>` tags and interface with the global Command Palette.
- **Data Densities**: Metrics, lists, and tables use monospaced numbers to ensure layout alignment and high scannability.

---

## 2. Color Palette & Semantic Tokens

All values map to CSS variables in `@/design-system/tokens.css`. Never hardcode raw hex codes.

### Canvas & Surface Ladder
| Token | Hex Value | Use Case |
| :--- | :--- | :--- |
| `var(--color-bg-base)` | `#010102` | Default page viewport background (deep near-black canvas) |
| `var(--color-bg-surface)` | `#0f1011` | Default structural cards, panel background (Surface-1) |
| `var(--color-bg-surface-hover)` | `#141516` | Hover states, active/focused card highlight (Surface-2) |
| `var(--color-bg-muted)` | `#18191a` | Contextual menus, input backdrops, dropdowns (Surface-3) |
| `var(--color-bg-popover)` | `#191a1b` | Overlays, dialogs, floating tooltips (Surface-4) |

### Borders & Accent Lines
| Token | Hex Value | Use Case |
| :--- | :--- | :--- |
| `var(--color-border)` | `#23252a` | Default hairline division borders (1px) |
| `var(--color-border-hover)` | `#34343a` | Hovered input borders, active focus accents |
| `var(--color-border-strong)` | `#3e3e44` | Strong dividers, tertiary lines |

### Typography Ink
| Token | Hex Value | Use Case |
| :--- | :--- | :--- |
| `var(--color-text-main)` | `#f7f8f8` | Primary headlines, bold tags, high-contrast values |
| `var(--color-text-muted)` | `#d0d6e0` | Secondary copy, metadata lists, subtitle text |
| `var(--color-text-subtle)` | `#8a8f98` | Helper text, disabled states, inactive tabs |

### Branding & Accent Colors
| Token | Hex Value | Use Case |
| :--- | :--- | :--- |
| `var(--color-primary)` | `#5e6ad2` | Brand identity accent (lavender-blue), focus rings, primary CTA |
| `var(--color-primary-hover)` | `#828fff` | Hover state of primary CTAs |
| `var(--color-primary-focus)` | `#5e69d1` | Focus ring outline color |
| `var(--color-success)` | `#27a644` | Success status, configured state indicator |
| `var(--color-danger)` | `#da373c` | Destruction events, delete actions, missing states |

---

## 3. Typography Scale

All typography uses **Inter** (sans-serif) for labels/text and **JetBrains Mono** / **Geist Mono** for numbers, code blocks, and tags.

| Level | Size | Weight | Line Height | Letter Spacing | Target Elements |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-xl` | 80px | 600 | 1.05 | -3.0px | Main hero headings |
| `display-lg` | 56px | 600 | 1.10 | -1.8px | Large dashboard headers |
| `display-md` | 40px | 600 | 1.15 | -1.0px | Module-level page headers |
| `headline` | 28px | 600 | 1.20 | -0.6px | Standard section titles |
| `card-title` | 22px | 500 | 1.25 | -0.4px | Cards header labels |
| `subhead` | 20px | 400 | 1.40 | -0.2px | Subtitles, helper headers |
| `body-lg` | 18px | 400 | 1.50 | -0.1px | Feature descriptions |
| `body` | 16px | 400 | 1.50 | -0.05px | Default content copy |
| `body-sm` | 14px | 400 | 1.50 | 0px | Form field copy, grid labels |
| `caption` | 12px | 400 | 1.40 | 0px | Meta stats, helper subtitles |
| `button` | 14px | 500 | 1.20 | 0px | Interactive control labels |
| `eyebrow` | 13px | 500 | 1.30 | +0.4px | Small capitalized indicators |
| `mono` | 13px | 400 | 1.50 | 0px | Monospaced tables/numbers |

---

## 4. Spacing & Grid Metrics

Tracker relies on an **8-point base grid system** (multiples of 8px).

- `xxs`: 4px (badge padding, element spacing)
- `xs`: 8px (small gap, input label height)
- `sm`: 12px (inner elements spacing)
- `md`: 16px (standard component margins, inner card padding)
- `lg`: 24px (standard layout columns gap, outer card padding)
- `xl`: 32px (large sectional margins)
- `xxl`: 48px (major page sections gap)
- `section`: 96px (outer page boundaries)

---

## 5. Shape & Roundness Scale

Uniform rounding system used throughout:
- `xs`: 4px (Status badges, chips, mini icons)
- `sm`: 6px (Dropdown selection pills, sub-nav links)
- `md`: 8px (Form inputs, textareas, select menus, standard buttons)
- `lg`: 12px (Structural panels, standard cards, dialog frames)
- `xl`: 16px (Large interactive modals, screenshot panels)
- `pill`/`full`: 9999px (Avatar circles, pill status tags)

---

## 6. Page & Workspace Layout (Sidebar Position)

### Primary Workspace Layout
All admin/app pages use a **left-hand primary navigation sidebar**:
- **Sidebar Width**: 240px wide. Fixed on desktop, collapsible to icon-only (56px) or hidden on mobile.
- **Sidebar Theme**: Anchored to deep background (`var(--color-bg-base)`), using 1px vertical hairline divider `border-r border-[var(--color-border)]` to separate from the main viewport.
- **Main Viewport**: Centered content area spanning a max-width of 1280px, padded with `p-6` or `p-8` spacing.

### Right-Side Split Pane (Details Sidebar)
When a user clicks on an item in a list (e.g., Vault documents, Calendar activities):
- **Details Drawer Width**: 360px or 400px wide.
- **Placement**: Snaps directly to the right border of the main viewport.
- **Interaction**: Slides out from the right using snappy animations (`duration-150 ease-out`), displaying metadata, actions, and audit histories.

---

## 7. Component Rules (Banning Raw Custom Blocks)

Do not write raw HTML elements with ad-hoc Tailwind classes. Use design system components:

### A. Buttons (`@/design-system/components/Button`)
- Format: `<Button variant="primary" size="md">Click Me</Button>`.
- Allowed variants: `primary` (lavender), `secondary` (charcoal/surface-1), `outline` (thin border), `ghost` (flat text), `danger` (red state).
- Interactive states: Built-in transition scaling (`active:scale-98` for click, `hover:scale-102` for mouse-over).

### B. Cards (`@/design-system/components/Card`)
- Always compose layout containers with `<Card>`, `<CardHeader>`, `<CardBody>`, and `<CardFooter>`.
- Standardizes borders (1px hairline `var(--color-border)`), backgrounds, and hover highlights.

### C. Forms (`@/design-system/components/Input`, `Textarea`, `Select`)
- Retains uniform focus ring outlines (`var(--color-primary-focus)` at 50% opacity).

---

## 8. Keyboard Shortcuts & kbd Elements
- Keyboard shortcuts must be displayed visually using `<kbd>` tags next to actions or inside command guides:
  ```tsx
  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded shadow-sm text-[var(--color-text-muted)]">
    ⌘K
  </kbd>
  ```
