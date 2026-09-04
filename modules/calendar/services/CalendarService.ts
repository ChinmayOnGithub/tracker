import { CalendarEvent, CalendarEventType } from '@prisma/client'
import { CalendarRepository } from '../repositories/CalendarRepository'
import { OccurrenceService, EventOccurrence } from './OccurrenceService'
import { calendarProviderRegistry, SyncResult } from '../providers/CalendarProvider'
import { providerRegistry } from '@/lib/providers'
import { CalendarProvider as DbProvider } from '@prisma/client'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export class CalendarService {
  private static async getProvider(userId: string) {
    const isGoogleConnected = await db.googleCredential.count({ where: { userId } }) > 0
    if (isGoogleConnected) {
      await providerRegistry.get(DbProvider.GOOGLE)
      return calendarProviderRegistry.get('GOOGLE')
    }
    return undefined
  }

  static async getEvents(
    userId: string,
    start: Date,
    end: Date
  ): Promise<EventOccurrence[]> {
    const rawEvents = await CalendarRepository.findEventsForUser(userId, start, end)
    return OccurrenceService.generateOccurrences(rawEvents, start, end)
  }

  static async createEvent(
    userId: string,
    data: Omit<CalendarEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>
  ): Promise<CalendarEvent> {
    const localEvent = await CalendarRepository.createEvent(userId, data)
    
    try {
      const provider = await this.getProvider(userId)
      if (provider) {
        const externalId = await provider.createExternalEvent(localEvent)
        return await CalendarRepository.updateEvent(localEvent.id, {
          externalId,
          externalProvider: 'GOOGLE'
        })
      }
    } catch (err) {
      logger.error('CalendarService', 'Failed to push created event to external provider', err)
    }

    return localEvent
  }

  static async updateEvent(
    eventId: string,
    data: Partial<Omit<CalendarEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
  ): Promise<CalendarEvent> {
    const localEvent = await CalendarRepository.updateEvent(eventId, data)

    try {
      const provider = await this.getProvider(localEvent.userId)
      if (provider && localEvent.externalId) {
        await provider.updateExternalEvent(localEvent)
      }
    } catch (err) {
      logger.error('CalendarService', 'Failed to push updated event to external provider', err)
    }

    return localEvent
  }

  static async deleteEvent(eventId: string): Promise<CalendarEvent> {
    const localEvent = await CalendarRepository.deleteEvent(eventId)

    try {
      const provider = await this.getProvider(localEvent.userId)
      if (provider && localEvent.externalId) {
        await provider.deleteExternalEvent(localEvent.externalId)
      }
    } catch (err) {
      logger.error('CalendarService', 'Failed to push deleted event to external provider', err)
    }

    return localEvent
  }

  static async scheduleTask(
    userId: string,
    taskId: string,
    taskTitle: string,
    start: Date,
    end: Date,
    color?: string
  ): Promise<CalendarEvent> {
    const existing = await CalendarRepository.findEventByArtifact(taskId, 'task')
    if (existing) {
      return this.updateEvent(existing.id, {
        title: taskTitle,
        start,
        end,
        color: color || null,
      })
    }

    return this.createEvent(userId, {
      title: taskTitle,
      description: 'Scheduled Task',
      start,
      end,
      allDay: false,
      type: CalendarEventType.TASK,
      status: 'confirmed',
      color: color || null,
      trackerArtifactId: taskId,
      trackerArtifactType: 'task',
      externalId: null,
      externalProvider: null,
      etag: null,
      externalMetadata: null,
    })
  }

  static async unscheduleTask(taskId: string): Promise<void> {
    const existing = await CalendarRepository.findEventByArtifact(taskId, 'task')
    if (existing) {
      await this.deleteEvent(existing.id)
    }
  }

  static async sync(userId: string): Promise<SyncResult> {
    const provider = await this.getProvider(userId)
    if (!provider) {
      throw new Error('No active calendar provider connected for sync')
    }

    const syncState = await CalendarRepository.getSyncState(userId, 'google')
    
    let result: SyncResult
    if (syncState && syncState.syncToken) {
      try {
        result = await provider.incrementalSync(userId, syncState.syncToken)
      } catch (err: unknown) {
        const is410 = (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) ||
          (err instanceof Error && (err.message.includes('410') || err.message.includes('Sync token is invalid')));

        if (is410) {
          logger.warn('CalendarService', 'Sync token invalidated (HTTP 410). Clearing sync token and performing full resync', { userId })
          // Reset sync token to null on 410
          await CalendarRepository.updateSyncState(userId, 'google', {
            syncToken: null
          })
        } else {
          logger.warn('CalendarService', 'Incremental sync failed, attempting fallback full sync', err)
        }
        result = await provider.fullSync(userId)
      }
    } else {
      result = await provider.fullSync(userId)
    }

    // Persist new valid sync token only after sync completed without throwing
    if (result && result.nextSyncToken !== undefined) {
      await CalendarRepository.updateSyncState(userId, 'google', {
        syncToken: result.nextSyncToken,
        lastSyncAt: new Date()
      })
    }

    return result
  }

  /**
   * Ensures an active Google Calendar push notification watch channel exists.
   * If existing channel is expired or near expiration (< 24h), renews it and persists channel metadata.
   */
  static async ensureWatchChannel(userId: string): Promise<{ channelId: string; resourceId: string; expiration: Date } | null> {
    const provider = await this.getProvider(userId)
    if (!provider) return null

    const syncState = await CalendarRepository.getSyncState(userId, 'google')
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000

    if (
      syncState?.channelId &&
      syncState.resourceId &&
      syncState.expiration &&
      syncState.expiration.getTime() - now > oneDayMs
    ) {
      // Channel is active and not close to expiration
      return {
        channelId: syncState.channelId,
        resourceId: syncState.resourceId,
        expiration: syncState.expiration,
      }
    }

    // Stop previous channel if present
    if (syncState?.channelId && syncState.resourceId) {
      try {
        await provider.stopWatch(syncState.channelId, syncState.resourceId)
      } catch (err) {
        logger.warn('CalendarService', 'Failed to stop old watch channel before renewing', err)
      }
    }

    // Create new watch channel
    const watchChannel = await provider.watch(userId)
    await CalendarRepository.updateSyncState(userId, 'google', {
      channelId: watchChannel.channelId,
      resourceId: watchChannel.resourceId,
      expiration: watchChannel.expiration,
    })

    return watchChannel
  }

  /**
   * Stops and clears the active watch channel for a user.
   */
  static async stopWatchChannel(userId: string): Promise<void> {
    const provider = await this.getProvider(userId)
    if (!provider) return

    const syncState = await CalendarRepository.getSyncState(userId, 'google')
    if (syncState?.channelId && syncState.resourceId) {
      await provider.stopWatch(syncState.channelId, syncState.resourceId)
      await CalendarRepository.updateSyncState(userId, 'google', {
        channelId: null,
        resourceId: null,
        expiration: null,
      })
    }
  }
}
