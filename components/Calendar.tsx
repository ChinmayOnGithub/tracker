"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis, TimelineItem } from '@/types'
import { ChevronLeft, ChevronRight, BookOpen, Calendar as CalendarIcon } from 'lucide-react'
import { getEventsForDate } from '@/lib/marathiCalendar'
import { Card, Button } from '@/design-system'
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
  templates: _templates,
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
  const startOfWeekPref = typeof window !== 'undefined' && localStorage.getItem('calendar_start_of_week') === 'monday' ? 'monday' : 'sunday'
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const handlePrev = () => {
    if (view === 'month') setCurrentDate(new Date(year, month - 1, 1))
    else if (view === 'week') {
      const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d)
    } else {
      const d = new Date(currentDate); d.setDate(d.getDate() - 14); setCurrentDate(d)
    }
  }

  const handleNext = () => {
    if (view === 'month') setCurrentDate(new Date(year, month + 1, 1))
    else if (view === 'week') {
      const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d)
    } else {
      const d = new Date(currentDate); d.setDate(d.getDate() + 14); setCurrentDate(d)
    }
  }

  const handleResetToToday = () => setCurrentDate(new Date())

  const getTimelineForDate = (dateStr: string): TimelineItem[] => {
    const allGoogleEvents = [
      ...(calendarData?.agenda?.today || []),
      ...(calendarData?.agenda?.tomorrow || []),
      ...(calendarData?.agenda?.upcoming || [])
    ]
    const dailyCalendarEvents = allGoogleEvents.filter(e => e.start?.split('T')[0] === dateStr)
    return generateTimeline(analyzedTemplates, logs, dateStr, dailyCalendarEvents)
  }

  // Month cells
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDayIndex = new Date(year, month, 1).getDay()
  const cells: { dateStr: string | null; dayNumber: number | null; isCurrentMonth: boolean }[] = []
  const prevMonthDays = new Date(year, month, 0).getDate()
  
  const startDayOffset = startOfWeekPref === 'monday' 
    ? (startDayIndex === 0 ? 6 : startDayIndex - 1)
    : startDayIndex

  for (let i = startDayOffset - 1; i >= 0; i--) {
    cells.push({ dateStr: null, dayNumber: prevMonthDays - i, isCurrentMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ dateStr: dStr, dayNumber: day, isCurrentMonth: true })
  }
  const remainingCells = (7 - (cells.length % 7)) % 7
  for (let i = 1; i <= remainingCells; i++) {
    cells.push({ dateStr: null, dayNumber: i, isCurrentMonth: false })
  }

  const logsByDate = new Map<string, ActivityLog[]>()
  logs.forEach(log => {
    if (!logsByDate.has(log.date)) logsByDate.set(log.date, [])
    logsByDate.get(log.date)!.push(log)
  })

  const notesByDate = new Map<string, Note>()
  notes.forEach(n => notesByDate.set(n.date.split('T')[0], n))



  // Week & Agenda prep
  const startOfWeek = new Date(currentDate)
  const currentDay = currentDate.getDay()
  if (startOfWeekPref === 'monday') {
    startOfWeek.setDate(currentDate.getDate() + (currentDay === 0 ? -6 : 1 - currentDay))
  } else {
    startOfWeek.setDate(currentDate.getDate() - currentDay)
  }
  
  const weekDaysList = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return d
  })
  
  const agendaDaysList = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(currentDate); d.setDate(currentDate.getDate() + i); return d
  })

  const monthName = currentDate.toLocaleString('default', { month: 'long' })

  return (
    <Card className="p-4 md:p-6 flex flex-col gap-6 bg-[var(--color-bg-surface)] border-[var(--color-border)] shadow-xs">
      
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-text-main)] flex items-center gap-1.5 leading-none">
            {monthName} <span className="text-[var(--color-text-muted)] font-bold">{year}</span>
          </h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 font-bold uppercase tracking-wider">
            {view === 'month' ? 'Month Overview' : view === 'week' ? '7-Day Schedule' : 'Upcoming Agenda'}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* iOS-style Segmented Control */}
          <div className="flex bg-slate-100 dark:bg-zinc-800/60 p-0.5 rounded-[9px] shadow-inner">
            {(['month', 'week', 'agenda'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3.5 py-1.5 text-[11px] font-bold rounded-md transition-all duration-200 capitalize ${
                  view === v 
                    ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              onClick={handleResetToToday}
              variant="outline"
              size="sm"
            >
              Today
            </Button>
            <div className="flex bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-0.5 shadow-xs">
              <Button variant="ghost" size="sm" onClick={handlePrev} className="p-1"><ChevronLeft size={16} /></Button>
              <Button variant="ghost" size="sm" onClick={handleNext} className="p-1"><ChevronRight size={16} /></Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 1. MONTH VIEW ── */}
      {view === 'month' && (
        <div className="space-y-2">
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
            {(startOfWeekPref === 'monday' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : WEEKDAYS).map(day => (
              <div key={day} className="py-2">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-t border-l border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-950 shadow-xs">
            {cells.map((cell, idx) => {
              const { dateStr, dayNumber, isCurrentMonth } = cell
              if (!isCurrentMonth || !dateStr) {
                return (
                  <div key={`pad-${idx}`} className="aspect-square sm:aspect-auto sm:min-h-[90px] border-r border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 p-2 opacity-40">
                    <span className="text-[11px] font-bold text-slate-400">{dayNumber}</span>
                  </div>
                )
              }

              const isToday = dateStr === todayStr
              const cellTimeline = getTimelineForDate(dateStr)
              const cellNote = notesByDate.get(dateStr)
              const marathiEvents = getEventsForDate(dateStr)

              return (
                <button
                  key={dateStr}
                  onClick={() => onDayClick(dateStr)}
                  className={`aspect-square sm:aspect-auto sm:min-h-[90px] p-2 border-r border-b border-slate-200 dark:border-zinc-800 flex flex-col transition-colors focus:outline-hidden hover:bg-slate-50 dark:hover:bg-zinc-900/80 group ${
                    isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'bg-white dark:bg-zinc-950'
                  }`}
                >
                  <div className="w-full flex justify-center sm:justify-between items-start">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
                      isToday ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-[var(--color-text-main)] group-hover:bg-slate-200 dark:group-hover:bg-zinc-800'
                    }`}>
                      {dayNumber}
                    </span>
                    <div className="hidden sm:flex items-center gap-1">
                      {marathiEvents.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                      {cellNote && <BookOpen size={10} className="text-amber-500" />}
                    </div>
                  </div>

                  {/* Desktop Event Dots */}
                  <div className="hidden sm:flex w-full flex-col gap-0.5 mt-1 overflow-hidden">
                    {cellTimeline.slice(0, 3).map(o => (
                      <div key={o.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${
                        o.completed ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400 line-through' : 'bg-slate-100 dark:bg-zinc-800 text-[var(--color-text-main)]'
                      }`}>
                        {o.templateName}
                      </div>
                    ))}
                    {cellTimeline.length > 3 && (
                      <span className="text-[9px] font-bold text-slate-400 px-1">+ {cellTimeline.length - 3} more</span>
                    )}
                  </div>
                  
                  {/* Mobile Event Dots */}
                  <div className="flex sm:hidden w-full flex-wrap gap-0.5 justify-center mt-auto pb-1">
                    {cellTimeline.slice(0, 3).map(o => <span key={o.id} className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700" />)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2. WEEK VIEW ── */}
      {view === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-slate-200 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
          {weekDaysList.map((day) => {
            const dateStr = day.toISOString().split('T')[0]
            const isToday = dateStr === todayStr
            const dayTimeline = getTimelineForDate(dateStr)

            return (
              <button
                key={dateStr}
                onClick={() => onDayClick(dateStr)}
                className={`flex flex-col min-h-[250px] p-3 text-left transition-colors focus:outline-hidden ${
                  isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900'
                }`}
              >
                <div className="flex flex-col items-center pb-3 mb-3 border-b border-slate-100 dark:border-zinc-850">
                  <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider">{WEEKDAYS[day.getDay()]}</span>
                  <span className={`text-lg font-black tabular-nums mt-1 w-8 h-8 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-[var(--color-text-main)]'
                  }`}>{day.getDate()}</span>
                </div>
                
                <div className="flex-1 w-full space-y-1.5 overflow-y-auto">
                  {dayTimeline.length === 0 ? (
                    <div className="text-[10px] text-[var(--color-text-muted)] italic text-center pt-2">No events</div>
                  ) : (
                    dayTimeline.map(o => (
                      <div key={o.id} className={`text-[10px] font-bold py-1 px-2 rounded-md leading-tight ${
                        o.completed 
                          ? 'bg-slate-50 dark:bg-zinc-900 text-slate-400 line-through'
                          : o.type === 'MEETING'
                            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                            : 'bg-slate-100 dark:bg-zinc-800 text-[var(--color-text-main)]'
                      }`}>
                        {o.templateName}
                      </div>
                    ))
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── 3. AGENDA VIEW ── */}
      {view === 'agenda' && (() => {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const getRelativeLabel = (day: Date): string => {
          const target = new Date(day); target.setHours(0, 0, 0, 0)
          const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays === 0) return 'Today'
          if (diffDays === 1) return 'Tomorrow'
          return day.toLocaleDateString(undefined, { weekday: 'long' })
        }

        const agendaDays = agendaDaysList.map(day => {
          const dateStr = day.toISOString().split('T')[0]
          return {
            day, dateStr, isToday: dateStr === todayStr,
            dayTimeline: getTimelineForDate(dateStr),
            note: notesByDate.get(dateStr),
            marathi: getEventsForDate(dateStr),
          }
        })
        const nonEmptyDays = agendaDays.filter(d => d.dayTimeline.length > 0 || d.note || d.marathi.length > 0)

        if (nonEmptyDays.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50/50 dark:bg-zinc-900/30 rounded-xl border border-slate-100 dark:border-zinc-850">
              <div className="w-12 h-12 rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center mb-4 shadow-sm border border-slate-200 dark:border-zinc-700">
                <CalendarIcon size={20} className="text-slate-400" />
              </div>
              <p className="text-base font-bold text-[var(--color-text-main)]">No upcoming events</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">Your schedule is clear for the next 14 days.</p>
            </div>
          )
        }

        return (
          <div className="flex flex-col gap-0 max-w-2xl mx-auto py-2 relative">
            <div className="absolute left-[31px] top-4 bottom-4 w-px bg-slate-200 dark:bg-zinc-800 z-0" />
            {nonEmptyDays.map(({ day, dateStr, isToday, dayTimeline, note, marathi }) => {
              return (
                <div key={dateStr} className="relative flex items-start gap-4 py-4 group z-10">
                  <div className="w-16 pt-0.5 text-right shrink-0">
                    <div className={`text-xs font-black uppercase tracking-wide ${isToday ? 'text-[var(--color-primary)]' : 'text-slate-400 dark:text-zinc-500'}`}>
                      {day.toLocaleDateString(undefined, { month: 'short' })}
                    </div>
                    <div className={`text-xl font-black tabular-nums leading-none mt-1 ${isToday ? 'text-[var(--color-text-main)]' : 'text-[var(--color-text-main)]'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                  
                  <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 border-2 bg-[var(--color-bg-surface)] ${isToday ? 'border-[var(--color-primary)] shadow-[0_0_8px_rgba(0,122,255,0.4)]' : 'border-slate-300 dark:border-zinc-600 group-hover:border-slate-400 dark:group-hover:border-zinc-500 transition-colors'}`} />
                  
                  <button onClick={() => onDayClick(dateStr)} className="flex-1 flex flex-col gap-2 text-left bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 shadow-xs hover:shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">{getRelativeLabel(day)}</span>
                      {marathi.map((m, i) => <span key={i} className="text-[9px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">{m.title}</span>)}
                    </div>
                    
                    {dayTimeline.map(o => (
                      <div key={o.id} className="flex items-center gap-3">
                        <div className={`w-1 h-1 rounded-full ${o.completed ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-zinc-600'}`} />
                        <span className={`text-sm font-semibold truncate ${o.completed ? 'line-through text-slate-400' : 'text-[var(--color-text-main)]'}`}>
                          {o.templateName}
                        </span>
                        {o.isAllDay ? (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-zinc-850 px-1.5 py-0.5 rounded ml-auto">All Day</span>
                        ) : o.start ? (
                          <span className="text-[11px] font-mono text-slate-500 ml-auto">{new Date(o.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        ) : null}
                      </div>
                    ))}
                    
                    {note && (
                      <div className="flex items-center gap-2 mt-1 py-1.5 px-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                        <BookOpen size={12} className="text-amber-600 dark:text-amber-500" />
                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 truncate">{note.title || 'Journal entry'}</span>
                      </div>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })()}
    </Card>
  )
}

