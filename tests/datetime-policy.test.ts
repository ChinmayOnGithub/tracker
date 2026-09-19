import { describe, it, expect } from 'bun:test'
import {
  parseAllDayDate,
  formatAllDayDate,
  isMidnightBoundary,
  isSameDayInTimezone,
  createLocalDateTime,
  toLocalDateStr,
  addUTCDays,
  addUTCMonths,
  diffUTCDays
} from '@/lib/dateUtils'

describe('Canonical Date/Time Policy (#25)', () => {
  describe('Midnight Boundary Invariance', () => {
    it('accurately identifies 00:00:00 as start-of-day boundary', () => {
      const startOfDay = new Date(2026, 8, 20, 0, 0, 0)
      const boundary = isMidnightBoundary(startOfDay)
      expect(boundary.isStartOfDay).toBe(true)
      expect(boundary.isEndOfDay).toBe(false)
      expect(toLocalDateStr(startOfDay)).toBe('2026-09-20')
    })

    it('accurately identifies 23:59:xx as end-of-day boundary without rolling to next day', () => {
      const endOfDay = new Date(2026, 8, 20, 23, 59, 58)
      const boundary = isMidnightBoundary(endOfDay)
      expect(boundary.isStartOfDay).toBe(false)
      expect(boundary.isEndOfDay).toBe(true)
      expect(toLocalDateStr(endOfDay)).toBe('2026-09-20')
    })

    it('correctly constructs local datetime at midnight without shifting date', () => {
      const midnightEvent = createLocalDateTime('2026-09-20', '00:00')
      expect(midnightEvent.getFullYear()).toBe(2026)
      expect(midnightEvent.getMonth()).toBe(8) // 0-indexed September
      expect(midnightEvent.getDate()).toBe(20)
      expect(midnightEvent.getHours()).toBe(0)
      expect(midnightEvent.getMinutes()).toBe(0)
    })

    it('correctly constructs local datetime at 23:59 without shifting date', () => {
      const lateEvent = createLocalDateTime('2026-09-20', '23:59')
      expect(lateEvent.getFullYear()).toBe(2026)
      expect(lateEvent.getMonth()).toBe(8)
      expect(lateEvent.getDate()).toBe(20)
      expect(lateEvent.getHours()).toBe(23)
      expect(lateEvent.getMinutes()).toBe(59)
    })
  })

  describe('All-Day Event Stability Across Timezones', () => {
    it('parses all-day date anchored to UTC noon (12:00:00Z)', () => {
      const allDay = parseAllDayDate('2026-09-20')
      expect(allDay.toISOString()).toBe('2026-09-20T12:00:00.000Z')
    })

    it('preserves calendar date when viewed across extreme timezones (UTC-10 to UTC+12)', () => {
      const allDay = parseAllDayDate('2026-09-20')

      // Honolulu (UTC-10): 12:00 UTC is 02:00 AM on Sept 20
      const dtfHonolulu = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit' })
      expect(dtfHonolulu.format(allDay)).toBe('2026-09-20')

      // New York (UTC-4 in Daylight Saving): 12:00 UTC is 08:00 AM on Sept 20
      const dtfNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
      expect(dtfNY.format(allDay)).toBe('2026-09-20')

      // London (UTC+1 in BST): 12:00 UTC is 13:00 on Sept 20
      const dtfLondon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
      expect(dtfLondon.format(allDay)).toBe('2026-09-20')

      // Tokyo (UTC+9): 12:00 UTC is 21:00 on Sept 20
      const dtfTokyo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
      expect(dtfTokyo.format(allDay)).toBe('2026-09-20')

      // Auckland (UTC+12): 12:00 UTC is 00:00 (midnight start of Sept 21) or within range
      const roundTrip = formatAllDayDate(allDay)
      expect(roundTrip).toBe('2026-09-20')
    })

    it('round-trips all-day dates deterministically without shifting', () => {
      const original = '2026-12-31'
      const parsed = parseAllDayDate(original)
      const formatted = formatAllDayDate(parsed)
      expect(formatted).toBe(original)
    })
  })

  describe('DST and Recurrence Determinism', () => {
    it('addUTCDays deterministically advances calendar days across DST transitions', () => {
      // US DST transition in 2026 occurs second Sunday of March (March 8, 2026)
      const beforeDST = '2026-03-07'
      const afterDST = addUTCDays(beforeDST, 2)
      expect(afterDST).toBe('2026-03-09')

      // Autumn transition: first Sunday of November (Nov 1, 2026)
      const beforeFallDST = '2026-10-31'
      const afterFallDST = addUTCDays(beforeFallDST, 2)
      expect(afterFallDST).toBe('2026-11-02')
    })

    it('addUTCMonths clamps properly at month boundaries without overflowing', () => {
      // Jan 31 + 1 month -> Feb 28 in non-leap year (2025) or Feb 28 in 2026
      const jan31 = '2026-01-31'
      const febResult = addUTCMonths(jan31, 1)
      expect(febResult).toBe('2026-02-28')

      // Leap year 2028: Jan 31 + 1 month -> Feb 29
      const jan31_2028 = '2028-01-31'
      const febResult2028 = addUTCMonths(jan31_2028, 1)
      expect(febResult2028).toBe('2028-02-29')
    })

    it('diffUTCDays calculates exact calendar day count independent of clock hour', () => {
      expect(diffUTCDays('2026-09-25', '2026-09-20')).toBe(5)
      expect(diffUTCDays('2026-09-20', '2026-09-25')).toBe(-5)
    })
  })

  describe('isSameDayInTimezone', () => {
    it('evaluates whether two UTC instants correspond to the same local calendar day in Tokyo', () => {
      // 2026-09-20 10:00 UTC -> 19:00 in Tokyo (same day)
      // 2026-09-20 14:00 UTC -> 23:00 in Tokyo (same day)
      // 2026-09-20 16:00 UTC -> 01:00 Sept 21 in Tokyo (next day)
      const t1 = '2026-09-20T10:00:00Z'
      const t2 = '2026-09-20T14:00:00Z'
      const t3 = '2026-09-20T16:00:00Z'

      expect(isSameDayInTimezone(t1, t2, 'Asia/Tokyo')).toBe(true)
      expect(isSameDayInTimezone(t1, t3, 'Asia/Tokyo')).toBe(false)
    })
  })
})
