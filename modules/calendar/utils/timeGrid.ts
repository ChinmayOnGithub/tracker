/**
 * Pure, deterministic time-grid conversion and interaction primitives for Tracker Calendar.
 *
 * Requirements:
 * - Pure mathematics: identical inputs strictly yield identical outputs.
 * - Respects slot height (px/hr), snap interval (minutes), start/end hours.
 * - Handles vertical scrolling (scrollTop) and nested offsets without double scaling.
 * - Handles drag-and-drop duration preservation and column/day mapping.
 * - Handles top/bottom resizing with strict minimum duration and opposite boundary anchoring.
 * - Handles current-time indicator line position and local date matching.
 * - Timezone-aware date construction without UTC date shifting.
 */

export interface TimeGridConfig {
  startHour: number // e.g. 6 (6:00 AM)
  endHour: number   // e.g. 23 (11:00 PM, meaning 17 hour slots from 6:00 to 23:00)
  slotHeight: number // pixel height of 1 hour (e.g. 60px)
  snapMinutes: number // snapping interval in minutes (e.g. 15)
  minDurationMinutes: number // minimum event duration in minutes (e.g. 15)
}

export const DEFAULT_GRID_CONFIG: TimeGridConfig = {
  startHour: 6,
  endHour: 23,
  slotHeight: 60,
  snapMinutes: 15,
  minDurationMinutes: 15,
}

/**
 * Calculates content Y offset from viewport pointer coordinates and container geometry.
 * Handles nested offsets and vertical scroll position deterministically.
 */
export function calculateContentOffsetY(
  clientY: number,
  containerTop: number,
  scrollTop: number = 0
): number {
  return clientY - containerTop + scrollTop
}

/**
 * Converts a content Y offset (in pixels from grid start) to snapped minutes from midnight.
 * Clamps between startHour * 60 and endHour * 60.
 */
export function pixelOffsetToMinutes(
  offsetY: number,
  config: TimeGridConfig = DEFAULT_GRID_CONFIG
): number {
  const { startHour, endHour, slotHeight, snapMinutes } = config
  const totalGridMinutes = (endHour - startHour) * 60

  // Pixel ratio: 1 hour = slotHeight px => 1 min = slotHeight / 60 px
  const rawMinutesFromStart = (offsetY / slotHeight) * 60

  // Snap to interval
  const snappedMinutesFromStart = Math.round(rawMinutesFromStart / snapMinutes) * snapMinutes

  // Clamp within grid boundary [0, totalGridMinutes]
  const clampedMinutesFromStart = Math.max(0, Math.min(totalGridMinutes, snappedMinutesFromStart))

  return startHour * 60 + clampedMinutesFromStart
}

/**
 * Converts a Date object or ISO string to pixel offset from the top of the grid.
 */
export function timeToPixelOffset(
  time: Date | string,
  config: TimeGridConfig = DEFAULT_GRID_CONFIG,
  timezone?: string
): number {
  const { startHour, slotHeight } = config
  const dateObj = typeof time === 'string' ? new Date(time) : time

  let hours: number
  let minutes: number

  if (timezone) {
    // Format in intended IANA timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(dateObj)
    hours = Number(parts.find(p => p.type === 'hour')?.value ?? dateObj.getHours())
    minutes = Number(parts.find(p => p.type === 'minute')?.value ?? dateObj.getMinutes())
    if (hours === 24) hours = 0
  } else {
    hours = dateObj.getHours()
    minutes = dateObj.getMinutes()
  }

  const totalMinutes = hours * 60 + minutes
  const minutesFromStart = totalMinutes - startHour * 60
  return (minutesFromStart / 60) * slotHeight
}

/**
 * Converts duration (in ms or between two Dates) to pixel height.
 * Enforces minDurationMinutes.
 */
export function durationToPixelHeight(
  start: Date | string,
  end: Date | string,
  config: TimeGridConfig = DEFAULT_GRID_CONFIG
): number {
  const { slotHeight, minDurationMinutes } = config
  const startDate = typeof start === 'string' ? new Date(start) : start
  const endDate = typeof end === 'string' ? new Date(end) : end

  const durationMs = endDate.getTime() - startDate.getTime()
  const durationMinutes = Math.max(minDurationMinutes, durationMs / (60 * 1000))
  return (durationMinutes / 60) * slotHeight
}

/**
 * Creates a local ISO-compatible Date string for a specific YYYY-MM-DD date and minutes from midnight.
 * Guaranteed not to shift date boundaries.
 */
export function formatDateTimeForDateAndMinutes(
  dateStr: string,
  minutesFromMidnight: number
): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

/**
 * Drag and Drop Calculator.
 * Given original start and end, target date string, and relative pointer Y,
 * computes new start and new end, preserving original duration down to the millisecond.
 */
export interface DragResult {
  newStart: Date
  newEnd: Date
  durationMs: number
  isValid: boolean
}

