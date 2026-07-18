# Component Library Specification

This document defines all reusable primitives and compound widgets of Tracker OS. For each component, we list the purpose, variants, and Figma-like state guidelines.

---

## 1. UI Primitives

### Button
* **Purpose**: Primary interactive node to trigger database commits, navigation, or form submissions.
* **When to Use**: Submit forms, confirmation actions, or major workflow navigation.
* **When NOT to Use**: Hyperlink inline text navigation (use `<a>`).
* **Props**: `variant`, `size`, `isLoading`, `disabled`, `icon`, `onClick`.
* **Sizing & Spacing**:
  - `sm`: height 28px, padding 8px 12px, font-size 11px.
  - `md`: height 36px, padding 12px 16px, font-size 12px.
* **Figma-Like States**:
  - **Default**: Background `var(--color-primary)` (for primary) or transparent with border.
  - **Hover**: 10% darker background transition.
  - **Pressed (Active)**: Scale `scale-98` with outline ring.
  - **Focused**: Ring offset outline ring `focus-visible`.
  - **Disabled**: Opacity 40% with cursor `not-allowed`.
  - **Loading**: Spinner icon visible, pointer events disabled.
  - **Success / Danger**: Alternate green/red color sets.

### Input
* **Purpose**: Capture single-line user text details.
* **When to Use**: Form titles, search boxes, names.
* **When NOT to Use**: Large description essays (use `Textarea`).
* **Props**: `label`, `error`, `placeholder`, `disabled`, `value`, `onChange`.
* **Figma-Like States**:
  - **Default**: Solid background, border `--color-border`.
  - **Focused**: Border turns to `--color-primary` with outline ring.
  - **Typing**: Text main color changes.
  - **Error (Invalid)**: Border shifts to solid rose-500, helper error label appears below.
  - **Disabled**: Greyed background, input blocked.
  - **Readonly**: No border, click cursor remains standard.

### Textarea
* **Purpose**: Capture multi-line description texts.
* **When NOT to Use**: Single-line short parameters.
* **Figma-Like States**: Same as Input, with vertical resize handle enabled.

### Select (Dropdown Pickers)
* **Purpose**: Choose one value out of a predefined list options.
* **When NOT to Use**: Yes/No toggles (use `Checkbox` or `Switch`).
* **Figma-Like States**: Default, Hover, Focused, Disabled, Error.

### Checkbox
* **Purpose**: Binary state toggler.
* **Figma-Like States**:
  - **Unchecked**: 1px border border-slate-300.
  - **Hover**: Highlighted border, transparent background.
  - **Focused**: Ring outline.
  - **Checked**: Solid background `--color-primary` with a check icon.
  - **Disabled**: Greyed out, non-clickable.
  - **Invalid**: Red border outline.

---

## 2. Layout & Feedback Widgets

### Card
* **Purpose**: Content container grouping related details.
* **Props**: `children`, `className`. Includes `CardHeader`, `CardBody`, and `CardFooter`.

### Modal
* **Purpose**: Overlay dialog block for focused workflows.
* **Props**: `isOpen`, `onClose`, `title`, `size` ('sm' | 'md' | 'lg').
* **Rule**: Pressing `Escape` must close the modal.

### Drawer
* **Purpose**: Slide-in panel from screen edges.
* **Props**: `isOpen`, `onClose`, `title`, `side` ('left' | 'right').

### Loading Skeleton
* **Purpose**: Placeholders showing loading progress without layout shifts.
* **Figma States**: Animation pulse cycle (`animate-pulse`).

### Empty State
* **Purpose**: Shows up when tables, lists, or timelines are empty.
* **Props**: `title`, `description`, `icon`, `actionButton`.
