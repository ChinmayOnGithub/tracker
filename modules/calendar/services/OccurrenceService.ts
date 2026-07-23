import { CalendarEvent } from '@prisma/client'

export interface EventOccurrence {
  id: string // "event-id-occurrence-date"
  eventId: string
  title: string
  description: string | null
  start: Date
  end: Date
  allDay: boolean
  type: string
  color: string | null
  trackerArtifactId: string | null
  trackerArtifactType: string | null
}

export class OccurrenceService {
  static generateOccurrences(
    events: CalendarEvent[],
    rangeStart: Date,
    rangeEnd: Date
  ): EventOccurrence[] {
    const occurrences: EventOccurrence[] = []

    for (const event of events) {
      // Check if it is a single event or has recurrence
      const metadata = event.externalMetadata as Record<string, unknown> | null
      let rrule: string | null = null
      if (metadata && typeof metadata === 'object') {
        if ('rrule' in metadata && typeof metadata.rrule === 'string') {
          rrule = metadata.rrule
        } else if ('recurrence' in metadata && Array.isArray(metadata.recurrence) && metadata.recurrence.length > 0 && typeof metadata.recurrence[0] === 'string') {
          rrule = metadata.recurrence[0]
        }
      }

      if (!rrule) {
        // Single event
        let eventEnd = event.end
        const durationMs = event.end.getTime() - event.start.getTime()
        if (event.allDay && durationMs % 86400000 === 0) {
          eventEnd = new Date(event.end.getTime() - 1)
        }
        if (event.start <= rangeEnd && eventEnd >= rangeStart) {
          occurrences.push({
            id: event.id,
            eventId: event.id,
            title: event.title,
            description: event.description,
            start: event.start,
            end: eventEnd,
            allDay: event.allDay,
            type: event.type,
            color: event.color,
            trackerArtifactId: event.trackerArtifactId,
            trackerArtifactType: event.trackerArtifactType,
          })
        }
      } else {
        // Simple recurrence parser (e.g., DAILY, WEEKLY, MONTHLY, YEARLY)
        const current = new Date(event.start)
        let durationMs = event.end.getTime() - event.start.getTime()
        if (event.allDay && durationMs % 86400000 === 0) {
          durationMs -= 1
        }

        // Fast-forward starting point if it starts far in the past to avoid hitting the 100-iteration limit
        if (current < rangeStart) {
          if (rrule.includes('FREQ=YEARLY')) {
            const diffYears = rangeStart.getUTCFullYear() - current.getUTCFullYear()
            if (diffYears > 1) {
              current.setUTCFullYear(current.getUTCFullYear() + diffYears - 1)
            }
          } else if (rrule.includes('FREQ=MONTHLY')) {
            const diffMonths = (rangeStart.getUTCFullYear() - current.getUTCFullYear()) * 12 + (rangeStart.getUTCMonth() - current.getUTCMonth())
            if (diffMonths > 1) {
              current.setUTCMonth(current.getUTCMonth() + diffMonths - 1)
            }
          } else if (rrule.includes('FREQ=WEEKLY')) {
            const diffMs = rangeStart.getTime() - current.getTime()
            const weeksToJump = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
            if (weeksToJump > 1) {
              current.setUTCDate(current.getUTCDate() + (weeksToJump - 1) * 7)
            }
          } else if (rrule.includes('FREQ=DAILY')) {
            const diffMs = rangeStart.getTime() - current.getTime()
            const daysToJump = Math.floor(diffMs / (24 * 60 * 60 * 1000))
            if (daysToJump > 1) {
              current.setUTCDate(current.getUTCDate() + (daysToJump - 1))
            }
          }
        }

        // Loop up to rangeEnd or 100 iterations max to prevent infinite loops
        let iterations = 0
        while (current <= rangeEnd && iterations < 100) {
          const occurrenceEnd = new Date(current.getTime() + durationMs)
          
          if (occurrenceEnd >= rangeStart) {
            occurrences.push({
              id: `${event.id}-${current.toISOString().split('T')[0]}`,
              eventId: event.id,
              title: event.title,
              description: event.description,
              start: new Date(current),
              end: occurrenceEnd,
              allDay: event.allDay,
              type: event.type,
              color: event.color,
              trackerArtifactId: event.trackerArtifactId,
              trackerArtifactType: event.trackerArtifactType,
            })
          }

          if (rrule.includes('FREQ=DAILY')) {
            current.setUTCDate(current.getUTCDate() + 1)
          } else if (rrule.includes('FREQ=WEEKLY')) {
            current.setUTCDate(current.getUTCDate() + 7)
          } else if (rrule.includes('FREQ=MONTHLY')) {
            current.setUTCMonth(current.getUTCMonth() + 1)
          } else if (rrule.includes('FREQ=YEARLY')) {
            current.setUTCFullYear(current.getUTCFullYear() + 1)
          } else {
            // Default increment if unsupported rule
            current.setUTCDate(current.getUTCDate() + 1)
          }
          iterations++
        }
      }
    }

    return occurrences
  }
}