export function calculateDragDestination(options: {
  originalStart: Date | string
  originalEnd: Date | string
  targetDateStr: string
  offsetY: number
  config?: TimeGridConfig
}): DragResult {
  const { originalStart, originalEnd, targetDateStr, offsetY, config = DEFAULT_GRID_CONFIG } = options

  const sDate = typeof originalStart === 'string' ? new Date(originalStart) : originalStart
  const eDate = typeof originalEnd === 'string' ? new Date(originalEnd) : originalEnd
  const durationMs = eDate.getTime() - sDate.getTime()

  if (durationMs <= 0) {
    return {
      newStart: sDate,
      newEnd: eDate,
      durationMs: 0,
      isValid: false,
    }
  }

  // Calculate snapped start minutes
  const newStartMinutes = pixelOffsetToMinutes(offsetY, config)
  const newStart = formatDateTimeForDateAndMinutes(targetDateStr, newStartMinutes)
  const newEnd = new Date(newStart.getTime() + durationMs)

  return {
    newStart,
    newEnd,
    durationMs,
    isValid: newStart.getTime() < newEnd.getTime(),
  }
}

/**
 * Resize Calculator.
 * Top resize moves start while keeping end anchored.
 * Bottom resize moves end while keeping start anchored.
 * Strictly enforces minDurationMinutes and prevents zero or negative duration.
 */
export interface ResizeResult {
  newStart: Date
  newEnd: Date
  durationMs: number
  isValid: boolean
}

export function calculateResizeDestination(options: {
  originalStart: Date | string
  originalEnd: Date | string
  handle: 'top' | 'bottom'
  targetDateStr: string
  offsetY: number
  config?: TimeGridConfig
}): ResizeResult {
  const { originalStart, originalEnd, handle, targetDateStr, offsetY, config = DEFAULT_GRID_CONFIG } = options

  const sDate = typeof originalStart === 'string' ? new Date(originalStart) : originalStart
  const eDate = typeof originalEnd === 'string' ? new Date(originalEnd) : originalEnd
  const minDurationMs = config.minDurationMinutes * 60 * 1000

  const pointerMinutes = pixelOffsetToMinutes(offsetY, config)
  const pointerTime = formatDateTimeForDateAndMinutes(targetDateStr, pointerMinutes)

  if (handle === 'top') {
    // End is fixed, Start moves
    // Start cannot exceed end - minDurationMs
    const maxStart = new Date(eDate.getTime() - minDurationMs)
    let newStart = pointerTime
    if (newStart.getTime() > maxStart.getTime()) {
      newStart = maxStart
    }

    const durationMs = eDate.getTime() - newStart.getTime()
    return {
      newStart,
      newEnd: eDate,
      durationMs,
      isValid: durationMs >= minDurationMs,
    }
  } else {
    // Start is fixed, End moves
    // End cannot be less than start + minDurationMs
    const minEnd = new Date(sDate.getTime() + minDurationMs)
    let newEnd = pointerTime
    if (newEnd.getTime() < minEnd.getTime()) {
      newEnd = minEnd
    }

    const durationMs = newEnd.getTime() - sDate.getTime()
    return {
      newStart: sDate,
      newEnd,
      durationMs,
      isValid: durationMs >= minDurationMs,
    }
  }
}

/**
 * Current-Time Indicator helper.
 * Determines if indicator should be displayed on the column date,
 * and calculates vertical pixel position.
 */
export interface CurrentTimeIndicatorResult {
  isVisible: boolean
  topPx: number
  timeLabel: string
}

export function getCurrentTimeIndicatorPosition(options: {
  columnDateStr: string
  currentLocalDateStr: string
  currentTime?: Date
  config?: TimeGridConfig
}): CurrentTimeIndicatorResult {
  const {
    columnDateStr,
    currentLocalDateStr,
    currentTime = new Date(),
    config = DEFAULT_GRID_CONFIG
  } = options

  // Only appear if column date matches current local calendar date
  if (columnDateStr !== currentLocalDateStr) {
    return { isVisible: false, topPx: 0, timeLabel: '' }
  }

  const hours = currentTime.getHours()
  const minutes = currentTime.getMinutes()
  const seconds = currentTime.getSeconds()

  const currentTotalMinutes = hours * 60 + minutes + seconds / 60
  const gridStartMinutes = config.startHour * 60
  const gridEndMinutes = config.endHour * 60

  // Check if current time falls within grid hours
  if (currentTotalMinutes < gridStartMinutes || currentTotalMinutes > gridEndMinutes) {
    return { isVisible: false, topPx: 0, timeLabel: '' }
  }

  const minutesFromStart = currentTotalMinutes - gridStartMinutes
  const topPx = (minutesFromStart / 60) * config.slotHeight
  const timeLabel = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  return {
    isVisible: true,
    topPx,
    timeLabel,
  }
}
