import { db } from '@/lib/db'
import { ActivityTemplate, CalendarProvider } from '@prisma/client'
import { providerRegistry } from '@/lib/providers'
import { logger } from '@/lib/logger'

// Strongly-typed event payloads
export interface EventPayloadMap {
  ACTIVITY_CREATED: { template: ActivityTemplate; userId: string }
  ACTIVITY_UPDATED: { template: ActivityTemplate; userId: string }
  ACTIVITY_DELETED: { calendarEventId: string | null; userId: string }
  ACTIVITY_COMPLETED: { logId: string; templateId: string; userId: string }
  ACTIVITY_SKIPPED: { templateId: string; userId: string }
  ACTIVITY_OVERDUE: { templateId: string; userId: string }
}

export type EventType = keyof EventPayloadMap

export type EventHandler<T extends EventType> = (payload: EventPayloadMap[T], traceId: string) => Promise<void> | void

class DomainEventBus {
  private subscribers = new Map<EventType, Set<unknown>>()

  /**
   * Publishes an event with a typed payload.
   * Generates a trace ID to follow events through the logging pipeline.
   * Concurrently dispatches to subscribers, isolating failures.
   */
  async publish<T extends EventType>(event: T, payload: EventPayloadMap[T]): Promise<void> {
    const traceId = `tr_${Math.random().toString(36).substring(2, 11)}`
    logger.info('EventBus', `Event published: ${event}`, { event, traceId })

    const handlers = this.subscribers.get(event)
    if (!handlers || handlers.size === 0) {
      logger.debug('EventBus', `No active subscribers for event: ${event}`, { event, traceId })
      return
    }

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        const callback = handler as (payload: EventPayloadMap[T], traceId: string) => Promise<void> | void
        await callback(payload, traceId)
      } catch (err) {
        logger.error('EventBus', `Subscriber failure executing event: ${event}`, {
          event,
          traceId,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })

    await Promise.all(promises)
  }

  /**
   * Registers a handler callback for an event type.
   * Returns an unsubscribe callback.
   */
  subscribe<T extends EventType>(event: T, handler: EventHandler<T>): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set())
    }
    this.subscribers.get(event)!.add(handler as unknown)
    
    logger.debug('EventBus', `Subscribed to event: ${event}`)

    return () => {
      const handlers = this.subscribers.get(event)
      if (handlers) {
        handlers.delete(handler as unknown)
        logger.debug('EventBus', `Unsubscribed from event: ${event}`)
      }
    }
  }

  /**
   * Clears all subscribers (primarily for testing purposes).
   */
  clearAllSubscribers() {
    this.subscribers.clear()
    logger.debug('EventBus', 'All subscribers cleared')
  }
}

export const eventBus = new DomainEventBus()

// Event Constants mapping
export const EVENTS: { [K in EventType]: K } = {
  ACTIVITY_CREATED: 'ACTIVITY_CREATED',
  ACTIVITY_UPDATED: 'ACTIVITY_UPDATED',
  ACTIVITY_DELETED: 'ACTIVITY_DELETED',
  ACTIVITY_COMPLETED: 'ACTIVITY_COMPLETED',
  ACTIVITY_SKIPPED: 'ACTIVITY_SKIPPED',
  ACTIVITY_OVERDUE: 'ACTIVITY_OVERDUE'
}

// ----------------------------------------------------
// Calendar Sync Handlers (Decoupled from Google Calendar)
// ----------------------------------------------------

