# Tracker OS — Design System & Frontend Architecture

## 1. Design Principles

Tracker is a personal life operating system designed to feel:
- **Clean + Compact + Neutral + Functional + Coherent**
- **Token-Driven**: All colors, radiuses, shadows, typography steps, and spacing belong to a single semantic hierarchy defined in `design-system/tokens.css` and mapped into Tailwind CSS 4 in `app/globals.css`.
- **Component-Driven**: Primitives own visual styling, focus outlines, and states. Modules and pages own layout and composition.
- **Future-Migration Ready**: A complete visual overhaul (e.g. changing theme, density, primary color, or surface radius) can be executed primarily by tweaking shared tokens and canonical primitives rather than modifying dozens of module files.

---

## 2. Component Hierarchy

```text
Design Tokens (design-system/tokens.css & app/globals.css)
      ↓
Primitive Components (Button, Input, Badge, Surface, Skeleton)
      ↓
Composite Components (PageHeader, SectionHeader, FormField, List, EmptyState, ErrorState)
      ↓
Module Panels (TodayDashboard, ActivityManager, Calendar, JournalPanel, NotesPanel, SettingsPanel)
      ↓
Route Pages (app/(dashboard)/**/page.tsx)
```

**Cardinal Rule**: Pages and module panels must never independently reinvent primitive UI (such as raw buttons, custom cards, unstyled inputs, or ad-hoc empty states).

---

## 3. Token Architecture

### 3.1 Semantic Colors
Defined in `design-system/tokens.css` with automatic dark mode contrast pairs:
| Semantic Token | Purpose | Light Value | Dark Value |
| :--- | :--- | :--- | :--- |
| `--background` | Base background behind panels | `#f8fafc` | `#09090b` |
| `--foreground` | Highest-contrast primary text | `#0f172a` | `#f8fafc` |
| `--surface` | Canonical surface panel | `#ffffff` | `#121215` |
| `--surface-muted` | Subordinate containers / sidebars | `#f1f5f9` | `#18181b` |
| `--surface-elevated` | Dropdowns, popovers, modals | `#ffffff` | `#1c1c21` |
| `--border` | Default structural border | `#e2e8f0` | `#27272a` |
| `--border-subtle` | Soft internal separators | `#f1f5f9` | `#1e1e24` |
| `--border-strong` | Active / focused borders | `#cbd5e1` | `#3f3f46` |
| `--primary` | Canonical brand & active accents | Configurable | Configurable |
| `--primary-foreground` | High-contrast text on primary | `#ffffff` | `#ffffff` |
| `--secondary` | Neutral action button backgrounds | `#f1f5f9` | `#27272a` |
| `--muted` | Subtle pill backgrounds | `#f1f5f9` | `#27272a` |
| `--muted-foreground` | Secondary labels & timestamps | `#64748b` | `#a1a1aa` |
| `--accent` | Hover & selection highlight | `#f1f5f9` | `#27272a` |
| `--destructive` | Dangerous actions & error alerts | `#ef4444` | `#f87171` |
| `--success` | Affirmative & completed status | `#10b981` | `#34d399` |
| `--warning` | Cautionary state & pending alerts | `#f59e0b` | `#fbbf24` |
| `--focus-ring` | Keyboard focus ring indicator | `rgba(59,130,246,0.6)` | `rgba(59,130,246,0.7)` |

### 3.2 Radius Scale
| Token | Pixel Value | Typical Usage |
| :--- | :--- | :--- |
| `--radius-xs` | `2px` | Badges, small pills, keyboard shortcut hints |
| `--radius-sm` | `4px` | Small buttons, compact controls |
| `--radius-md` | `6px` | Standard buttons, text inputs, segmented tabs |
| `--radius-lg` | `8px` | Cards, surfaces, modal dialogs, popovers |
| `--radius-xl` | `12px` | Large floating dialogs, sheet headers |
| `--radius-full` | `9999px` | Circular avatars, rounded filter pills |

