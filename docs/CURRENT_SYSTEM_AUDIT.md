# Current Design System Audit

**Date:** 2026-07-19  
**Status:** Systematic Analysis

---

## ✅ What's Already Great

### 1. **Existing Design System** (`/design-system/`)

**Components Available:**
- Button (4 variants: primary, secondary, outline, danger)
- Card (with Header, Body, Footer)
- Input, Textarea, Select
- Modal
- EmptyState
- Skeleton, SkeletonWidget
- Badge
- Checkbox
- Dropdown
- Tabs (with TabsList, Tab, TabsContent)
- Toast (with provider and hook)

**Design Tokens** (`tokens.css`):
- ✅ Color system with semantic names
- ✅ 8-point spacing grid
- ✅ Consistent border radius
- ✅ Motion tokens (duration, easing)
- ✅ Card design tokens (unified)
- ✅ Dark mode support

**Current Strengths:**
- Uses CSS custom properties
- Semantic color naming
- Consistent spacing
- Professional animations
- Good component API design
- Loading states
- Empty states

---

## 🔴 Critical Issues Found

### 1. **Module-Specific Component Duplication**

**Problem:** Some panels create their own UI instead of using design system

**Examples:**
- `VaultPanel.tsx` - Custom modal styles
- `LinkLibraryPanel.tsx` - Custom card layout
- `WeightPanel.tsx` - Custom chart styling
- `LeavePanel.tsx` - Custom calendar view

**Impact:** Inconsistent look and feel across modules

---

### 2. **Inconsistent Button Usage**

**Current:**
```tsx
// TodayDashboard
<button className="flex items-center gap-1.5 px-3 py-1.5 text-xs...">

// VaultPanel
<button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold...">

// Should be:
<Button variant="primary" size="sm">
```

**Found In:**
- TodayDashboard
- VaultPanel
- JournalPanel
- LinkLibraryPanel

---

### 3. **Inconsistent Card Patterns**

**Problem:** Some components use `Card` from design system, others use custom divs

**Custom Card Implementations Found:**
```tsx
// VaultPanel
<div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] border...">

// LinkLibraryPanel
<div className="rounded-lg border bg-card...">

// Should be:
<Card>
```

**Found In:**
- VaultPanel (file grid items)
- LinkLibraryPanel (link cards)
- TodayDashboard (activity cards)

---

### 4. **Modal/Dialog Inconsistency**

**Problem:** Inline modals vs. design system Modal

**VaultPanel has:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50...">
  <div className="bg-[var(--color-bg-surface)] border...">
```

**Should use:**
```tsx
<Modal isOpen={showNewFolder} onClose={...}>
```

**Found In:**
- VaultPanel (new folder, rename, delete modals)
- JournalPanel (image uploader?)

---

### 5. **Typography Inconsistency**

**Headers vary:**
```tsx
// TodayDashboard
<h1 className="text-lg font-black tracking-tight">

// VaultPanel
<h1 className="text-lg font-black text-[var(--color-text-main)] tracking-tight">

// LinkLibraryPanel
<h3 className="text-lg font-black tracking-tight">
```

**Need:** Standard heading components or utilities

---

### 6. **Loading State Inconsistency**

**Some use Skeleton:**
```tsx
{loading && <Skeleton />}
```

**Others use custom:**
```tsx
{loading && (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="w-6 h-6 animate-spin" />
  </div>
)}
```

**Found In:**
- VaultPanel (custom loader)
- LinkLibraryPanel (custom skeleton)

---

### 7. **Empty State Inconsistency**

**Some use EmptyState:**
```tsx
<EmptyState
  title="No items"
  description="Get started"
  icon={<Icon />}
/>
```

**Others use custom:**
```tsx
<div className="flex flex-col items-center justify-center py-16...">
  <div className="w-14 h-14...">
```

**Found In:**
- VaultPanel (custom empty state)
- LinkLibraryPanel (partially custom)

---

### 8. **Icon Size Inconsistency**

**Varied usage:**
```tsx
<Icon className="w-4 h-4" />   // Some places
<Icon className="w-3.5 h-3.5" /> // Other places
<Icon className="w-4.5 h-4.5" /> // Custom size
<Icon className="w-6 h-6" />   // Yet another
```

**Need:** Standardized icon sizing

---

### 9. **Search Bar Duplication**

**VaultPanel custom search:**
```tsx
<input
  type="text"
  placeholder="Search..."
  className="w-full pl-8 pr-3 py-1.5..."
/>
```

**LinkLibraryPanel custom search:**
```tsx
<input
  type="text"
  placeholder="Search..."
  className="flex-1 pl-9 pr-3 py-2..."
