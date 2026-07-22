import { CalendarEvent, Prisma } from '@prisma/client'
import { CalendarProvider, SyncResult, WatchChannel } from '@/modules/calendar/providers/CalendarProvider'
import { ICalendarProvider, CalendarEventInput as LibCalendarEventInput, ParsedCalendarEvent } from '@/lib/providers'
import { GoogleCalendarService, CalendarEventInput } from '../services/GoogleCalendarService'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

interface GoogleEventPayload {
  id: string
  status?: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  etag?: string
  updated?: string
}

export class GoogleCalendarProvider implements CalendarProvider, ICalendarProvider {
  private toGoogleEventInput(event: CalendarEvent): CalendarEventInput {
    return {
      summary: event.title,
      description: event.description || undefined,
      start: event.allDay 
        ? { date: event.start.toISOString().split('T')[0] }
        : { dateTime: event.start.toISOString() },
      end: event.allDay 
        ? { date: event.end.toISOString().split('T')[0] }
        : { dateTime: event.end.toISOString() },
      isAllDay: event.allDay,
    }
  }

  // --- ICalendarProvider Implementation ---
  async createEvent(userId: string, event: LibCalendarEventInput): Promise<ParsedCalendarEvent> {
    return GoogleCalendarService.createEvent(userId, event as CalendarEventInput)
  }

  async updateEvent(
    userId: string,
    eventId: string,
    event: Partial<LibCalendarEventInput>
  ): Promise<ParsedCalendarEvent> {
    return GoogleCalendarService.updateEvent(userId, eventId, event as Partial<CalendarEventInput>)
  }

  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    return GoogleCalendarService.deleteEvent(userId, eventId)
  }

  async getEvents(
    userId: string,
    start: Date,
    end: Date,
    forceRefresh?: boolean
  ): Promise<ParsedCalendarEvent[]> {
    if (forceRefresh) {
      GoogleCalendarService.clearCache(userId)
    }
    return GoogleCalendarService.getEvents(userId, start, end, forceRefresh)
  }

  // --- CalendarProvider Implementation ---
  async createExternalEvent(event: CalendarEvent): Promise<string> {
    const googleInput = this.toGoogleEventInput(event)
    const result = await GoogleCalendarService.createEvent(event.userId, googleInput)
    return result.id
  }

  async updateExternalEvent(event: CalendarEvent): Promise<void> {
    if (!event.externalId) {
      throw new Error('Cannot update Google event: missing externalId')
    }
    const googleInput = this.toGoogleEventInput(event)
    await GoogleCalendarService.updateEvent(event.userId, event.externalId, googleInput)
  }

  async deleteExternalEvent(externalId: string): Promise<void> {
    const localEvent = await db.calendarEvent.findFirst({
      where: { externalId, deletedAt: null }
    })
    if (localEvent) {
      await GoogleCalendarService.deleteEvent(localEvent.userId, externalId)
    } else {
      logger.warn('GoogleCalendarProvider', 'deleteExternalEvent requested but no local CalendarEvent found for externalId', { externalId })
    }
  }

  async fullSync(userId: string): Promise<SyncResult> {
    const { items, nextSyncToken } = await GoogleCalendarService.listEventsWithSyncToken(userId)
    const result = await this.mergeEvents(userId, items as GoogleEventPayload[])
    return {
      ...result,
      nextSyncToken
    }
  }

  async incrementalSync(userId: string, syncToken: string): Promise<SyncResult> {
    const { items, nextSyncToken } = await GoogleCalendarService.listEventsWithSyncToken(userId, syncToken)
    const result = await this.mergeEvents(userId, items as GoogleEventPayload[])
    return {
      ...result,
      nextSyncToken
    }
  }

  async watch(userId: string): Promise<WatchChannel> {
    const channelId = crypto.randomUUID()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const address = `${siteUrl}/api/sync/calendar`

    const { resourceId, expiration } = await GoogleCalendarService.watchEvents(userId, channelId, address)
    return {
      channelId,
      resourceId,
      expiration
    }
  }

  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    const syncState = await db.calendarSyncState.findFirst({
      where: { channelId }
    })
    if (syncState) {
      await GoogleCalendarService.stopWatchEvents(syncState.userId, channelId, resourceId)
    } else {
      logger.warn('GoogleCalendarProvider', 'stopWatch requested but no sync state found for channelId', { channelId })
    }
  }

  private async mergeEvents(userId: string, googleEvents: GoogleEventPayload[]): Promise<Omit<SyncResult, 'nextSyncToken'>> {
    let eventsCreated = 0
    let eventsUpdated = 0
    let eventsDeleted = 0

    for (const gEvent of googleEvents) {
      const isDeleted = gEvent.status === 'cancelled'
      const isAllDay = !gEvent.start?.dateTime
      const start = new Date((isAllDay ? gEvent.start?.date : gEvent.start?.dateTime) || new Date())
      const end = new Date((isAllDay ? gEvent.end?.date : gEvent.end?.dateTime) || new Date())

      const localEvent = await db.calendarEvent.findFirst({
        where: { userId, externalId: gEvent.id }
      })

      if (isDeleted) {
        if (localEvent && !localEvent.deletedAt) {
          await db.calendarEvent.update({
            where: { id: localEvent.id },
            data: { deletedAt: new Date() }
          })
          eventsDeleted++
        }
      } else {
        if (localEvent) {
          const gUpdated = gEvent.updated ? new Date(gEvent.updated) : new Date()
          const lUpdated = localEvent.updatedAt

          if (gUpdated > lUpdated) {
            await db.calendarEvent.update({
              where: { id: localEvent.id },
              data: {
                title: gEvent.summary || 'Untitled Event',
                description: gEvent.description || null,
                start,
                end,
                allDay: isAllDay,
                etag: gEvent.etag || null,
                externalMetadata: gEvent as unknown as Prisma.InputJsonValue,
                deletedAt: null
              }
            })
            eventsUpdated++
          }
        } else {
          await db.calendarEvent.create({
            data: {
              userId,
              title: gEvent.summary || 'Untitled Event',
              description: gEvent.description || null,
              start,
              end,
              allDay: isAllDay,
              type: 'MEETING',
              status: 'confirmed',
              externalId: gEvent.id,
              externalProvider: 'GOOGLE',
              etag: gEvent.etag || null,
              externalMetadata: gEvent as unknown as Prisma.InputJsonValue
            }
          })
          eventsCreated++
        }
      }
    }

    return { eventsCreated, eventsUpdated, eventsDeleted }
  }
}
