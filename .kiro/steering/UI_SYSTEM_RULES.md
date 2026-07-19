---
inclusion: auto
---

# Tracker UI System - Permanent Rules

**READ THIS FIRST before creating or modifying any UI component.**

---

## ⚡ Quick Rules

1. **COSS UI FIRST** - Always check if component exists before creating
2. **NO HARDCODED COLORS** - Use semantic tokens only
3. **ONE BORDER RADIUS** - `rounded-md` everywhere (0.5rem)
4. **8PX GRID** - All spacing must be multiples of 8px
5. **LOADING + EMPTY STATES** - Every data component needs both
6. **LUCIDE ICONS ONLY** - No other icon libraries

---

## 🎨 Design System Location

All documentation is in `/docs/`:
- `DESIGN_SYSTEM.md` - Complete specification
- `UI_AUDIT.md` - Current issues
- `UI_IMPLEMENTATION_PLAN.md` - How to implement

---

## 🚫 NEVER Do This

```tsx
// ❌ WRONG - Hardcoded colors
<div className="text-slate-500 bg-blue-100">

// ❌ WRONG - Custom border radius
<div className="rounded-xl">

// ❌ WRONG - Random spacing
<div className="p-5 mb-7">

// ❌ WRONG - Custom button style
<button className="bg-gradient-to-r from-purple-500 to-pink-500">

// ❌ WRONG - No loading state
{data ? <List /> : null}
```

---

## ✅ ALWAYS Do This

```tsx
// ✅ CORRECT - Semantic tokens
<div className="text-muted-foreground bg-muted">

// ✅ CORRECT - Consistent radius
<div className="rounded-md">

// ✅ CORRECT - 8px grid (p-4 = 16px, p-6 = 24px)
<div className="p-6 space-y-4">

// ✅ CORRECT - Standard button
<Button variant="default">Click me</Button>

// ✅ CORRECT - Loading state
{loading ? <Skeleton /> : <List data={data} />}
```

---

## 🎯 Component Priority

When you need a component, check in this order:

1. **Existing Tracker component** → `components/[feature]/`
2. **COSS UI component** → `components/ui/`
3. **Create reusable** → Document it
4. **Custom** → Last resort, must justify

---

## 🏗️ Standard Page Structure

```tsx
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'

export default function MyPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Page Title"
        description="Description text"
        actions={<Button>Primary Action</Button>}
      />
      
      {/* Stats (optional) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stat cards */}
      </div>
      
      {/* Content */}
      <div className="space-y-4">
        {loading ? <Skeleton /> : (
          items.length === 0 ? (
            <EmptyState 
              icon={Icon}
              title="No items"
              description="Create your first item"
              action={{ label: "Create", onClick: handleCreate }}
            />
          ) : (
            <List items={items} />
          )
        )}
      </div>
    </PageContainer>
  )
}
```

---

## 🎨 Color Tokens Reference

```tsx
// Background
bg-background     // Page background
bg-card          // Card background
bg-muted         // Subtle background

// Text
text-foreground       // Main text
text-muted-foreground // Secondary text

// Borders
border-border    // Default border
border-input     // Input border

// States
bg-primary              // Primary action
bg-destructive          // Delete/danger
bg-accent              // Hover state
bg-secondary           // Secondary action

// Semantic
bg-success    // Green
bg-warning    // Yellow
bg-info       // Blue
```

---

## 📏 Spacing Scale (8px Grid)

```tsx
gap-0.5  = 4px   (rare)
gap-1    = 8px
gap-2    = 16px
gap-3    = 24px
gap-4    = 32px
gap-6    = 48px
gap-8    = 64px
```

Use `space-y-*` for vertical spacing between children.

---

## 🔘 Button Usage

```tsx
<Button>Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button variant="link">Link</Button>

<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

---

## 📦 Card Usage

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

---

## 🎭 Icons

```tsx
import { Icon } from 'lucide-react'

// Sizes
<Icon className="w-4 h-4" />  // Small (16px)
<Icon className="w-5 h-5" />  // Medium (20px)
<Icon className="w-6 h-6" />  // Large (24px)

// With color
<Icon className="w-4 h-4 text-muted-foreground" />
<Icon className="w-4 h-4 text-primary" />
```

---

## 💀 Empty State Pattern

```tsx
import { EmptyState } from '@/components/shared/empty-state'
import { FileText } from 'lucide-react'

<EmptyState
  icon={FileText}
  title="No documents"
  description="Upload your first document to get started"
  action={{
    label: "Upload Document",
    onClick: () => handleUpload()
  }}
/>
```

---

## ⏳ Loading State Pattern

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { CardSkeleton } from '@/components/shared/loading-state'

{loading ? (
  <div className="space-y-4">
    <CardSkeleton />
    <CardSkeleton />
    <CardSkeleton />
  </div>
) : (
  <List data={data} />
)}
```

---

## 📱 Responsive Classes

```tsx
// Mobile first approach
<div className="
  grid 
  grid-cols-1           // Mobile: 1 column
  md:grid-cols-2        // Tablet: 2 columns
  lg:grid-cols-3        // Desktop: 3 columns
  gap-4
">
```

---

## ✅ Pre-Commit Checklist

Before committing any UI code:

- [ ] Uses COSS UI components where available
- [ ] No hardcoded colors (all semantic tokens)
- [ ] Consistent border radius (`rounded-md`)
- [ ] 8px grid spacing throughout
- [ ] Has loading state
- [ ] Has empty state
- [ ] Responsive layout tested
- [ ] Icons from Lucide only
- [ ] Matches visual style of other pages
- [ ] No custom button/input styles

---

## 🚨 If You Break These Rules

Your PR will be rejected. These rules ensure Tracker feels like **one product** designed by **one team**.

---

## 📚 Full Documentation

For complete details, see `/docs/DESIGN_SYSTEM.md`

For implementation guide, see `/docs/UI_IMPLEMENTATION_PLAN.md`

For current issues, see `/docs/UI_AUDIT.md`

---

**Remember: Consistency over creativity. Professional over flashy. Tracker is a productivity tool, not a portfolio piece.**