/>
```

**Need:** Reusable SearchInput component

---

### 10. **No Standard Page Layout**

**Problem:** Each module structures pages differently

**Current Variations:**
- Different header structures
- Varying spacing between sections
- Inconsistent action button placement
- Mixed stat card layouts

**Need:**
- `PageContainer` component
- `PageHeader` component
- `StatsGrid` component

---

## 📊 Module Breakdown

### TodayDashboard
- ✅ Uses design system: Button, Card, EmptyState, Skeleton
- ❌ Custom activity card styling
- ❌ Custom stat cards
- ⚠️ Partially consistent

### VaultPanel
- ❌ Custom modals (should use Modal)
- ❌ Custom file grid cards (should use Card)
- ❌ Custom buttons (inline classes)
- ❌ Custom loading spinner (should use Skeleton)
- ❌ Custom empty state (should use EmptyState)
- 🔴 **Needs major refactor**

### JournalPanel
- ✅ Uses Card components
- ⚠️ Custom editor (acceptable - specialized)
- ✅ Mostly consistent

### LinkLibraryPanel
- ⚠️ Partially uses Card
- ❌ Custom search input
- ❌ Custom link cards
- ⚠️ Needs cleanup

### WeightPanel
- ✅ Uses Card, Button, Input
- ✅ Mostly consistent
- ✅ Chart is specialized (acceptable)

### LeavePanel
- ✅ Uses design system components
- ✅ Mostly consistent

### SettingsPanel
- ✅ Uses design system components
- ✅ Consistent

---

## 🎯 Priority Action Items

### Phase 1: Component Consolidation (Week 1)

**High Priority:**
1. ❗ Migrate VaultPanel to use Modal component
2. ❗ Migrate VaultPanel to use Card component
3. ❗ Replace all inline buttons with Button component
4. ❗ Standardize all empty states to use EmptyState
5. ❗ Standardize all loading states to use Skeleton

**Medium Priority:**
6. Create SearchInput component
7. Create PageContainer component
8. Create PageHeader component
9. Standardize icon sizes
10. Create typography utilities

### Phase 2: Module Refactoring (Week 2-3)

**Module Order:**
1. **VaultPanel** (most inconsistent, high visibility)
2. **LinkLibraryPanel** (medium inconsistency)
3. **TodayDashboard** (minor cleanup)
4. Polish all others

### Phase 3: Documentation & Enforcement (Week 4)

1. Document all patterns
2. Create usage examples
3. Add component stories/examples
4. Set up linting rules (if possible)

---

## 💡 Recommendations

### DO:
- ✅ Use existing design system components
- ✅ Leverage existing tokens
- ✅ Maintain current quality
- ✅ Consolidate duplicates
- ✅ Fix inconsistencies

### DON'T:
- ❌ Replace entire design system
- ❌ Break existing functionality
- ❌ Change business logic
- ❌ Introduce new libraries unnecessarily
- ❌ Redesign working patterns

---

## 🎨 Design System Gaps to Fill

### Missing Components:
1. ✅ Button - EXISTS (enhance with more variants?)
2. ✅ Card - EXISTS (working well)
3. ✅ Modal - EXISTS (underutilized)
4. ✅ Input - EXISTS
5. ❌ SearchInput - MISSING (create wrapper)
6. ❌ PageContainer - MISSING (create layout)
7. ❌ PageHeader - MISSING (create layout)
8. ❌ StatsCard - MISSING (extract pattern)
9. ❌ Dialog (confirmation) - MISSING (enhance Modal)
10. ❌ Sheet/Drawer - MISSING (needed?)

### Enhancement Opportunities:
- Add `ghost` and `link` button variants
- Add `sm` Card variant
- Add SearchInput component
- Add layout components
- Add stat card component

---

## 📈 Success Metrics

**Target:**
- 90%+ of UI uses design system components
- Zero custom buttons with inline classes
- Zero custom modals
- Zero custom cards (except specialized)
- All modules visually consistent
- All empty states use EmptyState
- All loading states use Skeleton

**Current:**
- ~60% using design system
- ~15 custom button implementations
- ~6 custom modal implementations
- ~10 custom card implementations
- 3 custom empty states
- 4 custom loading implementations

---

## 🚀 Next Steps

1. **Start with VaultPanel** (biggest impact)
2. Replace custom modals with Modal
3. Replace custom cards with Card
4. Replace custom buttons with Button
5. Add missing components as needed
6. Move to next module

---

**Conclusion:** Tracker has a solid foundation. The work is **consolidation and consistency**, not redesign.
