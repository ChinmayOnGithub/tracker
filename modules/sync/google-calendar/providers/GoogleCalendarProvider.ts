import { ICalendarProvider, CalendarEventInput, ParsedCalendarEvent } from '@/lib/providers'
import { GoogleCalendarService } from '../services/GoogleCalendarService'

export class GoogleCalendarProvider implements ICalendarProvider {
  async createEvent(userId: string, event: CalendarEventInput): Promise<ParsedCalendarEvent> {
    return GoogleCalendarService.createEvent(userId, event)
  }

  async updateEvent(
    userId: string,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<ParsedCalendarEvent> {
    return GoogleCalendarService.updateEvent(userId, eventId, event)
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
}
