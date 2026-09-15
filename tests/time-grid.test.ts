import { describe, it, expect } from 'bun:test'
import {
  calculateContentOffsetY,
  pixelOffsetToMinutes,
  timeToPixelOffset,
  durationToPixelHeight,
  calculateDragDestination,
  calculateResizeDestination,
  getCurrentTimeIndicatorPosition,
  DEFAULT_GRID_CONFIG,
  TimeGridConfig,
} from '@/modules/calendar/utils/timeGrid'

describe('TimeGrid Conversion Utilities (Area A, B, C, D)', () => {
  describe('A. Pixel-to-Time Conversion & Geometry', () => {
    it('should calculate content offset accounting for clientY, containerTop, and scrollTop', () => {
      // clientY = 150, containerTop = 50, scrollTop = 100 => 150 - 50 + 100 = 200px
      const offset = calculateContentOffsetY(150, 50, 100)
      expect(offset).toBe(200)
    })

    it('should map top of grid (0px) to startHour:00 (default 6:00 AM = 360m)', () => {
      const minutes = pixelOffsetToMinutes(0, DEFAULT_GRID_CONFIG)
      expect(minutes).toBe(6 * 60) // 360 minutes
    })

    it('should map middle of grid accurately with default 60px/hr and 15m snap', () => {
      // 2 hours down (120px) => 6:00 + 2h = 8:00 AM = 480m
      const minutes = pixelOffsetToMinutes(120, DEFAULT_GRID_CONFIG)
      expect(minutes).toBe(8 * 60)

      // 2 hours 10 mins (130px) => snaps to 2h 15m (135px => 8:15 AM)
      const minutesSnapped = pixelOffsetToMinutes(130, DEFAULT_GRID_CONFIG)
      expect(minutesSnapped).toBe(8 * 60 + 15)
    })

    it('should clamp bottom of grid to endHour:00 (23:00 = 1380m)', () => {
      // Grid has (23 - 6) = 17 hours => 17 * 60 = 1020px
      const minutesAtBottom = pixelOffsetToMinutes(1020, DEFAULT_GRID_CONFIG)
      expect(minutesAtBottom).toBe(23 * 60)

      // Any offset exceeding grid height clamps to endHour
      const minutesBeyond = pixelOffsetToMinutes(2000, DEFAULT_GRID_CONFIG)
      expect(minutesBeyond).toBe(23 * 60)
    })

    it('should respect different slot heights (e.g. 40px/hr, 80px/hr)', () => {
      const config40: TimeGridConfig = { ...DEFAULT_GRID_CONFIG, slotHeight: 40 }
      // 80px down at 40px/hr = 2 hours => 8:00 AM
      expect(pixelOffsetToMinutes(80, config40)).toBe(8 * 60)

      const config80: TimeGridConfig = { ...DEFAULT_GRID_CONFIG, slotHeight: 80 }
      // 160px down at 80px/hr = 2 hours => 8:00 AM
      expect(pixelOffsetToMinutes(160, config80)).toBe(8 * 60)
    })

    it('should respect different snap intervals (e.g. 5m, 30m, 60m)', () => {
      const config30m: TimeGridConfig = { ...DEFAULT_GRID_CONFIG, snapMinutes: 30 }
      // 20 minutes in pixels (20px) snaps to 30 minutes (30px)
      expect(pixelOffsetToMinutes(20, config30m)).toBe(6 * 60 + 30)

      const config5m: TimeGridConfig = { ...DEFAULT_GRID_CONFIG, snapMinutes: 5 }
      // 12 minutes in pixels (12px) snaps to 10m (10px)
      expect(pixelOffsetToMinutes(12, config5m)).toBe(6 * 60 + 10)
    })

    it('should map time to pixel offset accurately and invert correctly', () => {
      const testTime = new Date(2026, 8, 14, 10, 30, 0) // 10:30 AM
      // 10:30 - 6:00 = 4.5 hours => 4.5 * 60 = 270px
      const offset = timeToPixelOffset(testTime, DEFAULT_GRID_CONFIG)
      expect(offset).toBe(270)

      // Invert back from 270px => 10:30 (630 minutes)
      const minutes = pixelOffsetToMinutes(offset, DEFAULT_GRID_CONFIG)
      expect(minutes).toBe(10 * 60 + 30)
    })

    it('should compute duration to pixel height and enforce minDurationMinutes', () => {
      const start = new Date('2026-09-14T09:00:00')
      const end = new Date('2026-09-14T10:30:00') // 90 min => 1.5 hr => 90px
      expect(durationToPixelHeight(start, end, DEFAULT_GRID_CONFIG)).toBe(90)

      // Short 5-minute event enforces 15m minimum => 15px
      const shortEnd = new Date('2026-09-14T09:05:00')
      expect(durationToPixelHeight(start, shortEnd, DEFAULT_GRID_CONFIG)).toBe(15)
    })
  })

  describe('B. Current-Time Indicator', () => {
    it('should show indicator ONLY when column date matches current local date', () => {
      const todayStr = '2026-09-14'
      const noon = new Date(2026, 8, 14, 12, 0, 0)

      // Same date => visible
      const todayResult = getCurrentTimeIndicatorPosition({
        columnDateStr: todayStr,
        currentLocalDateStr: todayStr,
        currentTime: noon,
      })
      expect(todayResult.isVisible).toBe(true)
      // 12:00 - 6:00 = 6 hours => 6 * 60 = 360px
      expect(todayResult.topPx).toBe(360)

      // Yesterday => invisible
      const yesterdayResult = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-13',
        currentLocalDateStr: todayStr,
        currentTime: noon,
      })
      expect(yesterdayResult.isVisible).toBe(false)

      // Tomorrow => invisible
      const tomorrowResult = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-15',
        currentLocalDateStr: todayStr,
        currentTime: noon,
      })
      expect(tomorrowResult.isVisible).toBe(false)
    })

    it('should handle times outside grid boundaries (e.g. 3 AM or 11:30 PM)', () => {
      const earlyMorning = new Date(2026, 8, 14, 3, 0, 0)
      const resEarly = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-14',
        currentLocalDateStr: '2026-09-14',
        currentTime: earlyMorning,
      })
      expect(resEarly.isVisible).toBe(false)

      const lateNight = new Date(2026, 8, 14, 23, 30, 0)
      const resLate = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-14',
        currentLocalDateStr: '2026-09-14',
        currentTime: lateNight,
      })
      expect(resLate.isVisible).toBe(false)
    })

    it('should handle midnight rollover seamlessly', () => {
      // At 23:59:59 on Sept 14
      const time1 = new Date(2026, 8, 14, 23, 59, 59)
      const res1 = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-14',
        currentLocalDateStr: '2026-09-14',
        currentTime: time1,
      })
      // Outside 23:00 endHour => invisible on Sept 14
      expect(res1.isVisible).toBe(false)

      // At 06:05:00 on Sept 15 (next day)
      const time2 = new Date(2026, 8, 15, 6, 5, 0)
      const res2 = getCurrentTimeIndicatorPosition({
        columnDateStr: '2026-09-15',
        currentLocalDateStr: '2026-09-15',
        currentTime: time2,
      })
      expect(res2.isVisible).toBe(true)
      expect(res2.topPx).toBe(5) // 5 minutes past 6 AM
    })
  })

  describe('C. Event Drag-and-Drop', () => {
    it('should preserve original event duration exactly across same-day drag', () => {
      const start = new Date(2026, 8, 14, 9, 0, 0)
      const end = new Date(2026, 8, 14, 10, 45, 0) // 105 minutes duration
      const originalDurationMs = end.getTime() - start.getTime()

      // Drag to 240px (10:00 AM)
      const result = calculateDragDestination({
        originalStart: start,
        originalEnd: end,
        targetDateStr: '2026-09-14',
        offsetY: 240,
      })

      expect(result.isValid).toBe(true)
      expect(result.durationMs).toBe(originalDurationMs)
      expect(result.newStart.getHours()).toBe(10)
      expect(result.newStart.getMinutes()).toBe(0)
      expect(result.newEnd.getHours()).toBe(11)
      expect(result.newEnd.getMinutes()).toBe(45)
    })

    it('should preserve original duration across different days (cross-day drag)', () => {
      const start = new Date(2026, 8, 14, 14, 0, 0) // Monday 2 PM
      const end = new Date(2026, 8, 14, 15, 30, 0) // Monday 3:30 PM (90m)
      const originalDurationMs = end.getTime() - start.getTime()

      // Drag to Wednesday (2026-09-16) at 120px (8:00 AM)
      const result = calculateDragDestination({
        originalStart: start,
        originalEnd: end,
        targetDateStr: '2026-09-16',
        offsetY: 120,
      })

      expect(result.isValid).toBe(true)
      expect(result.durationMs).toBe(originalDurationMs)
      expect(result.newStart.getFullYear()).toBe(2026)
      expect(result.newStart.getMonth()).toBe(8)
      expect(result.newStart.getDate()).toBe(16)
      expect(result.newStart.getHours()).toBe(8)
      expect(result.newStart.getMinutes()).toBe(0)

      expect(result.newEnd.getDate()).toBe(16)
      expect(result.newEnd.getHours()).toBe(9)
      expect(result.newEnd.getMinutes()).toBe(30)
    })

    it('should reject dragging invalid zero or negative duration events', () => {
      const start = new Date(2026, 8, 14, 10, 0, 0)
      const end = new Date(2026, 8, 14, 9, 0, 0) // Negative duration

      const result = calculateDragDestination({
        originalStart: start,
        originalEnd: end,
        targetDateStr: '2026-09-14',
        offsetY: 120,
      })
      expect(result.isValid).toBe(false)
    })
  })

  describe('D. Event Resizing', () => {
    it('top resize should move start earlier and keep end fixed', () => {
      const start = new Date(2026, 8, 14, 10, 0, 0) // 10:00 AM
      const end = new Date(2026, 8, 14, 12, 0, 0)   // 12:00 PM (end anchored)

      // Move top handle to 120px (8:00 AM)
      const result = calculateResizeDestination({
        originalStart: start,
        originalEnd: end,
        handle: 'top',
        targetDateStr: '2026-09-14',
        offsetY: 120,
      })

      expect(result.isValid).toBe(true)
      expect(result.newStart.getHours()).toBe(8)
      expect(result.newStart.getMinutes()).toBe(0)
      expect(result.newEnd.getTime()).toBe(end.getTime()) // End strictly intact
      expect(result.durationMs).toBe(4 * 60 * 60 * 1000) // 4 hours
    })

    it('top resize should move start later but never cross opposite boundary or violate min duration', () => {
      const start = new Date(2026, 8, 14, 10, 0, 0)
      const end = new Date(2026, 8, 14, 12, 0, 0) // 12:00 PM

      // Attempt to drag top handle all the way down to 13:00 (past end)
      // 13:00 - 6:00 = 7h => 420px
      const result = calculateResizeDestination({
        originalStart: start,
        originalEnd: end,
        handle: 'top',
        targetDateStr: '2026-09-14',
        offsetY: 420,
      })

      expect(result.isValid).toBe(true)
      // Clamped to end - 15m (11:45 AM)
      expect(result.newStart.getHours()).toBe(11)
      expect(result.newStart.getMinutes()).toBe(45)
      expect(result.newEnd.getTime()).toBe(end.getTime()) // End anchored
      expect(result.durationMs).toBe(15 * 60 * 1000) // Exactly min duration
    })

    it('bottom resize should move end later and keep start fixed', () => {
      const start = new Date(2026, 8, 14, 10, 0, 0) // 10:00 AM (start anchored)
      const end = new Date(2026, 8, 14, 11, 0, 0)   // 11:00 AM

      // Drag bottom handle to 360px (12:00 PM)
      const result = calculateResizeDestination({
        originalStart: start,
        originalEnd: end,
        handle: 'bottom',
        targetDateStr: '2026-09-14',
        offsetY: 360,
      })

      expect(result.isValid).toBe(true)
      expect(result.newStart.getTime()).toBe(start.getTime()) // Start strictly intact
      expect(result.newEnd.getHours()).toBe(12)
      expect(result.newEnd.getMinutes()).toBe(0)
      expect(result.durationMs).toBe(2 * 60 * 60 * 1000)
    })

    it('bottom resize should move end earlier but never cross start boundary or violate min duration', () => {
      const start = new Date(2026, 8, 14, 10, 0, 0) // 10:00 AM
      const end = new Date(2026, 8, 14, 12, 0, 0)   // 12:00 PM

      // Attempt to drag bottom handle up to 8:00 AM (before start)
      const result = calculateResizeDestination({
        originalStart: start,
        originalEnd: end,
        handle: 'bottom',
        targetDateStr: '2026-09-14',
        offsetY: 120, // 8:00 AM
      })

      expect(result.isValid).toBe(true)
      expect(result.newStart.getTime()).toBe(start.getTime()) // Start anchored
      // Clamped to start + 15m (10:15 AM)
      expect(result.newEnd.getHours()).toBe(10)
      expect(result.newEnd.getMinutes()).toBe(15)
      expect(result.durationMs).toBe(15 * 60 * 1000) // Exactly min duration
    })
  })
})
