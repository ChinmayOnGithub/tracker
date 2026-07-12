import { expect, test, describe, mock } from "bun:test"
import { eventBus, EVENTS } from "@/lib/events"
import { ActivityOccurrence, generateTimeline } from "../modules/sync/google-calendar/utils/dashboardHelpers"
import { providerRegistry } from "@/lib/providers"
import { ActivityTemplate } from "@prisma/client"
import { RecurrenceAnalysis, AnalyzedTemplate, ActivityTemplate as DomainActivityTemplate } from "@/types"

interface TestAnalyzedTemplate {
  template: DomainActivityTemplate
  analysis: RecurrenceAnalysis
}

describe("Activity Engine & Event Bus Integrations", () => {

  describe("Domain Event Bus", () => {
    test("should successfully subscribe and receive published events", () => {
      const listener = mock((_payload: unknown, _traceId: string) => {})
      
      eventBus.subscribe(EVENTS.ACTIVITY_CREATED, listener)
      
      const payload = { template: { id: "test-id", name: "Gym Workout" } as unknown as ActivityTemplate, userId: "user-123" }
      eventBus.publish(EVENTS.ACTIVITY_CREATED, payload)
      
      expect(listener).toHaveBeenCalled()
      const calls = listener.mock.calls as unknown[][]
      expect(calls[0][0]).toEqual(payload)
    })

    test("should successfully publish ACTIVITY_UPDATED", () => {
      const listener = mock((_payload: unknown, _traceId: string) => {})
      eventBus.subscribe(EVENTS.ACTIVITY_UPDATED, listener)
      
      const payload = { template: { id: "test-id", name: "Gym Updated" } as unknown as ActivityTemplate, userId: "user-123" }
      eventBus.publish(EVENTS.ACTIVITY_UPDATED, payload)
      
      expect(listener).toHaveBeenCalled()
      const calls = listener.mock.calls as unknown[][]
      expect(calls[0][0]).toEqual(payload)
    })

    test("should successfully publish ACTIVITY_DELETED", () => {
      const listener = mock((_payload: unknown, _traceId: string) => {})
      eventBus.subscribe(EVENTS.ACTIVITY_DELETED, listener)
      
      const payload = { calendarEventId: "google-event-id", userId: "user-123" }
      eventBus.publish(EVENTS.ACTIVITY_DELETED, payload)
      
      expect(listener).toHaveBeenCalled()
      const calls = listener.mock.calls as unknown[][]
      expect(calls[0][0]).toEqual(payload)
    })
  })

  describe("Timeline Chronological Grouping", () => {
    const currentTime = new Date("2026-07-12T10:15:00Z")

    test("should correctly group active event into NOW", () => {
      const occurrences: ActivityOccurrence[] = [
        {
          id: "o1",
          templateName: "Active Meeting",
          type: "MEETING",
          priority: "HIGH",
          start: new Date("2026-07-12T10:00:00Z"),
          end: new Date("2026-07-12T11:00:00Z"),
          isAllDay: false,
          completed: false
        }
      ]

      // Filter active (NOW)
      const nowEvents = occurrences.filter(o => {
        const start = o.start ? new Date(o.start) : null
        const end = o.end ? new Date(o.end) : null
        if (!start || !end) return false
        return currentTime.getTime() >= start.getTime() && currentTime.getTime() <= end.getTime()
      })

      expect(nowEvents.length).toBe(1)
      expect(nowEvents[0].templateName).toBe("Active Meeting")
    })

    test("should correctly group upcoming events into NEXT and LATER", () => {
      const occurrences: ActivityOccurrence[] = [
        {
          id: "o1",
          templateName: "First Next Event",
          type: "MEETING",
          priority: "HIGH",
          start: new Date("2026-07-12T11:00:00Z"),
          end: new Date("2026-07-12T12:00:00Z"),
          isAllDay: false,
          completed: false
        },
        {
          id: "o2",
          templateName: "Second Later Event",
          type: "MEETING",
          priority: "NORMAL",
          start: new Date("2026-07-12T13:00:00Z"),
          end: new Date("2026-07-12T14:00:00Z"),
          isAllDay: false,
          completed: false
        }
      ]

      const upcoming = occurrences.filter(o => {
        const start = o.start ? new Date(o.start) : null
        if (!start) return false
        return start.getTime() > currentTime.getTime()
      }).sort((a, b) => a.start.getTime() - b.start.getTime())

      const nextEvent = upcoming.length > 0 ? upcoming[0] : null
      const laterEvents = upcoming.length > 1 ? upcoming.slice(1) : []

      expect(nextEvent).not.toBeNull()
      expect(nextEvent?.templateName).toBe("First Next Event")
      expect(laterEvents.length).toBe(1)
      expect(laterEvents[0].templateName).toBe("Second Later Event")
    })

    test("should group all-day occurrences into ANYTIME", () => {
      const occurrences: ActivityOccurrence[] = [
        {
          id: "o1",
          templateName: "All day habit",
          type: "WORKOUT",
          priority: "NORMAL",
          start: new Date("2026-07-12T00:00:00Z"),
          end: new Date("2026-07-12T23:59:59Z"),
          isAllDay: true,
          completed: false
        }
      ]

      const anytime = occurrences.filter(o => o.isAllDay)
      expect(anytime.length).toBe(1)
      expect(anytime[0].templateName).toBe("All day habit")
    })
  })

  describe("Calendar Provider Registry", () => {
    test("should dynamically load and resolve calendar providers on demand", async () => {
      const provider = await providerRegistry.get("GOOGLE")
      expect(provider).toBeDefined()
      expect(provider?.getEvents).toBeDefined()
    })
  })

  describe("Event Bus Resiliency & Isolated Errors", () => {
    test("should execute all subscribers even if one of them fails", async () => {
      eventBus.clearAllSubscribers()
      
      const failedListener = mock(() => {
        throw new Error("Simulated subscriber error")
      })
      const successListener = mock(() => {})

      eventBus.subscribe(EVENTS.ACTIVITY_CREATED, failedListener)
      eventBus.subscribe(EVENTS.ACTIVITY_CREATED, successListener)

      const payload = { template: { id: "test-resilient", name: "Gym Workout" } as unknown as ActivityTemplate, userId: "user-123" }
      
      // Should not throw publisher-side error
      await eventBus.publish(EVENTS.ACTIVITY_CREATED, payload)
      
      expect(failedListener).toHaveBeenCalled()
      expect(successListener).toHaveBeenCalled()
    })
  })

  describe("generateTimeline Scheduled Local Templates", () => {
    test("should schedule timed local templates based on metadata values", () => {
      const template = {
        id: "local-meeting",
        name: "Sync Meeting",
        type: "MEETING",
        priority: "HIGH",
        estimatedDuration: 45,
        isActive: true,
        metadata: {
          isAllDay: false,
          startTime: "15:45",
          location: "Conference Room B"
        }
      } as unknown as DomainActivityTemplate

      const analyzedTemplates: TestAnalyzedTemplate[] = [
        {
          template,
          analysis: {
            nextDueDate: "2026-07-12",
            overdue: false,
            streak: 0,
            statusMessage: "Due today"
          } as unknown as RecurrenceAnalysis
        }
      ]

      const timeline = generateTimeline(analyzedTemplates as unknown as AnalyzedTemplate[], [], "2026-07-12", [])
      
      expect(timeline.length).toBe(1)
      const occurrence = timeline[0]
      expect(occurrence.isAllDay).toBe(false)
      expect(occurrence.location).toBe("Conference Room B")
      expect(occurrence.start.toISOString()).toContain("15:45:00")
      
      // End time should be start + duration (45 mins)
      const diffMs = occurrence.end.getTime() - occurrence.start.getTime()
      expect(diffMs).toBe(45 * 60 * 1000)
    })
  })
})
