import { CalendarEvent } from '@prisma/client'

export interface SyncResult {
  eventsCreated: number
  eventsUpdated: number
  eventsDeleted: number
  nextSyncToken: string | null
}

export interface WatchChannel {
  channelId: string
  resourceId: string
  expiration: Date
}

export interface CalendarProvider {
  createExternalEvent(event: CalendarEvent): Promise<string>
  updateExternalEvent(event: CalendarEvent): Promise<void>
  deleteExternalEvent(externalId: string): Promise<void>
  fullSync(userId: string): Promise<SyncResult>
  incrementalSync(userId: string, syncToken: string): Promise<SyncResult>
  watch(userId: string): Promise<WatchChannel>
  stopWatch(channelId: string, resourceId: string): Promise<void>
}

class CalendarProviderRegistry {
  private providers = new Map<string, CalendarProvider>()

  register(name: string, provider: CalendarProvider) {
    this.providers.set(name.toUpperCase(), provider)
  }

  get(name: string): CalendarProvider | undefined {
    return this.providers.get(name.toUpperCase())
  }
}

export const calendarProviderRegistry = new CalendarProviderRegistry()
