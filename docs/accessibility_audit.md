# Tracker OS – Accessibility (a11y) Audit Report

This report documents the compliance of Tracker OS with WCAG 2.1 accessibility guidelines, focusing on keyboard navigation, screen readers, contrast ratios, and visual clarity.

---

## 1. Keyboard Navigation

### A. Focus Indicators
* **Implementation**: We require all interactive component elements (links, button primitives, text inputs) to show clear focus borders using CSS `:focus-visible` parameters:
  `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`
* **Compliance**: High. Focus rings are visible in both light and dark modes.

### B. Keyboard Traps & Esc Closing
* **Modals / Dialogs**: Primitive modal layouts require keyboard focus traps. Esc keypress events must dismiss active dialog overlays.
* **Navigation Sidebar**: Slide-out drawer on mobile devices captures focus and closes on overlay click or Esc press.

---

## 2. Text Content & Semantic Markup

### A. Document Hierarchy
* Pages follow a logical heading outline:
  * Exactly **one** `<h1>` tag defines the main view title.
  * `<h2>` and `<h3>` tags are used sequentially for card components and widget subdivisions.
* Navigation paths use `<nav>` elements, lists use `<ul>` / `<li>`, and header bars use `<header>` tags to ensure assistive technology can parse the page structure.

### B. Screen Reader Labels (ARIA)
* **Icon-Only Buttons**: Any button displaying only an icon (e.g. close buttons in dialogs, refresh widgets, theme toggles) **must** contain an explicit `aria-label` or `title` description (e.g. `aria-label="Disconnect Google Account"`).
* **Loading Indicators**: skeletons include `aria-busy="true"` and loaders contain hidden helper labels (`sr-only`) reading "Loading...".
