import { describe, it, expect } from 'bun:test'
import {
  getCurrentTimeIndicatorPosition,
  DEFAULT_GRID_CONFIG,
} from '@/modules/calendar/utils/timeGrid'

describe('Current-Time Indicator Clock & Timeline Rollover (Area B)', () => {
  const weekDays = [
    '2026-09-14', // Monday (Today in test scenario)
    '2026-09-15', // Tuesday
    '2026-09-16', // Wednesday
    '2026-09-17', // Thursday
    '2026-09-18', // Friday
    '2026-09-19', // Saturday
    '2026-09-20', // Sunday
  ]

  describe('Local Date Column Matching', () => {
    it('should render indicator exclusively on the active local date column across a 7-day grid', () => {
      const activeDate = '2026-09-14'
      const simulatedTime = new Date(2026, 8, 14, 14, 30, 0) // 2:30 PM

      const visibilityPerDay = weekDays.map(dayStr => {
        const result = getCurrentTimeIndicatorPosition({
          columnDateStr: dayStr,
          currentLocalDateStr: activeDate,
          currentTime: simulatedTime,
          config: DEFAULT_GRID_CONFIG,
        })
        return { dayStr, isVisible: result.isVisible, topPx: result.topPx }
      })

      // Exactly one column is visible
      const visibleColumns = visibilityPerDay.filter(v => v.isVisible)
      expect(visibleColumns.length).toBe(1)
      expect(visibleColumns[0].dayStr).toBe('2026-09-14')

      // 14:30 - 6:00 = 8.5 hours => 8.5 * 60px = 510px
      expect(visibleColumns[0].topPx).toBe(510)

      // All remaining 6 columns must be invisible
      const invisibleColumns = visibilityPerDay.filter(v => !v.isVisible)
      expect(invisibleColumns.length).toBe(6)
    })
  })

  describe('30-Second Clock Interval Progression', () => {
    it('should update indicator top offset accurately as clock ticks forward in 30s increments', () => {
      const activeDate = '2026-09-14'

      // Baseline: 09:00:00 (3 hours past 6 AM = 180px)
      const t0 = new Date(2026, 8, 14, 9, 0, 0)
      const res0 = getCurrentTimeIndicatorPosition({
        columnDateStr: activeDate,
        currentLocalDateStr: activeDate,
        currentTime: t0,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(res0.topPx).toBe(180)
      expect(res0.timeLabel).toBe('09:00')

      // Tick +30 seconds: 09:00:30 (3h 0.5m = 180.5px => rounded to 181px)
      const t30s = new Date(2026, 8, 14, 9, 0, 30)
      const res30s = getCurrentTimeIndicatorPosition({
        columnDateStr: activeDate,
        currentLocalDateStr: activeDate,
        currentTime: t30s,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(res30s.topPx).toBe(180.5)

      // Tick +60 seconds: 09:01:00 (181px, timeLabel '09:01')
      const t60s = new Date(2026, 8, 14, 9, 1, 0)
      const res60s = getCurrentTimeIndicatorPosition({
        columnDateStr: activeDate,
        currentLocalDateStr: activeDate,
        currentTime: t60s,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(res60s.topPx).toBe(181)
      expect(res60s.timeLabel).toBe('09:01')

      // Tick +15 minutes: 09:15:00 (195px)
      const t15m = new Date(2026, 8, 14, 9, 15, 0)
      const res15m = getCurrentTimeIndicatorPosition({
        columnDateStr: activeDate,
        currentLocalDateStr: activeDate,
        currentTime: t15m,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(res15m.topPx).toBe(195)
      expect(res15m.timeLabel).toBe('09:15')
    })
  })

  describe('Midnight Rollover & Out-of-Bounds Handling', () => {
    it('should hide indicator when time is outside startHour-endHour bounds', () => {
      const activeDate = '2026-09-14'

      // 03:00 AM (before startHour 6 AM)
      const beforeHours = new Date(2026, 8, 14, 3, 0, 0)
      const resBefore = getCurrentTimeIndicatorPosition({
        columnDateStr: activeDate,
        currentLocalDateStr: activeDate,
        currentTime: beforeHours,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(resBefore.isVisible).toBe(false)

      // 23:30 PM (after endHour 23 PM)
      const afterHours = new Date(2026, 8, 14, 23, 30, 0)
      const resAfter = getCurrentTimeIndicatorPosition({
        columnDateStr: activeDate,
        currentLocalDateStr: activeDate,
        currentTime: afterHours,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(resAfter.isVisible).toBe(false)
    })

    it('should rollover from day T to day T+1 seamlessly without stale indicator retention', () => {
      // Step 1: 22:45 on Sept 14 (within grid bounds on Day 14)
      const nightTime = new Date(2026, 8, 14, 22, 45, 0)
      const resDay14Night = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-14',
        currentLocalDateStr: '2026-09-14',
        currentTime: nightTime,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(resDay14Night.isVisible).toBe(true)
      // 22:45 - 6:00 = 16h 45m = 1005px
      expect(resDay14Night.topPx).toBe(1005)

      // Step 2: Clock rolls over past midnight into Sept 15 (e.g. 01:15 AM)
      // Local date is now Sept 15
      const earlyMorning = new Date(2026, 8, 15, 1, 15, 0)
      // Day 14 check with updated local date
      const resDay14PastMidnight = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-14',
        currentLocalDateStr: '2026-09-15',
        currentTime: earlyMorning,
        config: DEFAULT_GRID_CONFIG,
      })
      // Day 14 must be invisible because it is no longer the current local date!
      expect(resDay14PastMidnight.isVisible).toBe(false)

      // Day 15 check at 01:15 AM (out of bounds < 6 AM)
      const resDay15BeforeGrid = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-15',
        currentLocalDateStr: '2026-09-15',
        currentTime: earlyMorning,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(resDay15BeforeGrid.isVisible).toBe(false)

      // Step 3: Clock reaches 08:00 AM on Sept 15
      const morningTime = new Date(2026, 8, 15, 8, 0, 0)
      const resDay15Morning = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-15',
        currentLocalDateStr: '2026-09-15',
        currentTime: morningTime,
        config: DEFAULT_GRID_CONFIG,
      })
      // Now visible on Day 15 at 120px
      expect(resDay15Morning.isVisible).toBe(true)
      expect(resDay15Morning.topPx).toBe(120)
      expect(resDay15Morning.timeLabel).toBe('08:00')

      // Day 14 remains invisible
      const resDay14Stale = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-14',
        currentLocalDateStr: '2026-09-15',
        currentTime: morningTime,
        config: DEFAULT_GRID_CONFIG,
      })
      expect(resDay14Stale.isVisible).toBe(false)
    })
  })
})
