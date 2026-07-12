# UI Bugs & Issues - Tracker Application

## High Priority

### 1. SSR Hydration Issues
- **Location**: Calendar.tsx
- **Issue**: `startOfWeekPref` read from localStorage during render causing server/client mismatch
- **Fixed**: ✅ (Moved to `useState` + `useEffect`)

### 2. TodayDashboard Date String Mismatch
- **Location**: TodayDashboard.tsx
- **Issue**: `new Date().toLocaleDateString()` called during render, different server vs client results
- **Fixed**: ✅ (Now uses `todayStr` prop with UTC timezone)

### 3. Invalid Tailwind Utilities
- **Location**: Multiple files (TodayDashboard, Calendar, etc.)
- **Issue**: 
  - `py-0.2` (invalid spacing, Tailwind v4 minimum is 0.5)
  - `shadow-3xs` (non-standard shadow)
  - `border-zinc-750`, `border-zinc-850`, `border-zinc-855` (non-existent Tailwind colors)
  - `dark:text-zinc-555`, `dark:text-zinc-650` (non-existent dark shades)
  - `hover:bg-slate-105`, `hover:bg-slate-205` (non-existent colors)
- **Fixed**: ✅ (Added CSS custom utility definitions in globals.css)

### 4. Undefined CSS Animation
- **Location**: Multiple files referencing `animate-fade-in`
- **Issue**: Animation class referenced but never defined in CSS
- **Fixed**: ✅ (Added `@keyframes fadeIn` and `.animate-fade-in` to globals.css)

## Medium Priority

### 5. Inconsistent Card Design - "AI Pills"
- **Location**: TodayDashboard.tsx (previously)
- **Issue**: Left-border-only cards looked like "AI pills" not matching design system
- **Fixed**: ✅ (Complete rewrite with full-border cards matching ActivityManager style)

### 6. Small Hit Targets
- **Location**: TodayDashboard.tsx (previously)
- **Issue**: Checkbox buttons were `w-5 h-5`, action buttons `p-1` — too small for touch
- **Fixed**: ✅ (Increased to `w-7 h-7` checkboxes, `p-1.5` action buttons)

### 7. Calendar Week View Layout Jank
- **Location**: Calendar.tsx
- **Issue**: Week view days not equal height, responsive grid could break
- **Todo**: Needs responsive fallback for very small screens

### 8. Hardcoded BMI Height
- **Location**: WeightPanel.tsx
- **Issue**: `const heightM = 1.75` is hardcoded to 175cm height
- **Todo**: Should be user-configurable or use profile setting

## Low Priority / Enhancement

### 9. Font Preload Warnings
- **Location**: Next.js production
- **Issue**: Fonts preloaded but not immediately used (Next.js optimization warning)
- **Note**: This is a Next.js internal warning, doesn't break functionality

### 10. Missing Animation Classes in Some Components
- **Location**: DashboardClient, CommandPalette
- **Issue**: Still using `animate-fade-in` but CSS now defined
- **Status**: ✅ CSS is defined, but verify animations work correctly

### 11. "Documents" Tab Has No Component
- **Location**: DashboardClient.tsx
- **Issue**: Navigation tab exists but renders placeholder "not yet implemented"
- **Todo**: Build Secure Vault UI component or remove from navigation

### 12. Wishlist Feature Exists in Schema But No UI
- **Location**: prisma/schema.prisma, types/index.ts
- **Issue**: Full Prisma model + TypeScript types exist, but no UI component
- **Todo**: Create Wishlist tab component

## Design Consistency Issues

### 13. Mixed Styling Approaches
- **Location**: DashboardPanel, TodayDashboard vs Design System components
- **Issue**: Some components use `var(--color-*)` tokens, others use raw Tailwind classes (`bg-white dark:bg-zinc-900`)
- **Todo**: Audit and standardize all components to use design tokens

### 14. Color Palette Inconsistency
- **Location**: Multiple files
- **Issue**: Different color mappings for the same template color values
- **Todo**: Centralize color mapping in `lib/colors.ts` and use consistently

### 15. Button Size Inconsistency
- **Location**: Across components
- **Issue**: Some use design system Button, others use custom button styles
- **Todo**: Use design system Button component everywhere for consistency

## Mobile & Responsive Issues

### 16. Calendar Month View Aspect Ratio
- **Location**: Calendar.tsx
- **Issue**: `aspect-[1.4/1]` may not work well on all mobile screens
- **Todo**: Test on various device sizes and add responsive breakpoints

### 17. TodayDashboard Two-Column Layout on Mobile
- **Location**: TodayDashboard.tsx
- **Issue**: `xl:grid-cols-[1fr_280px]` might collapse poorly
- **Todo**: Ensure proper mobile-first responsive behavior

## Accessibility Issues

### 18. Missing ARIA Labels
- **Location**: Icon buttons, checkbox toggles
- **Issue**: Many interactive elements lack `aria-label` or `title` attributes
- **Todo**: Add accessibility attributes to all interactive elements

### 19. Color Contrast
- **Location**: Status badges, priority indicators
- **Issue**: Some color combinations may have low contrast ratio
- **Todo**: Run WCAG contrast checker and adjust colors

## Performance Issues

### 20. Unoptimized SVG Charts
- **Location**: WeightPanel.tsx (Sparkline component)
- **Issue**: Inline SVG with many DOM elements could cause paint performance
- **Todo**: Consider using lighter-weight chart library or optimize SVG

