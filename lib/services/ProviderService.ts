import { CalendarProvider } from '@prisma/client'
import { providerRegistry } from '../providers'
import { CalendarEventInput, ParsedCalendarEvent } from '../providers'

export class ProviderService {
  /**
   * Resolves calendar provider from registry and fetches events.
   */
  static async getEvents(
    userId: string,
    provider: CalendarProvider,
    start: Date,
    end: Date,
    forceRefresh?: boolean
  ): Promise<ParsedCalendarEvent[]> {
    if (provider === CalendarProvider.NONE) return []
    const resolved = await providerRegistry.get(provider)
    if (!resolved) return []
    return await resolved.getEvents(userId, start, end, forceRefresh)
  }

  /**
   * Creates a calendar event on the resolved provider.
   */
  static async createEvent(
    userId: string,
    provider: CalendarProvider,
    event: CalendarEventInput
  ): Promise<ParsedCalendarEvent> {
    const resolved = await providerRegistry.get(provider)
    if (!resolved) throw new Error(`Provider ${provider} not registered`)
    return await resolved.createEvent(userId, event)
  }

  /**
   * Updates a calendar event on the resolved provider.
   */
  static async updateEvent(
    userId: string,
    provider: CalendarProvider,
    eventId: string,
    event: Partial<CalendarEventInput>
  ): Promise<ParsedCalendarEvent> {
    const resolved = await providerRegistry.get(provider)
    if (!resolved) throw new Error(`Provider ${provider} not registered`)
    return await resolved.updateEvent(userId, eventId, event)
  }

  /**
   * Deletes a calendar event on the resolved provider.
   */
  static async deleteEvent(
    userId: string,
    provider: CalendarProvider,
    eventId: string
  ): Promise<boolean> {
    const resolved = await providerRegistry.get(provider)
    if (!resolved) throw new Error(`Provider ${provider} not registered`)
    return await resolved.deleteEvent(userId, eventId)
  }
}