async function syncActivityToCalendar(template: ActivityTemplate, userId: string, traceId: string) {
  if (!template.calendarProvider || template.calendarProvider === CalendarProvider.NONE) {
    return
  }

  const provider = await providerRegistry.get(template.calendarProvider)
  if (!provider) {
    logger.warn('EventBus', `No calendar provider resolved for: ${template.calendarProvider}`, {
      templateId: template.id,
      traceId
    })
    return
  }

  try {
    const meta = (template.metadata || {}) as Record<string, unknown>
    const isAllDay = (meta.isAllDay ?? true) as boolean
    const startTime = (meta.startTime ?? '09:00') as string
    const location = (meta.location ?? undefined) as string | undefined
    
    let targetDateStr = new Date().toISOString().split('T')[0]
    if (template.targetDate) {
      targetDateStr = new Date(template.targetDate).toISOString().split('T')[0]
    }

    const settings = await db.userSetting.findUnique({
      where: {
        userId_module: {
          userId,
          module: 'GENERAL'
        }
      }
    })
    const config = (settings?.config || {}) as Record<string, unknown>
    const timeZone = (config.timezone || 'UTC') as string
    let startPayload: { date?: string; dateTime?: string; timeZone?: string } = {}
    let endPayload: { date?: string; dateTime?: string; timeZone?: string } = {}

    if (isAllDay) {
      startPayload = { date: targetDateStr }
      endPayload = { date: targetDateStr }
    } else {
      const localStartStr = `${targetDateStr}T${startTime}:00`
      const durationMs = (template.estimatedDuration || 60) * 60 * 1000
      const utcStart = new Date(`${targetDateStr}T${startTime}:00Z`)
      const utcEnd = new Date(utcStart.getTime() + durationMs)
      const localEndStr = utcEnd.toISOString().replace('Z', '').substring(0, 19)
      
      startPayload = { dateTime: localStartStr, timeZone }
      endPayload = { dateTime: localEndStr, timeZone }
    }

    // Recurrence mapping rules
    let recurrence: string[] | undefined = undefined
    if (template.recurrenceType === 'daily') {
      recurrence = ['RRULE:FREQ=DAILY']
    } else if (template.recurrenceType === 'weekly') {
      recurrence = ['RRULE:FREQ=WEEKLY']
    } else if (template.recurrenceType === 'monthly') {
      recurrence = ['RRULE:FREQ=MONTHLY']
    } else if (template.recurrenceType === 'yearly') {
      recurrence = ['RRULE:FREQ=YEARLY']
    }

    const eventInput = {
      summary: template.name,
      description: template.notes || undefined,
      location,
      start: startPayload,
      end: endPayload,
      isAllDay,
      recurrence
    }

    if (template.calendarEventId) {
      logger.info('EventBus', 'Updating calendar event via provider', { templateId: template.id, traceId })
      try {
        await provider.updateEvent(userId, template.calendarEventId, eventInput)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          logger.warn('EventBus', 'Calendar event not found on provider (likely deleted externally) - clearing calendarEventId and re-creating', {
            templateId: template.id,
            calendarEventId: template.calendarEventId,
            traceId
          })
          await db.activityTemplate.update({
            where: { id: template.id },
            data: { calendarEventId: null }
          })
          
          logger.info('EventBus', 'Re-creating deleted calendar event via provider', { templateId: template.id, traceId })
          const created = await provider.createEvent(userId, eventInput)
          if (created && created.id) {
            await db.activityTemplate.update({
              where: { id: template.id },
              data: { calendarEventId: created.id }
            })
          }
        } else {
          throw err
        }
      }
    } else {
      logger.info('EventBus', 'Creating calendar event via provider', { templateId: template.id, traceId })
      const created = await provider.createEvent(userId, eventInput)
      if (created && created.id) {
        await db.activityTemplate.update({
          where: { id: template.id },
          data: { calendarEventId: created.id }
        })
        logger.debug('EventBus', 'Activity template calendarEventId synced', {
          templateId: template.id,
          calendarEventId: created.id,
          traceId
        })
      }
    }
  } catch (error) {
    logger.error('EventBus', 'Failed to synchronize calendar event via provider', {
      templateId: template.id,
      provider: template.calendarProvider,
      traceId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function deleteActivityFromCalendar(eventId: string, userId: string, traceId: string) {
  // Try resolving available calendar providers
  const provider = await providerRegistry.get(CalendarProvider.GOOGLE)
  if (!provider) {
    logger.warn('EventBus', 'Unable to resolve Google Calendar provider for deletion', { eventId, traceId })
    return
  }

  try {
    logger.info('EventBus', 'Deleting calendar event via provider', { eventId, traceId })
    await provider.deleteEvent(userId, eventId)
  } catch (error) {
    logger.error('EventBus', 'Failed to delete calendar event via provider', {
      eventId,
      traceId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

// ----------------------------------------------------
// Default Event Subscriptions
// ----------------------------------------------------

eventBus.subscribe(EVENTS.ACTIVITY_CREATED, async (payload, traceId) => {
  await syncActivityToCalendar(payload.template, payload.userId, traceId)
})

eventBus.subscribe(EVENTS.ACTIVITY_UPDATED, async (payload, traceId) => {
  await syncActivityToCalendar(payload.template, payload.userId, traceId)
})

eventBus.subscribe(EVENTS.ACTIVITY_DELETED, async (payload, traceId) => {
  if (payload.calendarEventId) {
    await deleteActivityFromCalendar(payload.calendarEventId, payload.userId, traceId)
  }
})
