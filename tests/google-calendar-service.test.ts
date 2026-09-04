/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, describe, mock, beforeEach, afterEach } from "bun:test"
import { GoogleCalendarService } from "../modules/sync/google-calendar/services/GoogleCalendarService"
import { GoogleCredentialService } from "../modules/sync/google-calendar/services/GoogleCredentialService"
import { db } from "../lib/db"

describe("GoogleCalendarService", () => {
  const userId = "test-user-123"
  const timeMin = new Date("2026-07-11T00:00:00Z")
  const timeMax = new Date("2026-07-12T00:00:00Z")

  // Backup originals
  const originalFetch = globalThis.fetch
  const originalGetRefreshToken = GoogleCredentialService.getRefreshToken
  const originalDisconnect = GoogleCredentialService.disconnect
  const originalSaveCredentials = GoogleCredentialService.saveCredentials
  const originalDbUpdate = db.googleCredential.update
  const originalDbFindUnique = db.googleCredential.findUnique

  beforeEach(() => {
    // Clear caches before each test (including access token cache)
    GoogleCalendarService.clearCache(userId, true)
    
    // Default db mock
    db.googleCredential.update = (async () => ({})) as any
    db.googleCredential.findUnique = (async () => ({ calendarId: 'primary' })) as any
  })

  afterEach(() => {
    // Restore originals
    globalThis.fetch = originalFetch
    GoogleCredentialService.getRefreshToken = originalGetRefreshToken
    GoogleCredentialService.disconnect = originalDisconnect
    GoogleCredentialService.saveCredentials = originalSaveCredentials
    db.googleCredential.update = originalDbUpdate
    db.googleCredential.findUnique = originalDbFindUnique
  })

  test("should refresh access token successfully and cache it", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"

    let refreshCalls = 0
    let eventsCalls = 0

    globalThis.fetch = mock((url, _options) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        refreshCalls++
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        eventsCalls++
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            {
              id: "event-1",
              summary: "Test Event",
              start: { dateTime: "2026-07-11T10:00:00Z" },
              end: { dateTime: "2026-07-11T11:00:00Z" }
            }
          ]
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL: " + urlStr))
    }) as any

    // Fetch events (triggers token refresh)
    const events1 = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(events1.length).toBe(1)
    expect(events1[0].summary).toBe("Test Event")
    expect(refreshCalls).toBe(1)
    expect(eventsCalls).toBe(1)

    // Fetch events again (should use cached access token and cached calendar events)
    const events2 = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(events2.length).toBe(1)
    expect(refreshCalls).toBe(1) // No new refresh
    expect(eventsCalls).toBe(1) // No new events request
  })

  test("should handle invalid_grant and auto-disconnect the credentials", async () => {
    GoogleCredentialService.getRefreshToken = async () => "revoked-refresh-token"
    
    let disconnectCalled = false
    GoogleCredentialService.disconnect = async () => {
      disconnectCalled = true
      return true
    }

    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          error: "invalid_grant",
          error_description: "Token has been expired or revoked."
        }), { status: 400 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    // Assert that getEvents throws a GoogleApiError
    await expect(GoogleCalendarService.getEvents(userId, timeMin, timeMax)).rejects.toThrow()
    expect(disconnectCalled).toBe(true)
  })

  test("should retry on 429 rate limit using exponential backoff", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"

    let fetchAttempts = 0
    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        fetchAttempts++
        if (fetchAttempts === 1) {
          // Rate limited, retry after 0 seconds (for test speed)
          return Promise.resolve(new Response("Rate Limit Exceeded", {
            status: 429,
            headers: { "Retry-After": "0" }
          }))
        }
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ id: "e1", start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }]
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    const events = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(events.length).toBe(1)
    expect(fetchAttempts).toBe(2) // Retried once and succeeded
  })

  test("should parse all-day events correctly and default missing summaries", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"

    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [
            {
              id: "all-day-1",
              start: { date: "2026-07-11" },
              end: { date: "2026-07-12" }
              // Missing summary field
            }
          ]
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    const events = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(events.length).toBe(1)
    expect(events[0].isAllDay).toBe(true)
    expect(events[0].summary).toBe("Untitled Event")
    expect(events[0].start).toBe("2026-07-11")
    expect(events[0].end).toBe("2026-07-12")
  })

  test("should create a Google Calendar event successfully and invalidate cache", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"
    
    let postBody: any = null
    globalThis.fetch = mock((url, options: any) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: "mock-access" }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        postBody = JSON.parse(options.body)
        return Promise.resolve(new Response(JSON.stringify({
          id: "new-event-777",
          summary: postBody.summary,
          start: postBody.start,
          end: postBody.end,
          location: postBody.location
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    const newEventInput = {
      summary: "New Test Event",
      description: "Description",
      start: { dateTime: "2026-07-11T12:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2026-07-11T13:00:00Z", timeZone: "UTC" },
      isAllDay: false,
      location: "Virtual"
    }

    const created = await GoogleCalendarService.createEvent(userId, newEventInput)
    expect(created.id).toBe("new-event-777")
    expect(created.summary).toBe("New Test Event")
    expect(postBody.summary).toBe("New Test Event")
    expect(postBody.location).toBe("Virtual")
  })

  test("should fail creation if payload is invalid (end date before start date)", async () => {
    const invalidInput = {
      summary: "Invalid Event",
      start: { dateTime: "2026-07-11T15:00:00Z" },
      end: { dateTime: "2026-07-11T14:00:00Z" }, // End before start
      isAllDay: false
    }

    expect(GoogleCalendarService.createEvent(userId, invalidInput)).rejects.toThrow()
  })

  test("should update Google Calendar event and handle partial changes", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"
    
    let patchBody: any = null
    globalThis.fetch = mock((url, options: any) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: "mock-access" }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events/existing-id")) {
        patchBody = JSON.parse(options.body)
        return Promise.resolve(new Response(JSON.stringify({
          id: "existing-id",
          summary: patchBody.summary || "Old Summary",
          start: { dateTime: "2026-07-11T10:00:00Z" },
          end: { dateTime: "2026-07-11T11:00:00Z" }
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    const updated = await GoogleCalendarService.updateEvent(userId, "existing-id", { summary: "Updated Summary" })
    expect(updated.id).toBe("existing-id")
    expect(updated.summary).toBe("Updated Summary")
    expect(patchBody.summary).toBe("Updated Summary")
    expect(patchBody.description).toBeUndefined() // Unchanged field preserved
  })

  test("should throw an error if updating an event that was deleted externally", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"
    
    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: "mock-access" }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events/deleted-id")) {
        return Promise.resolve(new Response("Not Found", { status: 404 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    expect(GoogleCalendarService.updateEvent(userId, "deleted-id", { summary: "Lost Summary" })).rejects.toThrow()
  })

  test("should delete Google Calendar event and handle external deletion gracefully", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"
    
    let deleteCalls = 0
    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: "mock-access" }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events/delete-id")) {
        deleteCalls++
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events/already-deleted-id")) {
        return Promise.resolve(new Response("Gone", { status: 410 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    // Deleting active event
    const deleted1 = await GoogleCalendarService.deleteEvent(userId, "delete-id")
    expect(deleted1).toBe(true)
    expect(deleteCalls).toBe(1)

    // Deleting already deleted event (idempotency check)
    const deleted2 = await GoogleCalendarService.deleteEvent(userId, "already-deleted-id")
    expect(deleted2).toBe(true) // Recovers gracefully
  })

  test("should handle 401 Unauthorized by refreshing token and retrying request exactly once", async () => {
    let refreshCount = 0
    GoogleCredentialService.getRefreshToken = async () => {
      refreshCount++
      return "mock-refresh-token"
    }

    let requestAttempts = 0
    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: `refreshed-access-token-${refreshCount}`,
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        requestAttempts++
        if (requestAttempts === 1) {
          // First attempt returns 401
          return Promise.resolve(new Response("Unauthorized", { status: 401 }))
        }
        // Second attempt after refresh succeeds
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ id: "retry-event-1", summary: "401 Recovered Event", start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }]
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    const events = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(events.length).toBe(1)
    expect(events[0].summary).toBe("401 Recovered Event")
    expect(requestAttempts).toBe(2) // Retried once and succeeded
  })

  test("should paginate multiple pages using nextPageToken and combine all items", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"

    let pageCalls = 0
    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        pageCalls++
        if (pageCalls === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            items: [{ id: "p1-1", summary: "Page 1 Event", start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }],
            nextPageToken: "token-for-page-2"
          }), { status: 200 }))
        }
        if (pageCalls === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            items: [{ id: "p2-1", summary: "Page 2 Event", start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }],
            nextPageToken: "token-for-page-3"
          }), { status: 200 }))
        }
        if (pageCalls === 3) {
          return Promise.resolve(new Response(JSON.stringify({
            items: [{ id: "p3-1", summary: "Page 3 Event", start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }]
            // No nextPageToken - finished
          }), { status: 200 }))
        }
      }
      return Promise.reject(new Error("Unknown URL: " + urlStr))
    }) as any

    const events = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(events.length).toBe(3)
    expect(events.map(e => e.id)).toEqual(["p1-1", "p2-1", "p3-1"])
    expect(pageCalls).toBe(3)
  })

  test("should hit defensive pagination limit and fail cleanly on infinite nextPageToken loops", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"

    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ id: `loop-item`, summary: "Loop Event", start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }],
          nextPageToken: "infinite-loop-token"
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    expect(GoogleCalendarService.getEvents(userId, timeMin, timeMax)).rejects.toThrow(/Defensive maximum pagination page limit/)
  })

  test("should preserve access token in cache when clearing event cache", async () => {
    GoogleCredentialService.getRefreshToken = async () => "mock-refresh-token"
    let tokenRefreshes = 0
    let eventRequests = 0

    globalThis.fetch = mock((url) => {
      const urlStr = String(url)
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        tokenRefreshes++
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600
        }), { status: 200 }))
      }
      if (urlStr.includes("googleapis.com/calendar/v3/calendars/primary/events")) {
        eventRequests++
        return Promise.resolve(new Response(JSON.stringify({
          items: [{ id: `evt-${eventRequests}`, summary: `Event Gen ${eventRequests}`, start: { date: "2026-07-11" }, end: { date: "2026-07-12" } }]
        }), { status: 200 }))
      }
      return Promise.reject(new Error("Unknown URL"))
    }) as any

    // Initial fetch
    const firstEvents = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(firstEvents.length).toBe(1)
    expect(tokenRefreshes).toBe(1)
    expect(eventRequests).toBe(1)

    // Clear event cache (normal mutation path)
    GoogleCalendarService.clearCache(userId)

    // Second fetch should query Google API with the ALREADY cached access token
    const secondEvents = await GoogleCalendarService.getEvents(userId, timeMin, timeMax)
    expect(secondEvents.length).toBe(1)
    expect(tokenRefreshes).toBe(1) // Token was NOT refreshed again
    expect(eventRequests).toBe(2) // Events were refetched
  })
})
