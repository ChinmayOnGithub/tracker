/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test"
import { getAgendaAction } from "../modules/sync/google-calendar/actions"
import { GoogleCredentialService } from "../modules/sync/google-calendar/services/GoogleCredentialService"
import { GoogleCalendarService, ParsedCalendarEvent } from "../modules/sync/google-calendar/services/GoogleCalendarService"

// Mock the auth module since it has read-only ESM exports
mock.module("../app/actions/auth", () => ({
  getLoggedUser: () => Promise.resolve({ id: "test-user-999", username: "testadmin" })
}))

describe("Google Calendar Agenda Actions", () => {
  let originalIsConnected: any
  let originalGetEvents: any
  let originalClearCache: any

  beforeEach(() => {
    // Save original methods
    originalIsConnected = GoogleCredentialService.isConnected
    originalGetEvents = GoogleCalendarService.getEvents
    originalClearCache = GoogleCalendarService.clearCache
  })

  afterEach(() => {
    // Restore original methods
    GoogleCredentialService.isConnected = originalIsConnected
    GoogleCalendarService.getEvents = originalGetEvents
    GoogleCalendarService.clearCache = originalClearCache
  })

  test("should return connected: false when user has not connected Google Calendar", async () => {
    GoogleCredentialService.isConnected = async () => false

    const res = await getAgendaAction("2026-07-11") as any
    expect(res.success).toBe(true)
    expect(res.connected).toBe(false)
    expect(res.agenda).toBeNull()
  })

  test("should correctly bucket events into today, tomorrow, and upcoming", async () => {
    GoogleCredentialService.isConnected = async () => true

    const todayStr = "2026-07-11"
    const tomorrowStr = "2026-07-12"
    const upcomingStr = "2026-07-15"

    const mockEvents: ParsedCalendarEvent[] = [
      { id: "e1", summary: "Today Event 1", start: `${todayStr}T10:00:00Z`, end: `${todayStr}T11:00:00Z`, isAllDay: false },
      { id: "e2", summary: "Today Event 2 (All Day)", start: todayStr, end: tomorrowStr, isAllDay: true },
      { id: "e3", summary: "Tomorrow Event", start: `${tomorrowStr}T09:00:00Z`, end: `${tomorrowStr}T10:00:00Z`, isAllDay: false },
      { id: "e4", summary: "Upcoming Event", start: `${upcomingStr}T14:00:00Z`, end: `${upcomingStr}T15:00:00Z`, isAllDay: false }
    ]

    GoogleCalendarService.getEvents = async () => mockEvents

    const res = await getAgendaAction(todayStr) as any
    expect(res.success).toBe(true)
    expect(res.connected).toBe(true)
    expect(res.agenda).toBeDefined()
    
    const agenda = res.agenda!
    expect(agenda.today.length).toBe(2)
    expect(agenda.today[0].id).toBe("e1")
    expect(agenda.today[1].id).toBe("e2")

    expect(agenda.tomorrow.length).toBe(1)
    expect(agenda.tomorrow[0].id).toBe("e3")

    expect(agenda.upcoming.length).toBe(1)
    expect(agenda.upcoming[0].id).toBe("e4")
  })

  test("should clear cache when forceRefresh is requested", async () => {
    GoogleCredentialService.isConnected = async () => true
    GoogleCalendarService.getEvents = async () => []
    
    let clearCacheCalled = false
    GoogleCalendarService.clearCache = () => {
      clearCacheCalled = true
    }

    const res = await getAgendaAction("2026-07-11", true)
    expect(res.success).toBe(true)
    expect(clearCacheCalled).toBe(true)
  })
})
