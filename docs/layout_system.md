# Layout System Specification

This document details the responsive grids, margins, dimensions, and spacing bounds of Tracker OS. Arbitrary layouts are strictly prohibited.

---

## 1. Grid & Dimension Scale

### Desktop Grid (>1024px)
- **Structure**: Permanent Navigation Sidebar (left, width `256px` / `w-64`) + Main Workspace (right, fluid).
- **Workspace Max Content Width**: `1280px` (`max-w-7xl`).
- **Inner Column Layout**: Single grid alignment, or standard split columns (`grid-cols-3` split as 2/3 main, 1/3 sidebar).

### Tablet Grid (768px - 1024px)
- **Structure**: Collapsed Navigation Sidebar (reveals as slide-over drawer via hamburger toggle) + Main Workspace (full width).
- **Workspace Max Content Width**: Full width of screen minus page padding.

### Mobile Grid (<768px)
- **Structure**: Collapsed Sidebar + Main Workspace (full width).
- **Inner Content Layout**: Vertical stack (`flex-col`). Grid-cols are forced to `grid-cols-1`.

---

## 2. Container & Overlay Sizes

* **Sidebar Width**: Fixed `256px` (`w-64`).
* **Drawer Width**: Fixed `384px` (`w-96` / `max-w-md`) on desktop, full-screen width on mobile.
* **Modal Sizes**:
  - **Small (`sm`)**: `384px` — Confirmation boxes, quick status alerts.
  - **Medium (`md`)**: `512px` — Activity Creator, simple forms, weight updates.
  - **Large (`lg`)**: `768px` — Detailed task inspections.

---

## 3. Spacing Standards (Token Bounds)

All spacing must utilize standard CSS spacing variables:

| Section element | Padding / Spacing size | Token reference |
|-----------------|------------------------|-----------------|
| **Page Padding** | `24px` on desktop, `16px` on mobile | `p-6` (`--spacing-6`) / `p-4` (`--spacing-4`) |
| **Section Spacing** | `24px` gap between major page panels | `space-y-6` (`--spacing-6`) |
| **Card Spacing** | `12px` or `16px` inside cards | `p-3` (`--spacing-3`) or `p-4` (`--spacing-4`) |
| **Timeline Card gap**| `8px` vertical gap between items | `space-y-2` (`--spacing-2`) |
| **Calendar Grid gap**| `6px` spacing between cells | `gap-1.5` |
| **Header Margin** | `16px` space under page titles | `pb-4` (`--spacing-4`) |
| **Form Fields** | `16px` gap between rows, `8px` label-input gap | `space-y-4` / `gap-1.5` |
