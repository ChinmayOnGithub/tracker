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
      const rrule = (metadata?.rrule as string) || null

      if (!rrule) {
        // Single event
        if (event.start <= rangeEnd && event.end >= rangeStart) {
          occurrences.push({
            id: event.id,
            eventId: event.id,
            title: event.title,
            description: event.description,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            type: event.type,
            color: event.color,
            trackerArtifactId: event.trackerArtifactId,
            trackerArtifactType: event.trackerArtifactType,
          })
        }
      } else {
        // Simple recurrence parser (e.g., DAILY, WEEKLY)
        const current = new Date(event.start)
        const durationMs = event.end.getTime() - event.start.getTime()

        // Loop daily or weekly up to rangeEnd or 100 iterations max to prevent infinite loops
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
