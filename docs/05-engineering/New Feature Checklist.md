# Future Feature Compliance Checklist

This checklist is **mandatory** for every new feature, panel, or integration branch in Tracker OS. Pull Requests must satisfy all criteria before they are eligible for merging.

---

## 1. Governance & Architecture

- [ ] **Core Domain Alignment**: Does the feature align to the *Activity-first* ledger architecture? (Writes to `ActivityLog` via `ActivityService.logActivity`).
- [ ] **Dependency Rules Compliance**: Does the code layout respect the layers? (Presentation -> Actions -> Services -> Database). Zero imports bypass this cascade.
- [ ] **Visual Identity Compliance**: Does the look and feel align with `docs/visual_identity.md`? (No gradients, no glassmorphism, no flashy animations).

---

## 2. Design System & Component Compliance

- [ ] **Component Reuse**: Are all buttons, inputs, textareas, cards, select dropdowns, modals, and badges built using the design system primitives?
- [ ] **No Custom Styling Hacks**: No raw inline hex codes, colors, or arbitrary tailwind parameters (like `p-[15px]`) are used.
- [ ] **Figma States Implemented**: Do inputs and buttons support hover, active, pressed, disabled, and loading states?

---

## 3. Accessibility & Keyboard Controls

- [ ] **Keyboard Navigable**: Can the entire feature be operated via keyboard? (Tab index order, Enter to select/submit).
- [ ] **Escape Bounds**: Does pressing `Escape` exit modals, popovers, or drawers?
- [ ] **ARIA Labels**: All icon-only buttons include descriptive `aria-label` tags.

---

## 4. UI States & Fault Tolerances

- [ ] **Loading States**: Are skeleton screens or button loaders visible during async database transaction queries?
- [ ] **Empty States**: If lists or tables return zero records, is a clear, descriptive `<EmptyState>` render block visible?
- [ ] **Error States**: Are API errors caught gracefully and displayed inline using standard visual alert banners?
- [ ] **Dark Mode Responsive**: Verify colors render correctly in both light and dark modes.

---

## 5. Testing & Code Quality

- [ ] **Unit Tests Written**: Tests cover new services or logical components under the `/tests` folder.
- [ ] **TypeScript Safe**: Clean checks (`bunx tsc --noEmit` returns zero compilation warnings).
- [ ] **Linter Approved**: Formatting fits the strict workspace settings.
- [ ] **Production Build Verified**: Optimized production bundle compiles successfully.
