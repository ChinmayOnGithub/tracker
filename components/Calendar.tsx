"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis } from '@/types'
import { ChevronLeft, ChevronRight, Briefcase, RefreshCw } from 'lucide-react'
import { getEventsForDate } from '@/lib/marathiCalendar'
import { Card, Button } from '@/design-system'
import { CalendarMonthSummaryDTO } from '@/modules/calendar/dto/CalendarMonthSummaryDTO'
import { CalendarWeekDTO, CalendarWeekEventDTO } from '@/modules/calendar/dto/CalendarWeekDTO'
import { checkGoogleConnection, syncCalendarAction } from '@/modules/sync/google-calendar/actions'

interface TestAnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface CalendarProps {
  logs: ActivityLog[]
  templates: ActivityTemplate[]
  notes: Note[]
  calendarData?: unknown
  todayStr?: string
  analyzedTemplates?: TestAnalyzedTemplate[]
  onDayClick: (dateStr: string) => void
  selectedDateStr?: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 17 }).map((_, i) => i + 6) // 6 AM to 10 PM

export const Calendar: React.FC<CalendarProps> = ({
  logs,
  templates: _templates,
  todayStr = '',
  onDayClick,
  selectedDateStr,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [settingsVer, setSettingsVer] = useState(0)

  useEffect(() => {
    const handleSettingsChange = () => setSettingsVer(v => v + 1)
    window.addEventListener('personal_settings_changed', handleSettingsChange)
    return () => window.removeEventListener('personal_settings_changed', handleSettingsChange)
  }, [])
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('calendar_default_view')
      if (val === 'month' || val === 'week') {
        setTimeout(() => setView(val), 0)
      }
    }
  }, [])
  
  const startOfWeekPref = typeof window !== 'undefined' && localStorage.getItem('calendar_start_of_week') === 'monday' ? 'monday' : 'sunday'
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // API State
  const [monthSummaries, setMonthSummaries] = useState<CalendarMonthSummaryDTO[]>([])
  const [weekData, setWeekData] = useState<CalendarWeekDTO | null>(null)
  const [loading, setLoading] = useState(false)

  // Sync state
  const [googleConnected, setGoogleConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  useEffect(() => {
    checkGoogleConnection().then(res => {
      if (res.success && res.connected) {
        setGoogleConnected(true)
        if (res.updatedAt) {
          setLastSynced(new Date(res.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        }
      }
    })
  }, [])

  const handleManualSync = async () => {
    try {
      setSyncing(true)
      const res = await syncCalendarAction()
      if (res.success) {
        setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        setCurrentDate(prev => new Date(prev))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }

  // Calculate start of week Date
  const startOfWeekDate = useMemo(() => {
    const start = new Date(currentDate)
    const currentDay = currentDate.getDay()
    if (startOfWeekPref === 'monday') {
      start.setDate(currentDate.getDate() + (currentDay === 0 ? -6 : 1 - currentDay))
    } else {
      start.setDate(currentDate.getDate() - currentDay)
    }
    return start
  }, [currentDate, startOfWeekPref])

  const weekDaysList = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeekDate); d.setDate(startOfWeekDate.getDate() + i); return d
    })
  }, [startOfWeekDate])

  // Sync state with date/view changes using isolated async load inside effect to avoid setState-in-effect warning
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        if (view === 'month') {
          const res = await fetch(`/api/calendar/month?year=${year}&month=${month + 1}`)
          const json = await res.json()
          if (active && json.success) {
            setMonthSummaries(json.data)
          }
        } else {
          const startStr = `${startOfWeekDate.getFullYear()}-${String(startOfWeekDate.getMonth() + 1).padStart(2, '0')}-${String(startOfWeekDate.getDate()).padStart(2, '0')}`
          const res = await fetch(`/api/calendar/week?startOfWeek=${startStr}`)
          const json = await res.json()
          if (active && json.success) {
            setWeekData(json.data)
          }
        }
      } catch (err) {
        console.error('Failed to fetch calendar data:', err)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [view, currentDate, startOfWeekDate, year, month])

  const handlePrev = () => {
    if (view === 'month') {
      setCurrentDate(new Date(year, month - 1, 1))
    } else {
      const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d)
    }
  }

  const handleNext = () => {
    if (view === 'month') {
      setCurrentDate(new Date(year, month + 1, 1))
    } else {
      const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d)
    }
  }

  const handleResetToToday = () => {
    setCurrentDate(new Date())
    if (todayStr && onDayClick) {
      onDayClick(todayStr)
    }
  }

  // Memoized month grid cell setup to resolve dependencies changing on every render
  const cells = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startDayIndex = new Date(year, month, 1).getDay()
    const tempCells: { dateStr: string | null; dayNumber: number | null; isCurrentMonth: boolean }[] = []
    const prevMonthDays = new Date(year, month, 0).getDate()
    
    const startDayOffset = startOfWeekPref === 'monday' 
      ? (startDayIndex === 0 ? 6 : startDayIndex - 1)
      : startDayIndex

    for (let i = startDayOffset - 1; i >= 0; i--) {
      tempCells.push({ dateStr: null, dayNumber: prevMonthDays - i, isCurrentMonth: false })
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      tempCells.push({ dateStr: dStr, dayNumber: day, isCurrentMonth: true })
    }
    const remainingCells = (7 - (tempCells.length % 7)) % 7
    for (let i = 1; i <= remainingCells; i++) {
      tempCells.push({ dateStr: null, dayNumber: i, isCurrentMonth: false })
    }
    return tempCells
  }, [year, month, startOfWeekPref])

  // Work Tracker statistics banner helper
  const workStats = useMemo(() => {
    const workTemplate = _templates.find(t => t.name === 'Work Tracker')
    if (!workTemplate) return null
    const workTemplateId = workTemplate.id

    let targetDates: string[] = []
    let rangeLabel = ''
    
    if (view === 'week') {
      targetDates = weekDaysList.map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      const startLabel = weekDaysList[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const endLabel = weekDaysList[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      rangeLabel = `${startLabel} – ${endLabel}`
    } else {
      targetDates = cells.map(c => c.dateStr).filter((d): d is string => !!d)
      rangeLabel = `${currentDate.toLocaleString('default', { month: 'short' })} ${year}`
    }
    
    const rangeLogs = logs.filter(l => l.activityId === workTemplateId && targetDates.includes(l.date))
    const officeHours = rangeLogs.filter(l => l.status === 'done').reduce((sum, l) => sum + (l.amount ?? 0), 0)
    const wfhHours = rangeLogs.filter(l => l.status === 'wfh').reduce((sum, l) => sum + (l.amount ?? 0), 0)
    const weeklyGoal = typeof window !== 'undefined' ? Number(localStorage.getItem('personal_weekly_goal') || '27') : 27
    const remaining = Math.max(0, weeklyGoal - officeHours)
    const goalMet = officeHours >= weeklyGoal
    
    return { officeHours, wfhHours, rangeLabel, remaining, goalMet, settingsVer }
  }, [logs, _templates, view, weekDaysList, cells, currentDate, year, settingsVer])

  // Helper to map event elements to absolute timeline grid offsets
  const getEventPosition = (event: CalendarWeekEventDTO) => {
    const sDate = new Date(event.start)
    const eDate = new Date(event.end)
    const startMinutes = sDate.getHours() * 60 + sDate.getMinutes()
    const endMinutes = eDate.getHours() * 60 + eDate.getMinutes()
    const gridStartMinutes = 6 * 60 // 6 AM
    const gridEndMinutes = 22 * 60 // 10 PM
    const totalGridMinutes = gridEndMinutes - gridStartMinutes

    const top = Math.max(0, ((startMinutes - gridStartMinutes) / totalGridMinutes) * 100)
    const height = Math.max(20, ((endMinutes - startMinutes) / totalGridMinutes) * 100)
    return { top: `${top}%`, height: `${height}%` }
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long' })

  return (
    <Card className="p-4 md:p-6 flex flex-col gap-6 bg-[var(--color-bg-surface)] border-[var(--color-border)] shadow-xs">
      
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-text-main)] flex items-center gap-2 leading-none">
            {monthName} <span className="text-[var(--color-text-muted)] font-bold">{year}</span>
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-[var(--color-primary)] shrink-0" />}
          </h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 font-bold uppercase tracking-wider">
            {view === 'month' ? 'Month Summary' : 'Week Schedule Planner'}
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
            {googleConnected && (
              <Button
                onClick={handleManualSync}
                variant="outline"
                size="sm"
                disabled={syncing}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync'}</span>
                {lastSynced && <span className="text-[9px] text-[var(--color-text-muted)] font-normal">({lastSynced})</span>}
              </Button>
            )}
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
                  <div key={`pad-${idx}`} className="aspect-square sm:aspect-auto sm:min-h-[100px] border-r border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 p-2 opacity-40">
                    <span className="text-[11px] font-bold text-slate-400">{dayNumber}</span>
                  </div>
                )
              }

              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDateStr
              const summary = monthSummaries.find(s => s.date === dateStr)
              const marathiEvents = getEventsForDate(dateStr)

              return (
                <button
                  key={dateStr}
                  onClick={() => onDayClick(dateStr)}
                  className={`aspect-square sm:aspect-auto sm:min-h-[100px] p-2 border-r border-b border-slate-200 dark:border-zinc-800 flex flex-col transition-colors focus:outline-hidden hover:bg-slate-50 dark:hover:bg-zinc-900/80 group ${
                    isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'bg-white dark:bg-zinc-950'
                  } ${
                    isSelected ? 'ring-2 ring-[var(--color-primary)] ring-inset bg-[var(--color-accent)]/30 dark:bg-[var(--color-accent)]/10' : ''
                  }`}
                >
                  <div className="w-full flex justify-between items-start">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
                      isToday ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-[var(--color-text-main)] group-hover:bg-slate-200 dark:group-hover:bg-zinc-800'
                    }`}>
                      {dayNumber}
                    </span>
                    <div className="hidden sm:flex items-center gap-1">
                      {marathiEvents.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" title={marathiEvents.map(e => e.title).join(', ')} />}
                    </div>
                  </div>

                  {/* Summary indicators */}
                  {summary && (
                    <div className="hidden sm:flex w-full flex-col gap-0.5 mt-1.5 text-[9px] text-slate-500 dark:text-zinc-400 font-bold text-left">
                      {summary.taskCount > 0 && (
                        <div className="flex items-center gap-1 text-[var(--color-text-main)]">
                          <span>📝</span>
                          <span>{summary.taskCount} {summary.taskCount === 1 ? 'Task' : 'Tasks'}</span>
                        </div>
                      )}
                      {summary.eventCount > 0 && (
                        <div className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
                          <span>📅</span>
                          <span>{summary.eventCount} {summary.eventCount === 1 ? 'Event' : 'Events'}</span>
                        </div>
                      )}
                      {summary.workedHours > 0 && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <span>💼</span>
                          <span>{summary.workedHours}h Worked</span>
                        </div>
                      )}
                      {summary.highestPriorityTask && (
                        <div className="flex items-center gap-1 text-red-500 dark:text-red-400 font-extrabold truncate" title={summary.highestPriorityTask.title}>
                          <span>⭐</span>
                          <span className="truncate">{summary.highestPriorityTask.title}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        {summary.hasJournal && <span title="Has Journal Entry" className="text-[10px]">📓</span>}
                        {summary.hasWeight && <span title="Has Weight Record" className="text-[10px]">⚖️</span>}
                        {summary.hasLeave && <span title="Leave Day" className="text-[10px]">🏖️</span>}
                      </div>
                    </div>
                  )}

                  {/* Mobile indicator dots */}
                  {summary && (
                    <div className="flex sm:hidden w-full flex-wrap gap-0.5 justify-center mt-auto">
                      {summary.taskCount > 0 && <span className="w-1 h-1 rounded-full bg-slate-400" />}
                      {summary.eventCount > 0 && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                      {summary.workedHours > 0 && <span className="w-1 h-1 rounded-full bg-emerald-500" />}
                      {summary.hasLeave && <span className="w-1 h-1 rounded-full bg-amber-500" />}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2. WEEK VIEW (HOURLY TIME-GRID) ── */}
      {view === 'week' && (
        <div className="flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-xs">
          
          {/* Day Headers (7 Columns + Left Time Column Buffer) */}
          <div className="grid grid-cols-8 border-b border-slate-200 dark:border-zinc-800 text-center bg-slate-50 dark:bg-zinc-900/60 py-2.5 font-bold uppercase tracking-wider text-[11px] text-slate-500 dark:text-zinc-400">
            {/* Hour column buffer */}
            <div className="text-[9px] flex items-center justify-center font-black">Time</div>
            
            {weekDaysList.map((day) => {
              const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDateStr
              const matchedDayDTO = weekData?.days.find(d => d.date === dateStr)
              
              return (
                <div key={dateStr} className="flex flex-col items-center">
                  <span className="text-[9px] opacity-75">{WEEKDAYS[day.getDay()]}</span>
                  <span className={`text-sm tabular-nums mt-0.5 w-7 h-7 flex items-center justify-center rounded-full leading-none ${
                    isToday ? 'bg-[var(--color-primary)] text-white font-extrabold shadow-xs' : 
                    isSelected ? 'bg-[var(--color-accent)] text-[var(--color-primary)] border border-[var(--color-primary)] font-bold shadow-xs' :
                    'text-[var(--color-text-main)]'
                  }`}>{day.getDate()}</span>
                  
                  {/* Worked hours summary in header */}
                  {matchedDayDTO && matchedDayDTO.workedHours > 0 && (
                    <span className="text-[8px] mt-0.5 font-bold px-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      💼 {matchedDayDTO.workedHours}h
                    </span>
                  )}
                  {matchedDayDTO && matchedDayDTO.isLeave && (
                    <span className="text-[8px] mt-0.5 font-bold px-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      🏖️ Leave
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Time-Grid Scroll Container */}
          <div className="flex-1 min-h-[480px] max-h-[700px] overflow-y-auto relative select-none">
            
            {/* Absolute positioning container for time grids */}
            <div className="grid grid-cols-8 relative" style={{ height: `${HOURS.length * 60}px` }}>
              
              {/* Left Column Hour Label Grid */}
              <div className="border-r border-slate-200 dark:border-zinc-800 flex flex-col h-full bg-slate-50/30 dark:bg-zinc-900/10 z-10">
                {HOURS.map((hour) => (
                  <div key={hour} className="h-[60px] text-right pr-2.5 text-[9px] font-bold text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-zinc-800/40 pt-1 leading-none select-none">
                    {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                  </div>
                ))}
              </div>

              {/* 7 Columns of Days */}
              {weekDaysList.map((day) => {
                const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
                const matchedDayDTO = weekData?.days.find(d => d.date === dateStr)
                const dayEvents = matchedDayDTO?.events || []
                
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDateStr
                return (
                  <div
                    key={dateStr}
                    className={`border-r border-slate-200 dark:border-zinc-800 h-full relative group transition-colors ${
                      isToday 
                        ? 'bg-blue-50/10 dark:bg-blue-900/5 hover:bg-blue-50/20 dark:hover:bg-blue-900/10' 
                        : isSelected
                          ? 'bg-[var(--color-accent)]/10'
                          : 'hover:bg-slate-50/20 dark:hover:bg-zinc-900/10'
                    }`}
                  >
                    {/* Hour cell borders */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        onClick={() => onDayClick(dateStr)}
                        className="h-[60px] border-b border-slate-100 dark:border-zinc-850 cursor-pointer"
                      />
                    ))}

                    {/* Events absolute overlay */}
                    {dayEvents.map((event) => {
                      const pos = getEventPosition(event)
                      
                      // Match colors or fallback to generic
                      const isTask = event.type === 'TASK'
                      const isLeave = event.type === 'LEAVE'
                      const colorClass = isLeave
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                        : isTask
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-400'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400'

                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onDayClick(dateStr)
                          }}
                          className={`absolute left-1 right-1 rounded-lg border px-1.5 py-1 text-[9px] font-bold overflow-hidden shadow-xs hover:shadow-sm cursor-pointer select-none transition-all ${colorClass}`}
                          style={{ top: pos.top, height: pos.height }}
                        >
                          <div className="truncate leading-tight">{event.title}</div>
                          <div className="text-[8px] opacity-75 mt-0.5">
                            {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
