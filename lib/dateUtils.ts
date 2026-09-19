/**
 * Tracker shared date utilities.
 *
 * All date manipulation in UI components and services must come from here,
 * not from ad-hoc inline implementations.
 *
 * Timezone strategy:
 *   - Storage/comparison strings: UTC-based YYYY-MM-DD (parseUTCDate / formatUTCDate).
 *   - Display strings shown to users: local-time via Intl / date-fns.
 *   - Today string: local calendar date (getTodayStr), matching what the user sees.
 *
 * Do NOT silently change timezone semantics — if you add a function that
 * differs from this strategy, document it explicitly.
 */

import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  isTomorrow,
  parseISO,
  differenceInCalendarDays,
} from 'date-fns'

// ─── Re-exports from recurrence (existing UTC core) ──────────────────────────
// These are the authoritative UTC-safe primitives already used by services.
export {
  parseUTCDate,
  formatUTCDate,
  addUTCDays,
  addUTCMonths,
  addUTCYears,
  diffUTCDays,
  getTodayDateStr,
  getWeekDates,
} from './recurrence'

// ─── Local-calendar today ─────────────────────────────────────────────────────

/**
 * Returns the user's local calendar date as YYYY-MM-DD.
 * Use this when you need "what day does the user see right now".
 * Identical to getTodayDateStr() but named more clearly for UI contexts.
 */
export function todayYMD(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── UTC-based YYYY-MM-DD extraction ─────────────────────────────────────────

/**
 * Extracts a UTC-based YYYY-MM-DD string from a Date or ISO string.
 * Use for stored date fields that are anchored to UTC noon (weight, journal, leave).
 */
export function toYMD(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Display formatting (user-facing) ────────────────────────────────────────

/**
 * Short human-readable date: "Jan 5, 2025"
 */
export function fmtDateShort(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, 'MMM d, yyyy')
}

/**
 * Medium human-readable date with weekday: "Mon, Jan 5"
 */
export function fmtDateMed(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, 'EEE, MMM d')
}

/**
 * Full date: "Monday, January 5, 2025"
 */
export function fmtDateFull(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, 'EEEE, MMMM d, yyyy')
}

/**
 * Time only: "14:30" or "2:30 PM" depending on the format preference.
 * Defaults to 24-hour.
 */
export function fmtTime(d: Date | string, use12h = false): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, use12h ? 'h:mm a' : 'HH:mm')
}

/**
 * Relative time label: "today", "yesterday", "tomorrow", or "Jan 5, 2025".
 * Useful for history lists where recency matters.
 */
export function fmtRelativeDate(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isTomorrow(date)) return 'Tomorrow'
  return fmtDateShort(date)
}

/**
 * Fuzzy distance: "3 days ago", "in 2 months".
 */
export function fmtTimeAgo(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return formatDistanceToNow(date, { addSuffix: true })
}

// ─── Range / calculation helpers ─────────────────────────────────────────────

/**
 * Number of calendar days between two YYYY-MM-DD strings or Dates.
 * Positive = end is after start. Uses local calendar days (date-fns).
 */
export function daysBetween(start: Date | string, end: Date | string): number {
  const a = typeof start === 'string' ? parseISO(start) : start
  const b = typeof end === 'string' ? parseISO(end) : end
  return Math.abs(differenceInCalendarDays(b, a))
}

/**
 * Inclusive count: end - start + 1 days (for leave duration display).
 */
export function inclusiveDays(start: string, end: string): number {
  return daysBetween(start, end) + 1
}

/**
 * Returns YYYY-MM-DD for N days from today (positive = future, negative = past).
 */
export function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Constructs a local Date object from a YYYY-MM-DD calendar date and HH:mm time.
 * Adheres to Tracker's canonical local date/time policy.
 */
export function createLocalDateTime(dateStr: string, timeStr: string): Date {
  if (!dateStr || !timeStr) {
    throw new Error(`dateStr and timeStr are required. Received dateStr: "${dateStr}", timeStr: "${timeStr}"`)
  }

  // If timeStr is already a full ISO timestamp, parse directly
  if (timeStr.includes('T') || (timeStr.includes('-') && timeStr.length >= 19)) {
    const parsed = new Date(timeStr)
    if (!isNaN(parsed.getTime())) return parsed
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!dateMatch) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD`)
  }

  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim())
  if (!timeMatch) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:mm`)
  }

  const year = parseInt(dateMatch[1], 10)
  const month = parseInt(dateMatch[2], 10)
  const day = parseInt(dateMatch[3], 10)
  const hours = parseInt(timeMatch[1], 10)
  const minutes = parseInt(timeMatch[2], 10)
  const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`)
  }
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day}. Must be between 1 and 31.`)
  }
  if (hours < 0 || hours > 23) {
    throw new Error(`Invalid hours: ${hours}. Must be between 0 and 23.`)
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes: ${minutes}. Must be between 0 and 59.`)
  }
  if (seconds < 0 || seconds > 59) {
    throw new Error(`Invalid seconds: ${seconds}. Must be between 0 and 59.`)
  }

  const result = new Date(year, month - 1, day, hours, minutes, seconds, 0)
  if (isNaN(result.getTime())) {
    throw new Error(`Invalid date constructed from "${dateStr} ${timeStr}"`)
  }

  return result
}

/**
 * Returns a local calendar date string (YYYY-MM-DD) for a given Date object.
 */
export function toLocalDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Parses an all-day date string (YYYY-MM-DD) into a Date anchored at UTC noon.
 * Anchoring to 12:00:00Z ensures the date remains on the exact same calendar day
 * across all global timezones (UTC-12 to UTC+14) without boundary rollover.
 */
export function parseAllDayDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!match) {
    throw new Error(`Invalid all-day date format: "${dateStr}". Expected YYYY-MM-DD.`)
  }
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const day = parseInt(match[3], 10)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

/**
 * Extracts the canonical YYYY-MM-DD representation of an all-day event Date.
 */
export function formatAllDayDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return toYMD(date)
}

/**
 * Checks whether an instant sits at a day boundary (start of day 00:00:00 or end of day 23:59:xx).
 */
export function isMidnightBoundary(d: Date): { isStartOfDay: boolean; isEndOfDay: boolean } {
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const seconds = d.getSeconds()
  return {
    isStartOfDay: hours === 0 && minutes === 0 && seconds === 0,
    isEndOfDay: hours === 23 && minutes === 59
  }
}

/**
 * Checks if two date objects/strings refer to the same calendar day in a specific IANA timezone.
 */
export function isSameDayInTimezone(d1: Date | string, d2: Date | string, timeZone: string): boolean {
  const date1 = typeof d1 === 'string' ? new Date(d1) : d1
  const date2 = typeof d2 === 'string' ? new Date(d2) : d2

  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return dtf.format(date1) === dtf.format(date2)
}

