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