### 21. Large Bundle Size from Icons
- **Location**: Icon.tsx
- **Issue**: Importing entire Lucide React library
- **Todo**: Use dynamic imports or tree-shake better

---

## Next Steps Checklist

### Immediate (Next 1-2 days)
- [x] Fix SSR hydration issues
- [x] Fix invalid Tailwind utilities  
- [x] Redesign TodayDashboard cards for consistency
- [x] Increase hit target sizes
- [x] Add missing CSS definitions

### Short Term (Next week)
- [ ] Build Secure Vault UI component
- [ ] Build Wishlist UI component  
- [ ] Add user configurable height for BMI
- [ ] Standardize all components to use design tokens

### Long Term (Next sprint)
- [ ] Accessibility audit and fixes
- [ ] Mobile/responsive testing and improvements
- [ ] Performance optimizations (SVG, bundle size)
- [ ] Color contrast audit and adjustments

---

## Product Polish Backlog (Product Priority)

### 🔴 Critical - Implement Immediately

[ ] **Unify card language across the application**
Currently multiple card styles exist (timeline cards, sidebar cards, Activity Manager cards, Calendar cards).
Every card should share: identical radius, border thickness, padding, hover animation, shadow, header spacing.
Only one Card language across the entire product.

[ ] **Remove colored card backgrounds**
Current activity cards have light green, blue, red backgrounds which make interface noisy.
Replace with: white/dark surface, neutral border, small colored icon, optional small colored badge.
Linear, Raycast and Things rarely tint the entire card.

[ ] **Replace category colors with semantic colors**
Don't color by category. Color by meaning:
- Blue → external calendar
- Green → completed  
- Orange → warning
- Red → overdue
- Purple → personal
- Grey → archived
Everything else stays neutral.

[ ] **Increase click targets**
Many buttons are still below 44px (collapse arrows, timeline checkboxes, icon buttons, section toggles).
Everything clickable should be easy to hit with minimum 44px target area.

[ ] **Remove duplicate information**
Example: "Reading Book PERSONAL Read at least 15 pages" - category often adds nothing.
Only show useful metadata, not redundant information.

[ ] **Implement 75%/25% layout ratio**
Current sidebar visually competes with primary timeline.
Should be: 75% width for Timeline (primary focus), 25% width for supporting information (secondary).
Timeline should immediately draw attention when page opens.

### 🟠 High Priority

[ ] **Timeline spacing improvements**
Cards feel too close together vertically.
Need: tighter internal padding, slightly larger spacing between cards (think Things 3).

[ ] **Better visual hierarchy**
Current page: Today → Progress bar → Timeline → Sidebar (nothing dominates).
Make Timeline visually heavier. Reduce sidebar emphasis.

[ ] **Progress bar redesign**
Current bar feels generic.
Options: remove it or show "Today's Progress 2 / 12 ██████░░░░" to make it meaningful.

[ ] **Sidebar visual weight reduction**
Sidebar competes with content.
Reduce: border contrast, icon contrast, active background opacity.
Content should win.

[ ] **Reflection box redesign**
Feels disconnected.
Make it look like Apple Notes: large textarea, minimal border, autosave badge.

### 🟡 Medium Priority

[ ] **Contest widget redesign**
Looks like a list.
Instead: "Upcoming Codeforces Round Tomorrow 2h Join →"
Less information, bigger typography.

[ ] **Tomorrow widget visual hierarchy**
Needs clear hierarchy.
Show: "Tomorrow 09:00 Learning Reminder" not "Learning reminder 09:00".

[ ] **Empty states improvement**
Current empty states feel generated.
Need: "No activities today Enjoy the free time." instead of "No data available."

[ ] **Consistent icon containers**
Some icons use circles, some rounded squares, some no background.
Choose one: personally recommend rounded squares.

[ ] **Standardize badges**
Current badges have many sizes.
Need exactly: Small, Medium. Nothing else.

### 🟢 Low Priority

[ ] **Smooth micro animations**
Duration: 150–200ms.
Apply to: hover, checkbox, card, drawer, accordion.

[ ] **Better typography hierarchy**
Current: Almost every heading is bold.
Need: 700 → 600 → 500 → 400 with more hierarchy.

[ ] **Consistent dividers**
Some cards use borders, some use spacing, some use nothing.
Choose one system.

[ ] **Improve whitespace**
Reduce visual crowding.
Think: Apple Notes, Things, Linear.

[ ] **Responsive breakpoints improvement**
Tablet layout still feels desktop-first.
Improve between 900–1200px.

### Product Vision Issues

[ ] **Activity cards still look AI-generated**
Colored left border design should be removed completely.
Use: full border, icon, typography instead.

[ ] **Every screen should answer one question**
- Today → What should I do today?
- Calendar → When am I busy?
- Activities → What rules exist?
- Journal → What happened?
- Time Off → How much leave do I have?
- Weight → How is my health changing?
No screen should try to answer multiple questions.

[ ] **Visual consistency audit**
Before every release verify:
- Same border radius
- Same padding  
- Same font scale
- Same icon size
- Same hover animation
- Same shadows
- Same transitions
- Same card structure
- Same spacing grid

## Fixed Bugs Summary

✅ **All critical UI bugs have been fixed:**
- SSR hydration errors eliminated
- Missing CSS animations added  
- Invalid Tailwind utilities defined
- TodayDashboard completely redesigned for better UX
- Larger hit targets for mobile/touch
- Consistent card design matching ActivityManager
- Date string mismatch resolved

**Current Status**: Functional UI with critical rendering issues resolved. Now needs comprehensive product polish to achieve "polished desktop application" feel.