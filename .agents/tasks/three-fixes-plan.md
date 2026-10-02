# Implementation Plan: Three Mobile Fixes

## Issue Analysis

### Issue 1: Leave Module 500 Errors
**Root Cause:** The `/api/mobile/v1/leave` route calls `assertUserModuleAccess(user, 'leave')` which throws an Error when the leave module is disabled for guest accounts. This error bubbles up as a 500 instead of being caught and handled gracefully.

**Solution:** The vault and journal routes already demonstrate the correct pattern - they wrap `assertUserModuleAccess` in a try/catch and return a proper 403 response. We'll apply the same pattern to all leave route handlers (GET, POST, DELETE, PATCH).

### Issue 2: Activity Icons Not Displaying
**Root Cause:** Field name mismatch. The Prisma schema has `icon` field, the API returns `icon`, but the mobile ActivityCard component passes `template.icon` to `ActivitySymbolBadge` which expects a prop named `symbol`. The ActivitySymbolBadge component receives `undefined` for its `symbol` prop, so `resolveSymbol(undefined)` falls back to the default activity icon.

**Solution:** Change ActivityCard.tsx to pass `symbol={template.icon}` instead of the current incorrect mapping.

### Issue 3: Light Mode Styling Broken
**Root Cause:** Many components use hardcoded color values (hex codes and rgba strings) instead of semantic tokens from the theme context. The app has both `darkPalette` and `lightPalette` defined in `tokens.ts` and a ThemeContext, but components are not using `useTheme()` consistently.

**Files with hardcoded colors:**
- LoginScreen.tsx (Google SVG colors - OK to keep)
- DailyCodingCard.tsx (rgba amber badge)
- NotesScreen.tsx (rgba blue badge, rgba modal overlay)
- LeaveWidgetCard.tsx (6 hardcoded leave type colors, rgba banner colors)
- TodayScreen.tsx (rgba coral badge)
- WeightWidgetCard.tsx (rgba green/coral weight change backgrounds, rgba modal backdrop)
- JournalWidgetCard.tsx (rgba purple badge)
- TodayTaskRow.tsx (rgba green done badge)
- LeaveModal.tsx (6 hardcoded leave type colors, rgba modal overlay, rgba status badges, hardcoded white icon)
- SettingsScreen.tsx (hardcoded white check icon, rgba amber/primary badges, rgba icon backgrounds)
- JournalScreen.tsx (rgba coral active row)
- TaskActionModal.tsx (rgba modal overlay)
- CalendarEventsSection.tsx (rgba sky badge)
- ActivityFormModal.tsx (rgba modal overlay)
- CalendarScreen.tsx (rgba coral badges, rgba primary badge)
- SymbolPicker.tsx (hardcoded amber crown icon)

**Solution:** Replace hardcoded colors with semantic tokens. Group fixes by feature area.

## Implementation Steps

- [ ] 1. Fix Leave Module 500 Errors
      Wrap `assertUserModuleAccess(user, 'leave')` in try/catch blocks in all four route handlers (GET, POST, DELETE, PATCH) and return a 403 response with `{ error: 'Access denied to Leave module' }` when the authorization check fails, following the pattern used in vault and journal routes.
      Files: `app/api/mobile/v1/leave/route.ts`
      Verify: `bun dev` running, make a request to `/api/mobile/v1/leave?year=2026` as a guest user with leave module disabled - should return 403 instead of 500. Check server logs for no error stack traces.

- [ ] 2. Fix Activity Icons Not Displaying
      Change ActivityCard.tsx line 23 from `symbol={template.icon}` (if already correct) or add the correct prop mapping. The ActivitySymbolBadge component expects `symbol` prop but ActivityCard is not passing `template.icon` to it correctly.
      Files: `m/src/features/activities/components/ActivityCard.tsx` (line 23 where ActivitySymbolBadge is rendered)
      Verify: Run mobile app with `bun dev` (server) and expo dev client, navigate to Activities screen, confirm that activity icons render correctly instead of showing default activity icon for all items.

