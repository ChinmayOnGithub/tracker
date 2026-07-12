import { GoogleCredentialService } from './GoogleCredentialService'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { CACHE_TTL, GOOGLE_OAUTH } from '@/lib/constants'
import { GoogleApiError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export interface ParsedCalendarEvent {
  id: string
  summary: string
  start: string // Date or DateTime ISO string
  end: string
  isAllDay: boolean
  location?: string
  htmlLink?: string
  description?: string
}

export interface CalendarEventInput {
  summary: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  isAllDay: boolean
  location?: string
  recurrence?: string[]
}

interface GoogleCalendarEventPayload {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location?: string
  htmlLink?: string
  description?: string
}

interface CacheEntry {
  events: ParsedCalendarEvent[]
  expiresAt: number
}

interface AccessTokenCacheEntry {
  token: string
  expiresAt: number // Timestamp in ms
}

// In-memory caching maps
const calendarCache = new Map<string, CacheEntry>()
const accessTokenCache = new Map<string, AccessTokenCacheEntry>()

/**
 * Exponential backoff helper for network requests.
 * Respects Retry-After header from Google's API.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  try {
    const startTime = Date.now()
    const res = await fetch(url, options)
    const elapsed = Date.now() - startTime

    logger.debug('GoogleCalendarApi', 'HTTP request completed', {
      url: url.split('?')[0], // Log URL path without query params
      status: res.status,
      elapsed: `${elapsed}ms`,
      retriesRemaining: retries
    })

    // Handle rate-limiting (429) or transient server errors (5xx)
    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      // Respect Retry-After header if present
      const retryAfterHeader = res.headers.get('Retry-After')
      let retryDelay = delay

      if (retryAfterHeader) {
        const retryAfterSeconds = parseInt(retryAfterHeader, 10)
        if (!isNaN(retryAfterSeconds)) {
          retryDelay = retryAfterSeconds * 1000
          logger.debug('GoogleCalendarApi', `Respecting Retry-After header: ${retryAfterSeconds}s`)
        }
      }

      logger.warn('GoogleCalendarApi', `Transient API error ${res.status}. Retrying in ${retryDelay}ms...`, {
        retriesRemaining: retries,
        retryDelay
      })
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return fetchWithRetry(url, options, retries - 1, delay * 2)
    }

    return res
  } catch (error) {
    if (retries > 0) {
      logger.warn('GoogleCalendarApi', `Network error. Retrying in ${delay}ms...`, {
        error: error instanceof Error ? error.message : String(error),
        retriesRemaining: retries
      })
      await new Promise(resolve => setTimeout(resolve, delay))
      return fetchWithRetry(url, options, retries - 1, delay * 2)
    }
    throw error
  }
}

export class GoogleCalendarService {
  /**
   * Refreshes and returns a temporary access token from Google.
   * Caches access tokens in-memory until they approach expiry.
   */
  private static async getAccessToken(userId: string): Promise<string> {
    const cachedToken = accessTokenCache.get(userId)

    // If cache is valid and not close to expiry, reuse it
    if (cachedToken && cachedToken.expiresAt - Date.now() > CACHE_TTL.ACCESS_TOKEN_THRESHOLD_MS) {
      const ttlRemaining = Math.round((cachedToken.expiresAt - Date.now()) / 1000)
      logger.debug('GoogleCalendarService', 'Using cached access token', {
        userId,
        ttlRemainingSeconds: ttlRemaining
      })
      return cachedToken.token
    }

    logger.debug('GoogleCalendarService', 'Refreshing access token', { userId })

    const refreshToken = await GoogleCredentialService.getRefreshToken(userId)
    if (!refreshToken) {
      throw new GoogleApiError('Google Calendar integration credentials missing', 401)
    }

    const clientId = env.GOOGLE_CLIENT_ID
    const clientSecret = env.GOOGLE_CLIENT_SECRET

    const tokenResponse = await fetchWithRetry(GOOGLE_OAUTH.TOKEN_URI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      logger.error('GoogleCalendarService', 'Token refresh failed', {
        userId,
        status: tokenResponse.status,
        error: errText.substring(0, 500)
      })

      // Detect revoked access — auto-disconnect stale credentials
      let errorCode = ''
      try {
        const parsed = JSON.parse(errText)
        errorCode = parsed.error || ''
      } catch { /* ignore */ }

      if (errorCode === 'invalid_grant') {
        logger.warn('GoogleCalendarService', 'Refresh token has been revoked or is invalid — auto-disconnecting', { userId })
        await GoogleCredentialService.disconnect(userId)
        throw new GoogleApiError('Google access has been revoked. Please reconnect your account in Settings.', 401)
      }

      throw new GoogleApiError(`Failed to refresh Google access token: ${errText}`, tokenResponse.status)
    }

    const data = await tokenResponse.json()
    const accessToken = data.access_token
    const expiresInSeconds = data.expires_in ?? 3600

    if (!accessToken) {
      logger.error('GoogleCalendarService', 'Token refresh response missing access_token', { userId })
      throw new GoogleApiError('Google token refresh response did not contain an access token')
    }

    // Handle Google's optional refresh token rotation
    if (data.refresh_token) {
      logger.info('GoogleCalendarService', 'Google issued a new refresh token — updating stored credential', { userId })
      await GoogleCredentialService.saveCredentials(userId, data.refresh_token)
    }

    // Store in-memory access token cache
    accessTokenCache.set(userId, {
      token: accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000
    })

    logger.info('GoogleCalendarService', 'Access token refreshed successfully', {
      userId,
      expiresInSeconds,
      tokenLength: accessToken.length
    })

    return accessToken
  }

  /**
   * Retrieves user schedule events from primary calendar between timeMin and timeMax.
   * Leverages caching and auto-expands recurring events.
   */
  static async getEvents(
    userId: string,
    timeMin: Date,
    timeMax: Date,
    forceRefresh = false
  ): Promise<ParsedCalendarEvent[]> {
    const cacheKey = `${userId}:${timeMin.getTime()}:${timeMax.getTime()}`

    if (!forceRefresh) {
      const cached = calendarCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        const ttlRemaining = Math.round((cached.expiresAt - Date.now()) / 1000)
        logger.debug('GoogleCalendarService', 'Cache HIT', {
          userId,
          cacheKey,
          eventCount: cached.events.length,
          ttlRemainingSeconds: ttlRemaining
        })
        return cached.events
      }
      logger.debug('GoogleCalendarService', 'Cache MISS', { userId, cacheKey })
    } else {
      logger.debug('GoogleCalendarService', 'Force refresh — skipping cache', { userId })
    }

    try {
      const accessToken = await this.getAccessToken(userId)

      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('timeMin', timeMin.toISOString())
      url.searchParams.set('timeMax', timeMax.toISOString())
      url.searchParams.set('singleEvents', 'true') // Expand recurring events
      url.searchParams.set('orderBy', 'startTime')

      logger.debug('GoogleCalendarService', 'Fetching calendar events', {
        userId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString()
      })

      const response = await fetchWithRetry(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        const errText = await response.text()
        logger.error('GoogleCalendarService', 'Calendar events fetch failed', {
          userId,
          status: response.status,
          error: errText.substring(0, 500)
        })

        // If 401, the access token may be stale — clear it and try again
        if (response.status === 401) {
          accessTokenCache.delete(userId)
          logger.warn('GoogleCalendarService', 'Access token rejected — clearing cache. Will retry on next request.', { userId })
        }

        throw new GoogleApiError(`Failed to fetch Google Calendar events: ${errText}`, response.status)
      }

      const data = await response.json()
      const items = data.items || []

      const parsedEvents: ParsedCalendarEvent[] = items.map((item: GoogleCalendarEventPayload) => {
        const isAllDay = !item.start.dateTime
        return {
          id: item.id,
          summary: item.summary || 'Untitled Event',
          start: (isAllDay ? item.start.date : item.start.dateTime) || '',
          end: (isAllDay ? item.end.date : item.end.dateTime) || '',
          isAllDay,
          location: item.location,
          htmlLink: item.htmlLink,
          description: item.description
        }
      })

      logger.info('GoogleCalendarService', 'Calendar events fetched and parsed', {
        userId,
        totalEvents: parsedEvents.length,
        allDayEvents: parsedEvents.filter(e => e.isAllDay).length,
        timedEvents: parsedEvents.filter(e => !e.isAllDay).length
      })

      // Update cache
      calendarCache.set(cacheKey, {
        events: parsedEvents,
        expiresAt: Date.now() + CACHE_TTL.CALENDAR_EVENTS_MS,
      })

      // Update lastSync timestamp on the GoogleCredential record
      await db.googleCredential.update({
        where: { userId },
        data: { updatedAt: new Date() }
      }).catch(err => {
        logger.error('GoogleCalendarService', 'Failed to update sync timestamp', err)
      })

      return parsedEvents
    } catch (error) {
      logger.error('GoogleCalendarService', 'Error fetching calendar events', error)
      throw error
    }
  }

  /**
   * Clears cached events for a user.
   */
  static clearCache(userId: string) {
    let cleared = 0
    for (const key of calendarCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        calendarCache.delete(key)
        cleared++
      }
    }
    // Also clear access token cache
    if (accessTokenCache.has(userId)) {
      accessTokenCache.delete(userId)
      cleared++
    }
    logger.debug('GoogleCalendarService', 'Cache cleared', { userId, entriesCleared: cleared })
  }

  /**
   * Validates calendar event input payload.
   */
  static validateEventInput(event: Partial<CalendarEventInput>, isUpdate = false) {
    if (!isUpdate && (!event.summary || event.summary.trim() === '')) {
      throw new Error('Event summary (title) is required')
    }
    if (event.summary && event.summary.length > 255) {
      throw new Error('Event summary must not exceed 255 characters')
    }
    
    const start = event.start
    const end = event.end
    
    if (start && end) {
      if (event.isAllDay) {
        if (!start.date || !end.date) {
          throw new Error('All-day event requires start.date and end.date')
        }
        if (new Date(start.date) > new Date(end.date)) {
          throw new Error('Start date must be before or equal to end date')
        }
      } else {
        if (!start.dateTime || !end.dateTime) {
          throw new Error('Timed event requires start.dateTime and end.dateTime')
        }
        if (new Date(start.dateTime) >= new Date(end.dateTime)) {
          throw new Error('Start time must be before end time')
        }
      }
    }
  }

  /**
   * Creates a new event in the user's primary calendar.
   */
  static async createEvent(
    userId: string,
    event: CalendarEventInput
  ): Promise<ParsedCalendarEvent> {
    this.validateEventInput(event)
    
    const accessToken = await this.getAccessToken(userId)
    
    const body = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.isAllDay 
        ? { date: event.start.date }
        : { dateTime: event.start.dateTime, timeZone: event.start.timeZone },
      end: event.isAllDay
        ? { date: event.end.date }
        : { dateTime: event.end.dateTime, timeZone: event.end.timeZone },
      recurrence: event.recurrence
    }
    
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    if (!res.ok) {
      const errText = await res.text()
      logger.error('GoogleCalendarService', 'Failed to create Google Calendar event', { errText })
      throw new GoogleApiError(`Failed to create Google Calendar event: ${errText}`, res.status)
    }
    
    const data = await res.json()
    
    // Invalidate local cache
    this.clearCache(userId)
    
    const isAllDay = !data.start.dateTime
    return {
      id: data.id,
      summary: data.summary || 'Untitled Event',
      start: (isAllDay ? data.start.date : data.start.dateTime) || '',
      end: (isAllDay ? data.end.date : data.end.dateTime) || '',
      isAllDay,
      location: data.location,
      htmlLink: data.htmlLink,
      description: data.description
    }
  }

  /**
   * Updates an existing event in the user's primary calendar. Supports partial updates.
   */
  static async updateEvent(
    userId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<ParsedCalendarEvent> {
    this.validateEventInput(event, true)
    
    const accessToken = await this.getAccessToken(userId)
    
    const body: Record<string, unknown> = {}
    if (event.summary !== undefined) body.summary = event.summary
    if (event.description !== undefined) body.description = event.description
    if (event.location !== undefined) body.location = event.location
    if (event.recurrence !== undefined) body.recurrence = event.recurrence
    
    if (event.start && event.end) {
      body.start = event.isAllDay 
        ? { date: event.start.date }
        : { dateTime: event.start.dateTime, timeZone: event.start.timeZone }
      body.end = event.isAllDay
        ? { date: event.end.date }
        : { dateTime: event.end.dateTime, timeZone: event.end.timeZone }
    }
    
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    const res = await fetchWithRetry(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    if (!res.ok) {
      const errText = await res.text()
      logger.error('GoogleCalendarService', 'Failed to update Google Calendar event', { eventId, errText })
      
      if (res.status === 404 || res.status === 410) {
        throw new GoogleApiError('The event has been deleted externally or does not exist.', res.status)
      }
      throw new GoogleApiError(`Failed to update Google Calendar event: ${errText}`, res.status)
    }
    
    const data = await res.json()
    
    // Invalidate local cache
    this.clearCache(userId)
    
    const isAllDay = !data.start.dateTime
    return {
      id: data.id,
      summary: data.summary || 'Untitled Event',
      start: (isAllDay ? data.start.date : data.start.dateTime) || '',
      end: (isAllDay ? data.end.date : data.end.dateTime) || '',
      isAllDay,
      location: data.location,
      htmlLink: data.htmlLink,
      description: data.description
    }
  }

  /**
   * Deletes an event from the user's primary calendar.
   */
  static async deleteEvent(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    const accessToken = await this.getAccessToken(userId)
    
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    const res = await fetchWithRetry(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
    
    // Invalidate cache in all cases (since it's a deletion write)
    this.clearCache(userId)
    
    if (!res.ok) {
      // Gracefully recover if already deleted externally (idempotency)
      if (res.status === 404 || res.status === 410) {
        logger.info('GoogleCalendarService', 'Event already deleted externally', { eventId })
        return true
      }
      
      const errText = await res.text()
      logger.error('GoogleCalendarService', 'Failed to delete Google Calendar event', { eventId, errText })
      throw new GoogleApiError(`Failed to delete Google Calendar event: ${errText}`, res.status)
    }
    
    return true
  }

  /**
   * Diagnostics method for development-only debug views.
   */
  static getDebugDiagnostics() {
    if (process.env.NODE_ENV !== 'development') {
      return null
    }
    return {
      calendarCacheSize: calendarCache.size,
      accessTokenCacheSize: accessTokenCache.size,
      calendarCacheEntries: Array.from(calendarCache.entries()).map(([k, v]) => ({
        key: k,
        expiresAt: new Date(v.expiresAt).toISOString(),
        eventCount: v.events.length,
        ttlRemainingSeconds: Math.round((v.expiresAt - Date.now()) / 1000)
      })),
      accessTokenCacheEntries: Array.from(accessTokenCache.entries()).map(([k, v]) => ({
        key: k,
        expiresAt: new Date(v.expiresAt).toISOString(),
        ttlRemainingSeconds: Math.round((v.expiresAt - Date.now()) / 1000)
      }))
    }
  }
}