### 3.3 Elevation & Shadow Scale
Shadows are reserved for elements visually floating above another layer to prevent "everything is a card" clutter:
- `--elevation-flat`: `none` (default for flat surfaces and embedded lists)
- `--elevation-surface`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)` (subtle structural separation)
- `--elevation-raised`: `0 4px 6px -1px rgba(0, 0, 0, 0.08)` (hovered objects, draggable items)
- `--elevation-floating`: `0 10px 15px -3px rgba(0, 0, 0, 0.1)` (dropdown menus, popovers, bulk action bar)
- `--elevation-modal`: `0 20px 25px -5px rgba(0, 0, 0, 0.2)` (dialogs, command palette)

### 3.4 Spacing Scale
Predictable 4px grid steps: `4px` (`--spacing-1`), `8px` (`--spacing-2`), `12px` (`--spacing-3`), `16px` (`--spacing-4`), `20px` (`--spacing-5`), `24px` (`--spacing-6`), `32px` (`--spacing-8`), `40px` (`--spacing-10`), `48px` (`--spacing-12`).

---

## 4. Canonical Primitives & Composites

All canonical components are exported from `@/design-system`:

### 4.1 Button & IconButton
- **Variants**: `primary`, `secondary`, `outline`, `ghost`, `danger`/`destructive`, `warning`, `link`.
- **Sizes**: `sm` (h-8), `md` (h-9), `lg` (h-10), `icon-sm` (w-8 h-8), `icon` (w-9 h-9).
- **Features**: Accessible keyboard focus ring (`ring-[var(--focus-ring)]`), automated loading spinner with disabled state (`isLoading`), icon slot alignment.

### 4.2 Surface & Card
- `<Surface variant="flat" | "subtle" | "interactive" | "raised" | "floating">`
- Supports `<SurfaceHeader>`, `<SurfaceContent>`, `<SurfaceFooter>`.
- Use `<Surface>` or `<List>` over `<Card>` when creating flat lists, sidebars, or table containers.

### 4.3 PageHeader & SectionHeader
- `<PageHeader title="..." description="..." eyebrow="..." actions={<Button>...</Button>} />`: Standardizes page-level headers.
- `<SectionHeader title="..." description="..." badge={<Badge>...</Badge>} action={<Button>...</Button>} />`: Standardizes contextual inner sections.

### 4.4 FormField & Inputs
- Canonical inputs: `<Input>`, `<Textarea>`, `<Select>`, `<SearchInput>`.
- `<FormField>` composite:
  ```tsx
  <FormField error={errors.name}>
    <FormLabel required>Activity Name</FormLabel>
    <FormControl>
      <Input value={name} onChange={...} />
    </FormControl>
    <FormDescription>Shown in the daily checklist</FormDescription>
    <FormError />
  </FormField>
  ```

### 4.5 EmptyState & ErrorState
- `<EmptyState icon={<FileText />} title="No notes yet" description="..." primaryAction={<Button>Create</Button>} />`
- Supports `compact` prop for narrow sidebars and modal drawers.

### 4.6 List System
- `<List>`, `<ListItem>`, `<ListItemLeading>`, `<ListItemContent>`, `<ListItemTrailing>`.
- Replaces raw nested divs for structured rows in activities, notes, and links.

### 4.7 Skeleton Suite
- `<Skeleton className="..." />`
- Pre-composed layouts: `<PageSkeleton>`, `<SectionSkeleton>`, `<ListSkeleton>`, `<CardSkeleton>`, `<TableSkeleton>`.
- Preserves Tracker's local-first rendering architecture (never blocks memory or IndexedDB cache).

---

## 5. Rules for Future Evolution

### When to create a new component:
1. The visual or behavioral pattern repeats in **2 or more modules**.
2. It establishes an accessibility invariant (e.g. keyboard navigation, ARIA attributes).
3. It standardizes an interactive lifecycle (e.g. loading, error, empty).

### When NOT to create a component:
1. One-off JSX layouts that only exist in a single module.
2. Abstractions that merely wrap a single line of standard CSS without adding behavioral or structural rules.
3. Module-specific business workflows (keep business logic in `lib/services/*` or module domain).

### How to Perform a Future Visual Redesign
If Tracker OS adopts a new visual identity (e.g. Minimalist, Vercel-like, Linear-like, or Dense Pro):
1. **Color Palette / Dark Mode**: Edit CSS variables in `design-system/tokens.css`.
2. **Border Radii**: Adjust `--radius-*` tokens in `design-system/tokens.css` (e.g. set all to `0px` for brutalist/sharp look or `12px` for ultra-rounded).
3. **Density / Height**: Adjust the base button and input sizing in `design-system/components/Button.tsx` and `design-system/components/Input.tsx`.
4. **Elevation**: Adjust `--elevation-*` shadows in `tokens.css`.
5. **No module page edits required**: Because all modules consume `@/design-system` primitives and semantic tokens, visual changes automatically propagate across the entire product.
