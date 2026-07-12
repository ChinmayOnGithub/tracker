import { expect, test, describe } from "bun:test"
import { 
  getActiveOrNextEvent, 
  getCountdownString, 
  getEventTimeLabel, 
  getDueHabits,
  getTemplateCapabilities,
  generateTimeline,
  Capability
} from "../modules/sync/google-calendar/utils/dashboardHelpers"
import { ParsedCalendarEvent } from "../modules/sync/google-calendar/services/GoogleCalendarService"
import { ActivityTemplate, ActivityLog, RecurrenceAnalysis } from "@/types"

describe("Today Dashboard Helpers & Logic", () => {

  describe("getEventTimeLabel", () => {
    test("should return 'All Day' for all-day events", () => {
      const event: ParsedCalendarEvent = {
        id: "e1",
        summary: "All Day Event",
        start: "2026-07-11",
        end: "2026-07-12",
        isAllDay: true
      }
      expect(getEventTimeLabel(event)).toBe("All Day")
    })

    test("should format start and end times for timed events", () => {
      const event: ParsedCalendarEvent = {
        id: "e2",
        summary: "Timed Event",
        start: "2026-07-11T09:00:00.000Z",
        end: "2026-07-11T10:30:00.000Z",
        isAllDay: false
      }
      const label = getEventTimeLabel(event)
      expect(label).toContain("09:00")
      expect(label).toContain("10:30")
    })
  })

  describe("getActiveOrNextEvent", () => {
    const todayStr = "2026-07-11"
    
    test("should find active event if current time is within event range", () => {
      const currentTime = new Date(`${todayStr}T10:15:00Z`)
      const events: ParsedCalendarEvent[] = [
        { id: "e1", summary: "Event 1", start: `${todayStr}T09:00:00Z`, end: `${todayStr}T10:00:00Z`, isAllDay: false },
        { id: "e2", summary: "Event 2", start: `${todayStr}T10:00:00Z`, end: `${todayStr}T11:00:00Z`, isAllDay: false },
        { id: "e3", summary: "Event 3", start: `${todayStr}T11:00:00Z`, end: `${todayStr}T12:00:00Z`, isAllDay: false }
      ]

      const active = getActiveOrNextEvent(events, currentTime)
      expect(active).not.toBeNull()
      expect(active!.event.id).toBe("e2")
      expect(active!.isActive).toBe(true)
    })

    test("should find next upcoming event if no event is active", () => {
      const currentTime = new Date(`${todayStr}T10:15:00Z`)
      const events: ParsedCalendarEvent[] = [
        { id: "e1", summary: "Event 1", start: `${todayStr}T09:00:00Z`, end: `${todayStr}T10:00:00Z`, isAllDay: false },
        { id: "e3", summary: "Event 3", start: `${todayStr}T11:00:00Z`, end: `${todayStr}T12:00:00Z`, isAllDay: false }
      ]

      const active = getActiveOrNextEvent(events, currentTime)
      expect(active).not.toBeNull()
      expect(active!.event.id).toBe("e3")
      expect(active!.isActive).toBe(false)
    })

    test("should return null if all events are in the past", () => {
      const currentTime = new Date(`${todayStr}T13:00:00Z`)
      const events: ParsedCalendarEvent[] = [
        { id: "e1", summary: "Event 1", start: `${todayStr}T09:00:00Z`, end: `${todayStr}T10:00:00Z`, isAllDay: false },
        { id: "e2", summary: "Event 2", start: `${todayStr}T11:00:00Z`, end: `${todayStr}T12:00:00Z`, isAllDay: false }
      ]

      const active = getActiveOrNextEvent(events, currentTime)
      expect(active).toBeNull()
    })
  })

  describe("getCountdownString", () => {
    const baseTime = new Date("2026-07-11T12:00:00Z")

    test("should compute start countdown in minutes", () => {
      const event: ParsedCalendarEvent = {
        id: "e1",
        summary: "Event",
        start: "2026-07-11T12:45:00Z",
        end: "2026-07-11T13:45:00Z",
        isAllDay: false
      }
      expect(getCountdownString(event, false, baseTime)).toBe("Starts in 45m")
    })

    test("should compute start countdown in hours and minutes", () => {
      const event: ParsedCalendarEvent = {
        id: "e1",
        summary: "Event",
        start: "2026-07-11T14:15:00Z",
        end: "2026-07-11T15:15:00Z",
        isAllDay: false
      }
      expect(getCountdownString(event, false, baseTime)).toBe("Starts in 2h 15m")
    })

    test("should compute ends countdown for active event", () => {
      const event: ParsedCalendarEvent = {
        id: "e1",
        summary: "Event",
        start: "2026-07-11T11:30:00Z",
        end: "2026-07-11T12:20:00Z",
        isAllDay: false
      }
      expect(getCountdownString(event, true, baseTime)).toBe("Ends in 20m")
    })

    test("should handle target time in past or equal", () => {
      const event: ParsedCalendarEvent = {
        id: "e1",
        summary: "Event",
        start: "2026-07-11T11:59:00Z",
        end: "2026-07-11T12:59:00Z",
        isAllDay: false
      }
      expect(getCountdownString(event, false, baseTime)).toBe("Starting now")
      expect(getCountdownString(event, true, baseTime)).toBe("Ends in 59m")
    })
  })

  describe("getDueHabits", () => {
    const todayStr = "2026-07-11"

    test("should filter templates due today or overdue", () => {
      const mockTemplates = [
        {
          template: { id: "t1", name: "Due Today", isActive: true, recurrenceType: "daily" } as ActivityTemplate,
          analysis: { nextDueDate: "2026-07-11" } as unknown as RecurrenceAnalysis
        },
        {
          template: { id: "t2", name: "Overdue", isActive: true, recurrenceType: "weekly" } as ActivityTemplate,
          analysis: { nextDueDate: "2026-07-10" } as unknown as RecurrenceAnalysis
        },
        {
          template: { id: "t3", name: "Due Tomorrow", isActive: true, recurrenceType: "daily" } as ActivityTemplate,
          analysis: { nextDueDate: "2026-07-12" } as unknown as RecurrenceAnalysis
        },
        {
          template: { id: "t4", name: "Inactive Template", isActive: false, recurrenceType: "daily" } as ActivityTemplate,
          analysis: { nextDueDate: "2026-07-11" } as unknown as RecurrenceAnalysis
        },
        {
          template: { id: "t5", name: "Milestone", isActive: true, recurrenceType: "milestone" } as ActivityTemplate,
          analysis: { nextDueDate: "2026-07-11" } as unknown as RecurrenceAnalysis
        }
      ]

      const due = getDueHabits(mockTemplates, todayStr)
      expect(due.length).toBe(2)
      expect(due.map(d => d.template.name)).toContain("Due Today")
      expect(due.map(d => d.template.name)).toContain("Overdue")
    })
  })

  describe("getTemplateCapabilities", () => {
    test("should flag completable tasks correctly", () => {
      const template = {
        type: 'WORKOUT',
        estimatedDuration: 45,
        calendarProvider: 'NONE'
      } as ActivityTemplate
      
      const caps = getTemplateCapabilities(template)
      expect(caps).toContain(Capability.COMPLETABLE)
      expect(caps).toContain(Capability.SCHEDULABLE)
      expect(caps).not.toContain(Capability.CALENDAR_SYNC)
    })

    test("meetings should not be completable but location aware", () => {
      const template = {
        type: 'MEETING',
        estimatedDuration: 60,
        calendarProvider: 'GOOGLE'
      } as ActivityTemplate
      
      const caps = getTemplateCapabilities(template)
      expect(caps).not.toContain(Capability.COMPLETABLE)
      expect(caps).toContain(Capability.SCHEDULABLE)
      expect(caps).toContain(Capability.CALENDAR_SYNC)
      expect(caps).toContain(Capability.LOCATION_AWARE)
    })
  })

  describe("generateTimeline", () => {
    const todayStr = "2026-07-11"

    test("should merge google events and local due templates in timeline", () => {
      const mockTemplates = [
        {
          template: { id: "t1", name: "Due Today Habit", isActive: true, recurrenceType: "daily", type: 'WORKOUT', estimatedDuration: 0 } as ActivityTemplate,
          analysis: { nextDueDate: "2026-07-11" } as unknown as RecurrenceAnalysis
        }
      ]
      
      const mockCalendarEvents = [
        { id: "g1", summary: "Google Meeting", start: "2026-07-11T10:00:00Z", end: "2026-07-11T11:00:00Z", isAllDay: false }
      ]

      const mockLogs = [
        { id: "log1", activityId: "t1", date: todayStr, status: "done" } as unknown as ActivityLog
      ]

      const timeline = generateTimeline(mockTemplates, mockLogs, todayStr, mockCalendarEvents)
      expect(timeline.length).toBe(2)
      
      // Meetings (timed) should be sorted first, local habits (untimed/all-day) second
      expect(timeline[0].templateName).toBe("Google Meeting")
      expect(timeline[0].type).toBe("MEETING")
      expect(timeline[0].completed).toBe(true) // Ended in past relative to execution now
      
      expect(timeline[1].templateName).toBe("Due Today Habit")
      expect(timeline[1].type).toBe("WORKOUT")
      expect(timeline[1].completed).toBe(true) // Checked via logs
    })
  })
})

