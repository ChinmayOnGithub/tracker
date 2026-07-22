"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis, TimelineItem } from '@/types'
import { ChevronLeft, ChevronRight, BookOpen, Briefcase } from 'lucide-react'
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
  const [view, setView] = useState<'month' | 'week'>(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('calendar_default_view')
      if (val === 'month' || val === 'week') return val
    }
    return 'month'
  })
  const startOfWeekPref = typeof window !== 'undefined' && localStorage.getItem('calendar_start_of_week') === 'monday' ? 'monday' : 'sunday'
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const handlePrev = () => {
    if (view === 'month') setCurrentDate(new Date(year, month - 1, 1))
    else {
      const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d)
    }
  }

  const handleNext = () => {
    if (view === 'month') setCurrentDate(new Date(year, month + 1, 1))
    else {
      const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d)
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
  

  // Find Work Tracker template and compute stats for the current view
  const workTemplate = _templates.find(t => t.name === 'Work Tracker')
  const workTemplateId = workTemplate?.id
  
  const getWorkStats = () => {
    if (!workTemplateId) return null
    
    let targetDates: string[] = []
    let rangeLabel = ''
    
    if (view === 'week') {
      targetDates = weekDaysList.map(d => d.toISOString().split('T')[0])
      const startLabel = weekDaysList[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const endLabel = weekDaysList[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      rangeLabel = `${startLabel} – ${endLabel}`
    } else {
      targetDates = cells.map(c => c.dateStr).filter((d): d is string => !!d)
      rangeLabel = `${currentDate.toLocaleString('default', { month: 'short' })} ${year}`
    }
    
    const rangeLogs = logs.filter(l => l.activityId === workTemplateId && targetDates.includes(l.date))
    
    const officeHours = rangeLogs
      .filter(l => l.status === 'done')
      .reduce((sum, l) => sum + (l.amount ?? 0), 0)
      
    const wfhHours = rangeLogs
      .filter(l => l.status === 'wfh')
      .reduce((sum, l) => sum + (l.amount ?? 0), 0)
      
    const weeklyGoal = 27
    const remaining = Math.max(0, weeklyGoal - officeHours)
    const goalMet = officeHours >= weeklyGoal
    
    return {
      officeHours,
      wfhHours,
      rangeLabel,
      remaining,
      goalMet
    }
  }

  const workStats = getWorkStats()

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
            {(['month', 'week'] as const).map(v => (
              <button
                key={v}
                onClick={() => {
                  setView(v)
                  localStorage.setItem('calendar_default_view', v)
                }}
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

      {/* Weekly Work Hours Tracker Summary banner */}
      {workStats && (
        <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Briefcase size={14} className="shrink-0" />
            <span>
              Work Summary ({workStats.rangeLabel}): Office <span className="font-extrabold">{workStats.officeHours}h</span> / 27h
              {workStats.wfhHours > 0 && <> + WFH <span className="font-extrabold">{workStats.wfhHours}h</span></>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={workStats.goalMet ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-slate-500 dark:text-zinc-400'}>
              {workStats.goalMet ? '🎉 Weekly Goal Met!' : `${workStats.remaining.toFixed(1)}h remaining`}
            </span>
            <div className="w-24 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full ${workStats.goalMet ? 'bg-emerald-500' : 'bg-blue-500'} rounded-full`}
                style={{ width: `${Math.min(100, (workStats.officeHours / 27) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

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

    </Card>
  )
}

