import { CalendarEvent } from '@prisma/client'
import { rrulestr } from 'rrule'

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
      let ruleString: string | null = null
      if (metadata && typeof metadata === 'object') {
        if (Array.isArray(metadata.recurrence) && metadata.recurrence.length > 0) {
          const lines = metadata.recurrence.filter((l): l is string => typeof l === 'string')
          if (lines.length > 0) {
            ruleString = lines.join('\n')
          }
        } else if ('rrule' in metadata && typeof metadata.rrule === 'string') {
          ruleString = metadata.rrule
        }

        if (metadata.exdate) {
          const exdates = Array.isArray(metadata.exdate) ? metadata.exdate : [metadata.exdate]
          for (const ex of exdates) {
            if (typeof ex === 'string') {
              const exLine = ex.trim().startsWith('EXDATE') ? ex.trim() : `EXDATE:${ex.trim()}`
              ruleString = ruleString ? `${ruleString}\n${exLine}` : exLine
            }
          }
        }
      }

      if (!ruleString) {
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
        // Recurrence rule compliant with RFC 5545 (BYDAY, COUNT, UNTIL, INTERVAL, FREQ, EXDATE) (#161)
        let durationMs = event.end.getTime() - event.start.getTime()
        if (event.allDay && durationMs % 86400000 === 0) {
          durationMs -= 1
        }

        try {
          const dtstartStr = event.start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
          let cleanedRule = ruleString.trim()
          if (!cleanedRule.includes('DTSTART')) {
            const rruleContent = cleanedRule.startsWith('RRULE:') || cleanedRule.includes('\n')
              ? cleanedRule
              : `RRULE:${cleanedRule}`
            cleanedRule = `DTSTART:${dtstartStr}\n${rruleContent}`
          }
          const rule = rrulestr(cleanedRule, { dtstart: event.start, forceset: true })
          const dates = rule.between(rangeStart, rangeEnd, true)

          for (const occDate of dates) {
            const occurrenceEnd = new Date(occDate.getTime() + durationMs)
            const dateStr = occDate.toISOString().split('T')[0]
            occurrences.push({
              id: `${event.id}-${dateStr}`,
              eventId: event.id,
              title: event.title,
              description: event.description,
              start: occDate,
              end: occurrenceEnd,
              allDay: event.allDay,
              type: event.type,
              color: event.color,
              trackerArtifactId: event.trackerArtifactId,
              trackerArtifactType: event.trackerArtifactType,
            })
          }
        } catch (err) {
          // Graceful fallback for non-standard or malformed rules
          console.warn('[OccurrenceService] Failed to parse RRULE:', ruleString, err)
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
        }
      }
    }

    return occurrences
  }
}
