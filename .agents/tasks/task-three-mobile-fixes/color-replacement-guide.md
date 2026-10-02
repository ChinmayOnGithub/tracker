# Color Replacement Guide for Light Mode Fix

## Hardcoded Colors to Replace

### Coral (Tracker Brand)
- `rgba(255, 117, 87, 0.12)` → `colors.coralSubtle`
- `rgba(255, 117, 87, 0.15)` → `colors.coralSubtle`
- `rgba(255, 117, 87, 0.08)` → `colors.coralSubtle` (lower opacity)
- `rgba(235, 94, 40, 0.12)` → `colors.coralSubtle`
- `rgba(235, 94, 40, 0.25)` → `colors.coral` with opacity 0.25 inline

### Success/Green
- `rgba(34, 197, 94, 0.15)` → `colors.successSubtle`
- `rgba(34, 197, 94, 0.3)` → `colors.success` with opacity 0.3 inline  
- `rgba(16, 185, 129, 0.15)` → `colors.successSubtle`
- `#34d399` → `colors.success`

### Warning/Amber
- `rgba(245, 158, 11, 0.15)` → `colors.warningSubtle`
- `rgba(245, 158, 11, 0.18)` → `colors.warningSubtle`
- `#f59e0b` → `colors.warning`
- `#fbbf24` → `colors.warning`
- `#f59e0b25` → `colors.warningSubtle`

### Sky/Blue
- `rgba(56, 189, 248, 0.15)` → use `colors.sky` with subtle variant
- `rgba(59, 130, 246, 0.1)` → use `colors.primary` + `colors.primarySubtle`
- `rgba(99, 102, 241, 0.15)` → `colors.primarySubtle`
- `#38bdf8` → `colors.sky`

### Purple
- `rgba(139, 92, 246, 0.12)` → `colors.purple` with subtle variant
- `#a78bfa` → `colors.purple`

### Rose/Red
- `#f87171` → `colors.rose` or `colors.danger`

### Modal Overlays
- `rgba(0, 0, 0, 0.7)` → keep as is (backdrop standard)
- `rgba(0, 0, 0, 0.65)` → keep as is (backdrop standard)

### White
- `#ffffff` → `colors.white`

## Files to Update

1. ✅ LeaveModal.tsx - DONE
2. ✅ LeaveWidgetCard.tsx - DONE  
3. ⏳ TodayScreen.tsx - coral badge
4. ⏳ TodayTaskRow.tsx - green done badge
5. ⏳ DailyCodingCard.tsx - amber badge
6. ⏳ WeightWidgetCard.tsx - green/coral weight indicators, modal backdrop
7. ⏳ JournalWidgetCard.tsx - purple badge
8. ⏳ TaskActionModal.tsx - modal overlay
9. ⏳ CalendarEventsSection.tsx - sky badge
10. ⏳ CalendarScreen.tsx - coral badges, primary badge
11. ⏳ NotesScreen.tsx - blue badge, modal overlay
12. ⏳ SettingsScreen.tsx - white check, amber pro badge
13. ⏳ JournalScreen.tsx - coral active row
14. ⏳ ActivityFormModal.tsx - modal overlay
15. ⏳ SymbolPicker.tsx - amber crown icon

## Pattern to Follow

### Step 1: Import useTheme
```typescript
import { useTheme } from '@/theme/ThemeContext'
```

### Step 2: Get colors in component
```typescript
const { colors } = useTheme()
```

### Step 3: Convert StyleSheet.create to function
```typescript
const styles = React.useMemo(() => createStyles(colors), [colors])

const createStyles = (colors: any) => StyleSheet.create({
  // ... styles using colors
})
```

### Step 4: Replace hardcoded colors
Use the mapping above to replace all hard-coded rgba() and hex values.
