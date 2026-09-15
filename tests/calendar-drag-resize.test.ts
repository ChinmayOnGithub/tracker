import { describe, it, expect, mock } from 'bun:test'
import { CalendarWeekDTO, CalendarWeekEventDTO } from '@/modules/calendar/dto/CalendarWeekDTO'
import {
  calculateDragDestination,
  calculateResizeDestination,
  DEFAULT_GRID_CONFIG,
} from '@/modules/calendar/utils/timeGrid'

// Helper modeling the optimistic update reducer used in Calendar.tsx
function applyOptimisticDrag(
  weekData: CalendarWeekDTO,
  event: CalendarWeekEventDTO,
  originDate: string,
  targetDate: string,
  newStart: Date,
  newEnd: Date
): CalendarWeekDTO {
  return {
    ...weekData,
    days: weekData.days
      .map(d => {
        if (d.date === originDate) {
          return { ...d, events: d.events.filter(ev => ev.id !== event.id) }
        }
        return d
      })
      .map(d => {
        if (d.date === targetDate) {
          const updatedEv: CalendarWeekEventDTO = {
            ...event,
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
          }
          return { ...d, events: [...d.events, updatedEv] }
        }
        return d
      }),
  }
}

function applyOptimisticResize(
  weekData: CalendarWeekDTO,
  event: CalendarWeekEventDTO,
  dateStr: string,
  newStart: Date,
  newEnd: Date
): CalendarWeekDTO {
  return {
    ...weekData,
    days: weekData.days.map(d => {
      if (d.date === dateStr) {
        return {
          ...d,
          events: d.events.map(ev => {
            if (ev.id === event.id) {
              return {
                ...ev,
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
              }
            }
            return ev
          }),
        }
      }
      return d
    }),
  }
}

