# Tracker Design System

**Version:** 1.0.0  
**Last Updated:** 2026-07-19

Tracker is a premium productivity operating system. This document defines the single source of truth for UI consistency across the entire application.

---

## Philosophy

Tracker must feel like **one product designed by one team**.

- **Modern SaaS aesthetic**: Professional, minimal, quiet
- **Consistent patterns**: Every page follows the same structure
- **COSS UI first**: Use the design system before creating custom components
- **No visual surprises**: Users should never feel like they've left the application

---

## Foundation

### Technology Stack

- **Framework**: Next.js 16+ with React 19
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Animation**: Framer Motion (subtle transitions only)
- **Component Library**: COSS UI (Cal.com Open Source System)

### Typography

**Font Family**: Inter  
**Scale**: Use predefined sizes only

```css
--font-size-xs: 0.75rem;    /* 12px */
--font-size-sm: 0.875rem;   /* 14px */
--font-size-base: 1rem;     /* 16px */
--font-size-lg: 1.125rem;   /* 18px */
--font-size-xl: 1.25rem;    /* 20px */
--font-size-2xl: 1.5rem;    /* 24px */
--font-size-3xl: 1.875rem;  /* 30px */
```

**Weights**:
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700
- Black: 900

### Border Radius

**Single radius system**: Choose ONE and use it everywhere

```css
--radius: 0.5rem; /* 8px - recommended */
```

### Spacing

**8-point grid system**: All spacing is a multiple of 8px

```
0.5 = 4px
1   = 8px
2   = 16px
3   = 24px
4   = 32px
6   = 48px
8   = 64px
12  = 96px
16  = 128px
```

### Colors

Use semantic design tokens. **Never hardcode colors.**

```css
/* Primary - Brand color */
--color-primary: hsl(var(--primary));
--color-primary-foreground: hsl(var(--primary-foreground));

/* Background */
--color-bg-base: hsl(var(--background));
--color-bg-surface: hsl(var(--card));
--color-bg-muted: hsl(var(--muted));

/* Text */
--color-text-main: hsl(var(--foreground));
--color-text-muted: hsl(var(--muted-foreground));

/* Borders */
--color-border: hsl(var(--border));
--color-border-input: hsl(var(--input));

/* States */
--color-accent: hsl(var(--accent));
--color-accent-foreground: hsl(var(--accent-foreground));

/* Semantic */
--color-success: hsl(var(--success));
--color-warning: hsl(var(--warning));
--color-destructive: hsl(var(--destructive));
--color-info: hsl(var(--info));
```

---

## Component Priority

When building UI, follow this order:

1. **Existing Tracker component** - Reuse what's already built
2. **COSS UI component** - Use from the design system
3. **shadcn primitive** - Only if COSS doesn't provide it
4. **Small reusable wrapper** - Create if truly needed
5. **Custom component** - Last resort only

---

## Standard Patterns

### Page Structure

Every page follows this layout:

```tsx
<div className="space-y-6">
  {/* Page Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold">Page Title</h1>
      <p className="text-sm text-muted-foreground">Description</p>
    </div>
    <div className="flex items-center gap-2">
      {/* Primary actions */}
    </div>
  </div>

  {/* Statistics (optional) */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    {/* Stat cards */}
  </div>

  {/* Filters (optional) */}
  <div className="flex items-center gap-2">
    {/* Search, filters */}
  </div>

  {/* Content */}
  <div>
    {/* Main content */}
  </div>
</div>
```

### Card Component

Every module uses the **same card design**:

```tsx
<div className="rounded-lg border bg-card p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold">Card Title</h3>
    <div className="flex items-center gap-2">
      {/* Actions */}
    </div>
  </div>
  <div>
    {/* Content */}
  </div>
</div>
```

### Button Variants

**Only use these variants:**

- `default` - Primary action
- `secondary` - Secondary action
- `outline` - Tertiary action
- `ghost` - Minimal action
- `destructive` - Delete/remove
- `link` - Text link style

**Do not invent new button styles.**

### Input Pattern

**One consistent input style:**

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Label</label>
  <input 
    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    placeholder="Placeholder"
  />
  <p className="text-xs text-muted-foreground">Helper text</p>
</div>
```

### Table Pattern

Every table follows this structure:

- Toolbar (search, filters, bulk actions)
- Table header with sortable columns
- Table body with hover states
- Pagination
- Empty state
- Loading state (skeleton)

### Empty State

Every module must have an empty state:

```tsx
<div className="flex flex-col items-center justify-center py-12">
  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
    <Icon className="w-6 h-6 text-muted-foreground" />
  </div>
  <h3 className="text-lg font-semibold mb-1">No items yet</h3>
  <p className="text-sm text-muted-foreground mb-4">Get started by creating your first item</p>
  <Button>Create Item</Button>
</div>
```

### Loading State

**Skeletons only.** Avoid spinners.

```tsx
<div className="animate-pulse space-y-2">
  <div className="h-4 bg-muted rounded w-3/4" />
  <div className="h-4 bg-muted rounded w-1/2" />
</div>
```

### Dialog/Modal

Same width, spacing, and footer across the entire app:

```tsx
<Dialog>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>
        Description text
      </DialogDescription>
    </DialogHeader>
    <div className="py-4">
      {/* Content */}
    </div>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Animation Guidelines

Animations should **improve usability**, not distract.

### Allowed

- Fade in/out: `200ms`
- Slide transitions: `150ms`
- Scale on hover: `100ms`
- Loading indicators

### Not Allowed

- Bouncing animations
- Spinning (except loading spinners)
- Decorative animations
- Parallax effects
- Page transitions over 300ms

---

## Icon Usage

**Only Lucide Icons.**

- Same size for similar actions
- Same stroke width everywhere (default: 2)
- Consistent spacing relative to text

Common sizes:
- Small icon: `w-4 h-4` (16px)
- Medium icon: `w-5 h-5` (20px)
- Large icon: `w-6 h-6` (24px)

---

## Responsive Design

1. **Desktop first** (1280px+)
2. **Tablet supported** (768px - 1279px)
3. **Mobile usable** (< 768px)

Breakpoints:
```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

---

## What NOT to Do

❌ Flashy gradients  
❌ Glassmorphism  
❌ Neon effects  
❌ Oversized shadows  
❌ Multiple border radii on the same page  
❌ Hardcoded colors  
❌ Custom font sizes  
❌ Module-specific component styles  
❌ Decorative animations  
❌ Inconsistent spacing  

---

## Checklist Before Shipping

- [ ] Uses COSS UI components where available
- [ ] Follows the standard page structure
- [ ] Uses semantic color tokens
- [ ] Consistent spacing (8px grid)
- [ ] Same border radius as rest of app
- [ ] Has empty state
- [ ] Has loading state
- [ ] Responsive layout
- [ ] Matches existing pages visually
- [ ] No custom button variants
- [ ] No hardcoded colors
- [ ] Icons are consistent size

---

## Resources

- **COSS UI Documentation**: https://coss.com
- **COSS UI GitHub**: https://github.com/cosscom/coss
- **Lucide Icons**: https://lucide.dev
- **Tailwind CSS v4**: https://tailwindcss.com

---

**Remember**: Tracker must feel like one cohesive product. Before creating anything new, ask: "Does this match everything else?"