- [ ] 3. Replace Hardcoded Colors in Leave Feature Files
      Replace all hardcoded color values in LeaveWidgetCard.tsx and LeaveModal.tsx with semantic tokens from useTheme(). Specifically:
      - Replace the 6 hardcoded leave type colors in LEAVE_TYPES_CONFIG arrays with semantic tokens (use sky, danger/rose for sick, purple, warning, sky, success)
      - Replace rgba banner/badge backgrounds with `colors.warningSubtle`, `colors.successSubtle`, etc.
      - Replace hardcoded `#ffffff` with `colors.white` or `colors.text` depending on context
      - Replace rgba modal overlays with a theme-aware semi-transparent background
      Files: `m/src/features/leave/LeaveModal.tsx`, `m/src/features/today/LeaveWidgetCard.tsx`
      Verify: Run mobile app in both light and dark mode, navigate to leave screens, confirm all backgrounds, text, badges are readable in both modes.

- [ ] 4. Replace Hardcoded Colors in Today Feature Files
      Replace hardcoded rgba colors in TodayScreen.tsx, TodayTaskRow.tsx, DailyCodingCard.tsx, WeightWidgetCard.tsx, JournalWidgetCard.tsx, TaskActionModal.tsx, CalendarEventsSection.tsx with semantic tokens from useTheme().
      - Coral badges → `colors.coral` background with `colors.coralSubtle`
      - Green badges → `colors.success` with `colors.successSubtle`
      - Amber badges → `colors.warning` with `colors.warningSubtle`
      - Purple badges → `colors.purple` with theme-appropriate subtle variant
      - Modal overlays → theme-aware backdrop using `colors.background` with opacity or a new semantic token
      Files: `m/src/features/today/TodayScreen.tsx`, `m/src/features/today/components/TodayTaskRow.tsx`, `m/src/features/today/DailyCodingCard.tsx`, `m/src/features/today/WeightWidgetCard.tsx`, `m/src/features/today/JournalWidgetCard.tsx`, `m/src/features/today/components/TaskActionModal.tsx`, `m/src/features/today/components/CalendarEventsSection.tsx`
      Verify: Run mobile app in both light and dark mode, test Today screen and all its sub-components, confirm readability in both modes.

- [ ] 5. Replace Hardcoded Colors in Remaining Feature Files
      Replace hardcoded rgba colors and hex values in NotesScreen.tsx, SettingsScreen.tsx, JournalScreen.tsx, CalendarScreen.tsx, ActivityFormModal.tsx, SymbolPicker.tsx with semantic tokens from useTheme().
      - Blue badges → `colors.primary` or `colors.sky` with appropriate subtle backgrounds
      - Modal overlays → consistent with step 4
      - Hardcoded white → `colors.white` or appropriate text color
      - Amber pro badges → `colors.warning` with `colors.warningSubtle`
      Files: `m/src/features/notes/NotesScreen.tsx`, `m/src/features/settings/SettingsScreen.tsx`, `m/src/features/journal/JournalScreen.tsx`, `m/src/features/calendar/CalendarScreen.tsx`, `m/src/features/activities/components/ActivityFormModal.tsx`, `m/src/features/activities/components/SymbolPicker.tsx`
      Verify: Run mobile app in both light and dark mode, navigate through all affected screens (Notes, Settings, Journal, Calendar, Activities), confirm all UI elements are readable and properly styled in both modes.

- [ ] 6. Final Integration Verification
      Run the complete mobile app in both light and dark modes and verify all three issues are resolved:
      - Leave module returns 403 (not 500) for unauthorized users
      - Activity icons display correctly on Activities screen
      - All screens are readable and properly styled in both light and dark mode
      Files: N/A (end-to-end verification)
      Verify: Manual testing across all screens in both theme modes. Run `bun test` to ensure no regressions in server-side unit tests.

## Notes

- The LoginScreen.tsx Google SVG has hardcoded brand colors which should NOT be changed - those are official Google brand colors.
- Modal overlays may benefit from a new semantic token like `colors.modalBackdrop` if one doesn't exist, to ensure consistent semi-transparent overlays across light/dark modes.
- The icon issue is a simple prop name mismatch - the API and database field are correct.
- Leave type colors in LeaveModal and LeaveWidgetCard are duplicated - both define the same 6-item LEAVE_TYPES/LEAVE_TYPES_CONFIG array. Consider extracting to a shared constant after fixing.
