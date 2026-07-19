import React, { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, Button, Skeleton } from '@/design-system'
import { Calendar, Clock, MapPin, RefreshCw, AlertCircle, Sparkles, ExternalLink, Link as LinkIcon, Info } from 'lucide-react'
import { getAgendaAction } from '../actions'
import { ParsedCalendarEvent } from '../services/GoogleCalendarService'

interface AgendaWidgetProps {
  todayStr: string
}

interface AgendaData {
  today: ParsedCalendarEvent[]
  tomorrow: ParsedCalendarEvent[]
  upcoming: ParsedCalendarEvent[]
}

export const AgendaWidget: React.FC<AgendaWidgetProps> = ({ todayStr }) => {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [agenda, setAgenda] = useState<AgendaData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAgenda = async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    
    setError(null)
    
    const res = await getAgendaAction(todayStr, force)
    if (res.success) {
      setConnected(res.connected || false)
      setAgenda(res.agenda || null)
    } else {
      setError(res.error || 'Failed to fetch calendar agenda')
    }
    
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      await fetchAgenda(false)
    }
    if (active) load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr])

  const formatTime = (isoString: string, isAllDay: boolean) => {
    if (isAllDay) return 'All Day'
    
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    } catch (_) {
      return 'Time'
    }
  }

  const renderEventList = (events: ParsedCalendarEvent[], fallbackMsg: string, isToday = false) => {
    if (events.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-5 text-center bg-[var(--color-bg-base)] border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] gap-2">
          {isToday ? (
            <>
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              <p className="text-xs font-bold text-[var(--color-text-main)]">You&apos;re free today 🎉</p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)] italic">{fallbackMsg}</p>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {events.map(event => {
          const isUrl = event.location && (event.location.startsWith('http://') || event.location.startsWith('https://'))
          
          return (
            <div
              key={event.id}
              className="group relative flex items-start gap-3 p-3 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] transition-all duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-accent)]"
            >
              <div className="flex items-center justify-center p-2 rounded-full bg-[var(--color-accent)] text-[var(--color-primary)] shrink-0 transition-colors group-hover:bg-[var(--color-bg-base)]">
                <Clock className="w-3.5 h-3.5" />
              </div>
              
              <div className="space-y-1 min-w-0 flex-1 pr-4">
                <h4 className="text-xs font-bold text-[var(--color-text-main)] truncate leading-snug">
                  {event.htmlLink ? (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1 max-w-full"
                      title="Open in Google Calendar"
                    >
                      <span className="truncate">{event.summary}</span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                    </a>
                  ) : (
                    event.summary
                  )}
                </h4>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
                  <span className="font-semibold text-[var(--color-text-main)]">
                    {formatTime(event.start, event.isAllDay)}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-0.5 truncate max-w-[180px]">
                      {isUrl ? (
                        <a
                          href={event.location}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[var(--color-primary)] hover:underline truncate"
                          title="Open location link"
                        >
                          <LinkIcon className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </a>
                      ) : (
                        <>
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Event Description Hover Icon */}
              {event.description && (
                <div 
                  className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 cursor-help"
                  title={event.description}
                >
                  <Info className="w-3.5 h-3.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Handle connection fallback state
  if (!loading && !connected && !error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--color-text-muted)]" />
            <span className="text-sm font-semibold text-[var(--color-text-main)]">Today&apos;s Schedule</span>
          </div>
        </CardHeader>
        <CardBody className="py-6 flex flex-col items-center justify-center text-center gap-3">
          <Calendar className="w-8 h-8 text-[var(--color-text-muted)] opacity-40" />
          <div className="space-y-1 max-w-xs">
            <h4 className="text-xs font-bold text-[var(--color-text-main)]">Google Calendar Disconnected</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              Connect your account in Settings to sync and view your daily events here.
            </p>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[var(--color-primary)]" />
          <span className="text-sm font-semibold text-[var(--color-text-main)]">Today&apos;s Schedule</span>
        </div>
        {connected && !error && (
          <button
            onClick={() => fetchAgenda(true)}
            disabled={refreshing || loading}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-main)] transition-colors disabled:opacity-50"
            title="Force sync Google Calendar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </CardHeader>
      
      <CardBody className="space-y-5">
        {loading ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton variant="text" className="h-3 w-16" />
              <div className="flex gap-3 p-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)]">
                <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton variant="text" className="h-3 w-3/4" />
                  <Skeleton variant="text" className="h-2.5 w-1/4" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton variant="text" className="h-3 w-16" />
              <div className="flex gap-3 p-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)]">
                <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton variant="text" className="h-3 w-1/2" />
                  <Skeleton variant="text" className="h-2.5 w-1/5" />
                </div>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-rose-550/10 border border-rose-500/20 text-rose-500 rounded-[var(--radius-md)] text-xs">
              <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fetchAgenda(false)}
            >
              Retry Connection
            </Button>
          </div>
        ) : agenda ? (
          <div className="space-y-5">
            {/* Today Section */}
            <div className="space-y-2">
              <h5 className="text-[10px] uppercase font-black tracking-wider text-[var(--color-text-muted)]">
                Today
              </h5>
              {renderEventList(agenda.today, "You&apos;re free today 🎉", true)}
            </div>

            {/* Tomorrow Section */}
            <div className="space-y-2">
              <h5 className="text-[10px] uppercase font-black tracking-wider text-[var(--color-text-muted)]">
                Tomorrow
              </h5>
              {renderEventList(agenda.tomorrow, "No events scheduled for tomorrow")}
            </div>

            {/* Upcoming Week Section */}
            {agenda.upcoming.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-[10px] uppercase font-black tracking-wider text-[var(--color-text-muted)]">
                  Upcoming Week
                </h5>
                {renderEventList(agenda.upcoming, "No upcoming events")}
              </div>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