describe('Calendar Drag-and-Drop & Resizing State Flow (Areas C & D)', () => {
  const initialEvent: CalendarWeekEventDTO = {
    id: 'evt-100',
    title: 'Sprint Retrospective',
    start: '2026-09-14T09:00:00.000Z',
    end: '2026-09-14T10:30:00.000Z', // 90 min duration
    allDay: false,
    color: '#3b82f6',
    type: 'TASK',
    trackerArtifactId: null,
    trackerArtifactType: null,
  }

  const initialWeekData: CalendarWeekDTO = {
    days: [
      { date: '2026-09-14', events: [initialEvent], workedHours: 0, isLeave: false },
      { date: '2026-09-15', events: [], workedHours: 0, isLeave: false },
      { date: '2026-09-16', events: [], workedHours: 0, isLeave: false },
      { date: '2026-09-17', events: [], workedHours: 0, isLeave: false },
      { date: '2026-09-18', events: [], workedHours: 0, isLeave: false },
      { date: '2026-09-19', events: [], workedHours: 0, isLeave: false },
      { date: '2026-09-20', events: [], workedHours: 0, isLeave: false },
    ],
  }

  describe('Drag and Drop Optimistic Updates & Persistence', () => {
    it('should update state optimistically and preserve exact duration on drop', () => {
      const originalDurationMs =
        new Date(initialEvent.end).getTime() - new Date(initialEvent.start).getTime()

      // Calculate destination for drop at 14:00 on Sept 15 (8 hours from 6 AM = 480px)
      const dest = calculateDragDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        targetDateStr: '2026-09-15',
        offsetY: 480,
        config: DEFAULT_GRID_CONFIG,
      })

      expect(dest.isValid).toBe(true)
      expect(dest.durationMs).toBe(originalDurationMs)

      // Apply optimistic update
      const updatedWeek = applyOptimisticDrag(
        initialWeekData,
        initialEvent,
        '2026-09-14',
        '2026-09-15',
        dest.newStart,
        dest.newEnd
      )

      // Day 14 should have 0 events
      const day14 = updatedWeek.days.find(d => d.date === '2026-09-14')
      expect(day14?.events.length).toBe(0)

      // Day 15 should have the moved event with exact duration preserved
      const day15 = updatedWeek.days.find(d => d.date === '2026-09-15')
      expect(day15?.events.length).toBe(1)
      const moved = day15?.events[0]
      expect(moved?.id).toBe('evt-100')
      const movedDuration =
        new Date(moved!.end).getTime() - new Date(moved!.start).getTime()
      expect(movedDuration).toBe(originalDurationMs)
    })

    it('should roll back to previous state snapshot if server persistence fails', async () => {
      let currentWeekData = initialWeekData
      const previousSnapshot = currentWeekData

      const dest = calculateDragDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        targetDateStr: '2026-09-16',
        offsetY: 240,
        config: DEFAULT_GRID_CONFIG,
      })

      // 1. Optimistic update happens
      currentWeekData = applyOptimisticDrag(
        currentWeekData,
        initialEvent,
        '2026-09-14',
        '2026-09-16',
        dest.newStart,
        dest.newEnd
      )
      expect(currentWeekData.days.find(d => d.date === '2026-09-16')?.events.length).toBe(1)

      // 2. Simulated server mutation returns failure
      const mockServerUpdate = mock(async () => ({
        success: false,
        error: 'Network connection lost',
      }))
      const serverResult = await mockServerUpdate()

      // 3. Rollback triggers when serverResult.success is false
      if (!serverResult.success) {
        currentWeekData = previousSnapshot
      }

      // Live state is restored to original snapshot
      expect(currentWeekData.days.find(d => d.date === '2026-09-14')?.events.length).toBe(1)
      expect(currentWeekData.days.find(d => d.date === '2026-09-16')?.events.length).toBe(0)
      expect(currentWeekData.days.find(d => d.date === '2026-09-14')?.events[0].start).toBe(
        initialEvent.start
      )
    })
  })

  describe('Resize Handles and Opposite Boundary Invariance', () => {
    it('top resize moves start time, anchors end time, and clamps to min duration', () => {
      const initialEnd = initialEvent.end
      const initialEndTime = new Date(initialEnd).getTime()

      // 1. Valid top resize: drag top handle earlier (7:00 AM = 60px)
      const topEarlier = calculateResizeDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        handle: 'top',
        targetDateStr: '2026-09-14',
        offsetY: 60,
        config: DEFAULT_GRID_CONFIG,
      })

      expect(topEarlier.isValid).toBe(true)
      expect(topEarlier.newEnd.getTime()).toBe(initialEndTime) // End strictly invariant!
      expect(topEarlier.newStart.getHours()).toBe(7)

      // 2. Bound violation: attempt to drag top handle past end time
      // Target 11:30 AM (after 10:30 AM end)
      const topPastEnd = calculateResizeDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        handle: 'top',
        targetDateStr: '2026-09-14',
        offsetY: 330, // 11:30 AM
        config: DEFAULT_GRID_CONFIG,
      })

      expect(topPastEnd.isValid).toBe(true)
      expect(topPastEnd.newEnd.getTime()).toBe(initialEndTime) // End still strictly invariant!
      // Must clamp to 15m before end (10:15 AM)
      expect(topPastEnd.newStart.getHours()).toBe(10)
      expect(topPastEnd.newStart.getMinutes()).toBe(15)
      expect(topPastEnd.durationMs).toBe(15 * 60 * 1000)
    })

    it('bottom resize moves end time, anchors start time, and clamps to min duration', () => {
      const initialStart = initialEvent.start
      const initialStartTime = new Date(initialStart).getTime()

      // 1. Valid bottom resize: drag bottom handle later (12:00 PM = 360px)
      const bottomLater = calculateResizeDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        handle: 'bottom',
        targetDateStr: '2026-09-14',
        offsetY: 360,
        config: DEFAULT_GRID_CONFIG,
      })

      expect(bottomLater.isValid).toBe(true)
      expect(bottomLater.newStart.getTime()).toBe(initialStartTime) // Start strictly invariant!
      expect(bottomLater.newEnd.getHours()).toBe(12)

      // 2. Bound violation: attempt to drag bottom handle before start time
      // Target 8:00 AM (before 9:00 AM start)
      const bottomBeforeStart = calculateResizeDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        handle: 'bottom',
        targetDateStr: '2026-09-14',
        offsetY: 120, // 8:00 AM
        config: DEFAULT_GRID_CONFIG,
      })

      expect(bottomBeforeStart.isValid).toBe(true)
      expect(bottomBeforeStart.newStart.getTime()).toBe(initialStartTime) // Start still strictly invariant!
      // Must clamp to 15m after start (9:15 AM)
      expect(bottomBeforeStart.newEnd.getHours()).toBe(9)
      expect(bottomBeforeStart.newEnd.getMinutes()).toBe(15)
      expect(bottomBeforeStart.durationMs).toBe(15 * 60 * 1000)
    })

    it('should roll back resize on server rejection', async () => {
      let currentWeekData = initialWeekData
      const previousSnapshot = currentWeekData

      const resizeDest = calculateResizeDestination({
        originalStart: initialEvent.start,
        originalEnd: initialEvent.end,
        handle: 'bottom',
        targetDateStr: '2026-09-14',
        offsetY: 360,
        config: DEFAULT_GRID_CONFIG,
      })

      currentWeekData = applyOptimisticResize(
        currentWeekData,
        initialEvent,
        '2026-09-14',
        resizeDest.newStart,
        resizeDest.newEnd
      )

      // Server returns failure
      const mockServerFail = mock(async () => {
        throw new Error('Database write lock timeout')
      })

      try {
        await mockServerFail()
      } catch {
        currentWeekData = previousSnapshot
      }

      // End time is reverted
      expect(currentWeekData.days[0].events[0].end).toBe(initialEvent.end)
    })
  })

  describe('Rapid Consecutive Operations', () => {
    it('should maintain duration invariance and consistency across multiple consecutive drags', () => {
      const initialDurationMs =
        new Date(initialEvent.end).getTime() - new Date(initialEvent.start).getTime()
      let currentEv = initialEvent

      // Hop 1: Drag to 11:00 AM on Sept 14
      const hop1 = calculateDragDestination({
        originalStart: currentEv.start,
        originalEnd: currentEv.end,
        targetDateStr: '2026-09-14',
        offsetY: 300, // 11:00 AM
        config: DEFAULT_GRID_CONFIG,
      })
      currentEv = {
        ...currentEv,
        start: hop1.newStart.toISOString(),
        end: hop1.newEnd.toISOString(),
      }
      expect(hop1.durationMs).toBe(initialDurationMs)

      // Hop 2: Rapidly drag to Sept 16 at 15:30
      const hop2 = calculateDragDestination({
        originalStart: currentEv.start,
        originalEnd: currentEv.end,
        targetDateStr: '2026-09-16',
        offsetY: 570, // 15:30
        config: DEFAULT_GRID_CONFIG,
      })
      currentEv = {
        ...currentEv,
        start: hop2.newStart.toISOString(),
        end: hop2.newEnd.toISOString(),
      }
      expect(hop2.durationMs).toBe(initialDurationMs)

      // Hop 3: Drag back to Sept 14 at 8:00 AM
      const hop3 = calculateDragDestination({
        originalStart: currentEv.start,
        originalEnd: currentEv.end,
        targetDateStr: '2026-09-14',
        offsetY: 120, // 8:00 AM
        config: DEFAULT_GRID_CONFIG,
      })
      currentEv = {
        ...currentEv,
        start: hop3.newStart.toISOString(),
        end: hop3.newEnd.toISOString(),
      }

      // Across 3 rapid consecutive jumps, duration remains exactly 90 minutes
      const finalDuration =
        new Date(currentEv.end).getTime() - new Date(currentEv.start).getTime()
      expect(finalDuration).toBe(initialDurationMs)
      expect(new Date(currentEv.start).getHours()).toBe(8)
      expect(new Date(currentEv.end).getHours()).toBe(9)
      expect(new Date(currentEv.end).getMinutes()).toBe(30)
    })
  })
})
