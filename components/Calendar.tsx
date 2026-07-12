"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis, TimelineItem } from '@/types'
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { getEventsForDate } from '@/lib/marathiCalendar'
import { Card } from '@/design-system'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'

interface TestAnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface CalendarProps {
  logs: ActivityLog[]
  templates: ActivityTemplate[]
  notes: Note[]
  calendarData?: {
    connected: boolean
    agenda: {
      today: ParsedCalendarEvent[]
      tomorrow: ParsedCalendarEvent[]
      upcoming: ParsedCalendarEvent[]
    } | null
    error: string | null
    loading: boolean
  }
  todayStr?: string
  analyzedTemplates?: TestAnalyzedTemplate[]
  onDayClick: (dateStr: string) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const Calendar: React.FC<CalendarProps> = ({
  logs,
  templates,
  notes,
  calendarData,
  todayStr = '',
  analyzedTemplates = [],
  onDayClick,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'week' | 'agenda'>(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('calendar_default_view')
      if (val === 'month' || val === 'week' || val === 'agenda') return val
    }
    return 'agenda'
  })
  const [startOfWeekPref, setStartOfWeekPref] = useState<'sunday' | 'monday'>(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('calendar_start_of_week')
      if (val === 'sunday' || val === 'monday') return val
    }
    return 'sunday'
  })
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() // 0-indexed

  // Navigation handlers
  const handlePrev = () => {
    if (view === 'month') {
      setCurrentDate(new Date(year, month - 1, 1))
    } else if (view === 'week') {
      const prevWeek = new Date(currentDate)
      prevWeek.setDate(prevWeek.getDate() - 7)
      setCurrentDate(prevWeek)
    } else {
      const prevDay = new Date(currentDate)
      prevDay.setDate(prevDay.getDate() - 14)
      setCurrentDate(prevDay)
    }
  }

  const handleNext = () => {
    if (view === 'month') {
      setCurrentDate(new Date(year, month + 1, 1))
    } else if (view === 'week') {
      const nextWeek = new Date(currentDate)
      nextWeek.setDate(nextWeek.getDate() + 7)
      setCurrentDate(nextWeek)
    } else {
      const nextDay = new Date(currentDate)
      nextDay.setDate(nextDay.getDate() + 14)
      setCurrentDate(nextDay)
    }
  }

  const handleResetToToday = () => {
    setCurrentDate(new Date())
  }

  // Helper to compile timeline items for a specific date
  const getTimelineForDate = (dateStr: string): TimelineItem[] => {
    // Gather all Google events across today/tomorrow/upcoming sections
    const allGoogleEvents = [
      ...(calendarData?.agenda?.today || []),
      ...(calendarData?.agenda?.tomorrow || []),
      ...(calendarData?.agenda?.upcoming || [])
    ]
    
    // Filter matching date
    const dailyCalendarEvents = allGoogleEvents.filter(e => {
      if (!e.start) return false
      return e.start.split('T')[0] === dateStr
    })

    return generateTimeline(analyzedTemplates, logs, dateStr, dailyCalendarEvents)
  }

  // Month cells calculation — uses startOfWeekPref state
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDayIndex = new Date(year, month, 1).getDay()
  const cells: { dateStr: string | null; dayNumber: number | null; isCurrentMonth: boolean }[] = []
  const prevMonthDays = new Date(year, month, 0).getDate()
  
  const startDayOffset = startOfWeekPref === 'monday' 
    ? (startDayIndex === 0 ? 6 : startDayIndex - 1)
    : startDayIndex

  for (let i = startDayOffset - 1; i >= 0; i--) {
    cells.push({
      dateStr: null,
      dayNumber: prevMonthDays - i,
      isCurrentMonth: false,
    })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const formattedMonth = String(month + 1).padStart(2, '0')
    const formattedDay = String(day).padStart(2, '0')
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`
    cells.push({
      dateStr,
      dayNumber: day,
      isCurrentMonth: true,
    })
  }

  // ----------------------------------------------------
  // Logs density mapping
  // ----------------------------------------------------
  const logsByDate = new Map<string, ActivityLog[]>()
  logs.forEach(log => {
    if (!logsByDate.has(log.date)) {
      logsByDate.set(log.date, [])
    }
    logsByDate.get(log.date)!.push(log)
  })

  const notesByDate = new Map<string, Note>()
  notes.forEach(note => {
    const d = note.date.split('T')[0]
    notesByDate.set(d, note)
  })

  const getDensityBackground = (dateStr: string) => {
    const dateLogs = logsByDate.get(dateStr) || []
    const completions = dateLogs.filter(
      l => l.status !== 'skipped' && l.status !== 'reminder'
    )
    const count = completions.length

    if (count === 0) return 'bg-white dark:bg-zinc-900 border border-slate-205 dark:border-zinc-800 text-slate-800 dark:text-zinc-350 hover:bg-slate-50 dark:hover:bg-zinc-850/60'
    if (count <= 1) return 'bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-850 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-850'
    if (count <= 2) return 'bg-blue-50/60 dark:bg-zinc-850 border border-blue-100/70 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-200 hover:bg-blue-100/40 dark:hover:bg-zinc-800'
    if (count <= 4) {
      return 'bg-blue-100/60 dark:bg-zinc-800 border border-blue-200/70 dark:border-zinc-700/80 text-slate-950 dark:text-zinc-100 hover:bg-blue-200/40 dark:hover:bg-zinc-800/80'
    } else {
      return 'bg-blue-200/60 dark:bg-zinc-700 border border-blue-300/70 dark:border-zinc-700 text-slate-950 dark:text-white hover:bg-blue-300/50 dark:hover:bg-zinc-700/80 shadow-inner'
    }
  }

  const getTailwindColorClass = (color: string) => {
    switch (color) {
      case 'red': return 'bg-rose-500'
      case 'green': return 'bg-emerald-500'
      case 'blue': return 'bg-blue-500'
      case 'yellow': return 'bg-yellow-500'
      case 'orange': return 'bg-orange-500'
      case 'purple': return 'bg-purple-500'
      case 'teal': return 'bg-teal-500'
      case 'indigo': return 'bg-indigo-500'
      case 'rose': return 'bg-rose-400'
      case 'cyan': return 'bg-cyan-500'
      default: return 'bg-slate-400'
    }
  }

  // ----------------------------------------------------
  // Week calculations (7 Days starting from startOfWeekPref)
  // ----------------------------------------------------
  const startOfWeek = new Date(currentDate)
  const currentDay = currentDate.getDay() // 0 = Sunday, 1 = Monday...
  if (startOfWeekPref === 'monday') {
    const diff = currentDay === 0 ? -6 : 1 - currentDay
    startOfWeek.setDate(currentDate.getDate() + diff) // Go to Monday
  } else {
    startOfWeek.setDate(currentDate.getDate() - currentDay) // Go to Sunday
  }
  
  const weekDaysList: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    weekDaysList.push(d)
  }

  // ----------------------------------------------------
  // Agenda calculations (Next 14 Days starting from currentDate)
  // ----------------------------------------------------
  const agendaDaysList: Date[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(currentDate)
    d.setDate(currentDate.getDate() + i)
    agendaDaysList.push(d)
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long' })

  return (
    <Card className="p-4 md:p-5 flex flex-col gap-5 transition-all">
      
      {/* Calendar Header with toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-850 pb-3">
        <div>
          <h2 className="text-lg font-black text-[var(--color-text-main)] flex items-center gap-1.5 leading-none">
            {monthName} <span className="text-[var(--color-text-muted)] font-bold">{year}</span>
          </h2>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1 font-bold">
            {view === 'month' ? 'Click days to schedule activities' : view === 'week' ? 'Weekly schedule overview' : '14-day chronological agenda'}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented View Toggles */}
          <div className="flex bg-slate-50 dark:bg-zinc-950 border border-slate-150 dark:border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setView('month')}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-extrabold rounded-md transition-all cursor-pointer ${
                view === 'month' 
                  ? 'bg-white dark:bg-zinc-800 text-[var(--color-text-main)] border border-slate-200/50 dark:border-zinc-700/60 shadow-3xs'
                  : 'text-slate-400 dark:text-zinc-500 hover:text-slate-650'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-extrabold rounded-md transition-all cursor-pointer ${
                view === 'week' 
                  ? 'bg-white dark:bg-zinc-800 text-[var(--color-text-main)] border border-slate-200/50 dark:border-zinc-700/60 shadow-3xs'
                  : 'text-slate-400 dark:text-zinc-500 hover:text-slate-650'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-extrabold rounded-md transition-all cursor-pointer ${
                view === 'agenda' 
                  ? 'bg-white dark:bg-zinc-800 text-[var(--color-text-main)] border border-slate-200/50 dark:border-zinc-700/60 shadow-3xs'
                  : 'text-slate-400 dark:text-zinc-500 hover:text-slate-650'
              }`}
            >
              Agenda
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleResetToToday}
              className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase bg-[var(--color-accent)] hover:opacity-90 border border-[var(--color-border)] text-[var(--color-text-main)] rounded-lg transition-all cursor-pointer"
            >
              Today
            </button>
            <div className="flex bg-slate-50 dark:bg-zinc-950 border border-slate-150 dark:border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={handlePrev}
                className="p-1.5 text-slate-450 hover:text-[var(--color-text-main)] rounded-md hover:bg-slate-105 transition-colors cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 text-slate-455 hover:text-[var(--color-text-main)] rounded-md hover:bg-slate-105 transition-colors cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 1. MONTH VIEW */}
      {/* ---------------------------------------------------- */}
      {view === 'month' && (
        <div className="space-y-4">
          {/* Weekdays Header */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            {(startOfWeekPref === 'monday' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : WEEKDAYS).map(day => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 aspect-[1.4/1] sm:aspect-auto">
            {cells.map((cell, idx) => {
              const { dateStr, dayNumber, isCurrentMonth } = cell

              if (!isCurrentMonth || !dateStr) {
                return (
                  <div
                    key={`pad-${idx}`}
                    className="aspect-[1.4/1] bg-slate-50/10 dark:bg-zinc-900/20 border border-slate-100/40 dark:border-zinc-900/30 text-slate-300 dark:text-zinc-750 flex flex-col justify-start p-1 rounded-lg select-none opacity-20 pointer-events-none"
                  >
                    <span className="text-[10px] font-mono">{dayNumber}</span>
                  </div>
                )
              }

              const isToday = dateStr === todayStr
              const cellLogs = logsByDate.get(dateStr) || []
              const cellNote = notesByDate.get(dateStr)
              const completions = cellLogs.filter(
                l => l.status !== 'skipped' && l.status !== 'reminder'
              )
              const marathiEvents = getEventsForDate(dateStr)

              return (
                <button
                  key={dateStr}
                  onClick={() => onDayClick(dateStr)}
                  className={`aspect-[1.4/1] flex flex-col justify-between p-1.5 rounded-xl transition-all relative group cursor-pointer focus:outline-hidden ${getDensityBackground(dateStr)} ${
                    isToday 
                      ? 'ring-2 ring-slate-800 dark:ring-slate-200 border border-slate-850 dark:border-slate-150 scale-[1.01] z-10 shadow-xs' 
                      : ''
                  }`}
                  title={marathiEvents.length > 0 ? marathiEvents.map(e => e.title).join(', ') : undefined}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className={`text-[10px] font-mono font-black ${
                      isToday 
                        ? 'text-slate-900 dark:text-white font-extrabold' 
                        : 'text-slate-650 dark:text-zinc-400'
                    }`}>
                      {dayNumber}
                    </span>

                    <div className="flex items-center gap-0.5">
                      {marathiEvents.length > 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"
                          title={marathiEvents.map(e => e.title).join(', ')}
                        />
                      )}
                      {cellNote && (
                        <BookOpen
                          size={10}
                          className="text-amber-500 dark:text-amber-450 fill-amber-500/10"
                        />
                      )}
                    </div>
                  </div>

                  {completions.length > 0 && (
                    <div className="w-full flex flex-wrap gap-0.5 mt-auto items-center justify-start overflow-hidden max-h-4">
                      {completions.slice(0, 3).map(log => {
                        const template = templates.find(t => t.id === log.activityId)
                        const color = template?.color || 'zinc'
                        return (
                          <span
                            key={log.id}
                            className={`w-1 h-1 rounded-full ${getTailwindColorClass(color)}`}
                          />
                        )
                      })}
                      {completions.length > 3 && (
                        <span className="text-[6px] text-slate-500 font-black">
                          +{completions.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. WEEK VIEW */}
      {/* ---------------------------------------------------- */}
      {view === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDaysList.map((day, idx) => {
            const dateStr = day.toISOString().split('T')[0]
            const isToday = dateStr === todayStr
            const dayName = WEEKDAYS[day.getDay()]
            const dayNum = day.getDate()
            const dayTimeline = getTimelineForDate(dateStr)
            const completionsCount = dayTimeline.filter(o => o.completed).length

            return (
              <button
                key={dateStr}
                onClick={() => onDayClick(dateStr)}
                className={`flex flex-col min-h-[100px] p-2 bg-[var(--color-bg-base)] border rounded-xl hover:shadow-3xs text-left transition-all cursor-pointer ${
                  isToday 
                    ? 'border-slate-800 dark:border-slate-200 ring-1 ring-slate-800 dark:ring-slate-200 bg-slate-50/10' 
                    : 'border-[var(--color-border)] dark:border-zinc-850'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-850 pb-1.5 w-full">
                  <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase">{dayName}</span>
                  <span className={`text-xs font-black font-mono px-1.5 py-0.5 rounded-md ${
                    isToday ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-main)]'
                  }`}>{dayNum}</span>
                </div>

                <div className="flex-1 w-full mt-2 space-y-1 overflow-y-auto max-h-[100px]">
                  {dayTimeline.length === 0 ? (
                    <div className="text-[9px] text-[var(--color-text-muted)] italic py-2">Clear</div>
                  ) : (
                    dayTimeline.slice(0, 5).map(o => (
                      <div 
                        key={o.id}
                        className={`text-[9px] font-bold py-0.5 px-1.5 rounded-md truncate ${
                          o.completed 
                            ? 'line-through text-slate-400 bg-emerald-500/5 border border-emerald-500/10' 
                            : o.type === 'MEETING'
                              ? 'bg-blue-500/10 text-blue-600 border border-blue-500/15'
                              : 'bg-purple-500/10 text-purple-600 border border-purple-500/15'
                        }`}
                      >
                        {o.templateName}
                      </div>
                    ))
                  )}
                  {dayTimeline.length > 5 && (
                    <div className="text-[8px] font-black text-slate-400 text-center">
                      +{dayTimeline.length - 5} more
                    </div>
                  )}
                </div>
                {completionsCount > 0 && (
                  <div className="text-[8px] font-extrabold text-emerald-500 mt-2 self-end">
                    ✓ {completionsCount} Done
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. AGENDA VIEW */}
      {/* ---------------------------------------------------- */}
      {view === 'agenda' && (() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const getRelativeLabel = (day: Date): string => {
          const target = new Date(day)
          target.setHours(0, 0, 0, 0)
          const diffMs = target.getTime() - today.getTime()
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
          if (diffDays === 0) return 'TODAY'
          if (diffDays === 1) return 'TOMORROW'
          if (diffDays < 0) return `${Math.abs(diffDays)}d ago`
          return `In ${diffDays} days`
        }

        // Pre-compute day data, filtering out empty days
        const agendaDays = agendaDaysList.map(day => {
          const dateStr = day.toISOString().split('T')[0]
          return {
            day,
            dateStr,
            isToday: dateStr === todayStr,
            dayTimeline: getTimelineForDate(dateStr),
            note: notesByDate.get(dateStr),
            marathi: getEventsForDate(dateStr),
          }
        })

        const nonEmptyDays = agendaDays.filter(
          d => d.dayTimeline.length > 0 || d.note || d.marathi.length > 0
        )

        // All-empty fallback
        if (nonEmptyDays.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-850 flex items-center justify-center mb-3">
                <BookOpen size={18} className="text-slate-350 dark:text-zinc-600" />
              </div>
              <p className="text-sm font-bold text-[var(--color-text-muted)]">No events for the next 14 days</p>
              <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">Your schedule is clear. Click any date to add activities.</p>
            </div>
          )
        }

        return (
          <div className="flex flex-col gap-6 max-w-xl mx-auto py-2">
            {nonEmptyDays.map(({ day, dateStr, isToday, dayTimeline, note, marathi }) => {
              const headerLabel = day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
              const relativeLabel = getRelativeLabel(day)

              return (
                <div key={dateStr} className="flex flex-col">
                  {/* ── Date section header ── */}
                  <button
                    onClick={() => onDayClick(dateStr)}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors group ${
                      isToday
                        ? 'border-l-[3px] border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-l-[3px] border-l-transparent hover:bg-slate-50/60 dark:hover:bg-zinc-900/40'
                    }`}
                  >
                    <span className={`text-[13px] font-extrabold tracking-tight ${
                      isToday ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--color-text-main)]'
                    }`}>
                      {headerLabel}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      isToday
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-zinc-850 text-slate-450 dark:text-zinc-500'
                    }`}>
                      {relativeLabel}
                    </span>
                  </button>

                  {/* ── Marathi / festival events ── */}
                  {marathi.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-4">
                      {marathi.map((m, i) => (
                        <span key={i} className="px-2 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-bold rounded-md">
                          {m.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* ── Event rows ── */}
                  {dayTimeline.length > 0 && (
                    <div className="flex flex-col gap-1 mt-2 ml-4">
                      {dayTimeline.map(o => (
                        <div
                          key={o.id}
                          className={`flex items-center justify-between py-1.5 px-3 rounded-lg transition-colors hover:bg-slate-50/70 dark:hover:bg-zinc-900/30 ${
                            o.completed ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              o.completed ? 'bg-emerald-500' : o.type === 'MEETING' ? 'bg-blue-500' : 'bg-purple-500'
                            }`} />
                            <span className={`text-xs font-semibold truncate ${
                              o.completed
                                ? 'line-through text-slate-400 dark:text-zinc-600'
                                : 'text-[var(--color-text-main)]'
                            }`}>
                              {o.templateName}
                            </span>
                          </div>
                          {o.isAllDay ? (
                            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-600 bg-slate-100 dark:bg-zinc-850 px-1.5 py-0.5 rounded shrink-0 ml-3">
                              All Day
                            </span>
                          ) : o.start ? (
                            <span className="text-[11px] font-mono text-slate-450 dark:text-zinc-550 shrink-0 ml-3">
                              {new Date(o.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Notes indicator ── */}
                  {note && (
                    <div className="mt-2 ml-4 flex items-center gap-2 py-1 px-3 border-l-2 border-amber-400 dark:border-amber-500/60">
                      <BookOpen size={12} className="text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 truncate">
                        {note.title || 'Note details logged'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Calendar Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-zinc-850 pt-4 text-[10px] text-slate-400 dark:text-zinc-500 font-semibold">
        <div className="flex items-center gap-1.5">
          <span>Less active</span>
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800" />
            <span className="w-2.5 h-2.5 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800" />
            <span className="w-2.5 h-2.5 rounded bg-blue-50/60 dark:bg-zinc-850 border border-blue-100/70 dark:border-zinc-800" />
            <span className="w-2.5 h-2.5 rounded bg-blue-100/60 dark:bg-zinc-800 border border-blue-200/70 dark:border-zinc-700" />
            <span className="w-2.5 h-2.5 rounded bg-blue-200/60 dark:bg-zinc-700 border border-blue-300/70 dark:border-zinc-700" />
          </div>
          <span>More active</span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 dark:text-zinc-550">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span>Local Activity</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>Calendar Sync</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span>Panchang/Festival</span>
          </div>
        </div>
      </div>

    </Card>
  )
}

