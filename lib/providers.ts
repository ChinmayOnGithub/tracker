import { CalendarProvider as DbProvider } from '@prisma/client'

export interface CalendarEventInput {
  summary: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  isAllDay: boolean
  location?: string
  recurrence?: string[]
}

export interface ParsedCalendarEvent {
  id: string
  summary: string
  description?: string
  start: string
  end: string
  isAllDay: boolean
  location?: string
  htmlLink?: string
}

export interface ICalendarProvider {
  createEvent(userId: string, event: CalendarEventInput): Promise<ParsedCalendarEvent>
  updateEvent(userId: string, eventId: string, event: Partial<CalendarEventInput>): Promise<ParsedCalendarEvent>
  deleteEvent(userId: string, eventId: string): Promise<boolean>
  getEvents(userId: string, start: Date, end: Date, forceRefresh?: boolean): Promise<ParsedCalendarEvent[]>
}

class ProviderRegistry {
  private loaders = new Map<DbProvider, () => Promise<ICalendarProvider>>()
  private instances = new Map<DbProvider, ICalendarProvider>()

  /**
   * Registers a deferred provider loader for a provider type.
   */
  register(type: DbProvider, loader: () => Promise<ICalendarProvider>) {
    this.loaders.set(type, loader)
  }

  /**
   * Resolves and returns the provider instance on-demand.
   * Caches resolved instances to prevent redundant allocations.
   */
  async get(type: DbProvider): Promise<ICalendarProvider | undefined> {
    if (this.instances.has(type)) {
      return this.instances.get(type)
    }

    const loader = this.loaders.get(type)
    if (!loader) {
      return undefined
    }

    try {
      const instance = await loader()
      this.instances.set(type, instance)
      return instance
    } catch (err) {
      console.error(`[ProviderRegistry] Failed to load provider for ${type}:`, err)
      return undefined
    }
  }

  /**
   * Resets instances map (primarily for testing purposes).
   */
  reset() {
    this.instances.clear()
  }
}

export const providerRegistry = new ProviderRegistry()

// Register calendar providers dynamically to avoid compile-time circular imports or core coupling
providerRegistry.register(DbProvider.GOOGLE, async () => {
  const { GoogleCalendarProvider } = await import('@/modules/sync/google-calendar/providers/GoogleCalendarProvider')
  return new GoogleCalendarProvider()
})
