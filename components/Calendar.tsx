"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis } from '@/types'
import { ChevronLeft, ChevronRight, Briefcase, RefreshCw } from 'lucide-react'
import { getEventsForDate } from '@/lib/marathiCalendar'
import { Card, Button } from '@/design-system'
import { CalendarMonthSummaryDTO } from '@/modules/calendar/dto/CalendarMonthSummaryDTO'
import { CalendarWeekDTO, CalendarWeekEventDTO } from '@/modules/calendar/dto/CalendarWeekDTO'
import { checkGoogleConnection, syncCalendarAction } from '@/modules/sync/google-calendar/actions'
import { updateCalendarEventAction } from '@/app/actions/calendar'
import { getWeekDates } from '@/lib/recurrence'
import { CalendarCacheService } from '@/modules/calendar/services/CalendarCacheService'
import { CalendarDataContext } from './DashboardLayout'
import {
  calculateContentOffsetY,
  timeToPixelOffset,
  durationToPixelHeight,
  calculateDragDestination,
  calculateResizeDestination,
  getCurrentTimeIndicatorPosition,
  DEFAULT_GRID_CONFIG,
} from '@/modules/calendar/utils/timeGrid'
import { toast } from 'sonner'

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
  const [refreshVer, setRefreshVer] = useState(0)

  // Current local time clock (ticking every 30s)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  // Auto-refresh when calendar mutations happen across the app
  useEffect(() => {
    const handleCalendarChanged = () => setRefreshVer(v => v + 1)
    window.addEventListener('calendar_data_changed', handleCalendarChanged)
    return () => window.removeEventListener('calendar_data_changed', handleCalendarChanged)
  }, [])

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
  const userTimezone = typeof window !== 'undefined'
    ? localStorage.getItem('personal_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    : 'UTC'
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // API State
  const [monthSummaries, setMonthSummaries] = useState<CalendarMonthSummaryDTO[]>([])
  const [weekData, setWeekData] = useState<CalendarWeekDTO | null>(null)
  const [loading, setLoading] = useState(false)

  // Drag & drop interaction state
  const [dragState, setDragState] = useState<{
    event: CalendarWeekEventDTO
    originDate: string
    targetDateStr: string
    offsetY: number
    previewStart: Date
    previewEnd: Date
    durationMs: number
  } | null>(null)

  // Resizing interaction state
  const [resizeState, setResizeState] = useState<{
    event: CalendarWeekEventDTO
    handle: 'top' | 'bottom'
    dateStr: string
    offsetY: number
    previewStart: Date
    previewEnd: Date
  } | null>(null)

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

  const calendarContext = React.useContext(CalendarDataContext)
  const userId = calendarContext?.currentUser?.id || 'anonymous'

  // Sync state with date/view changes using cache-first background-revalidation strategy
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (view === 'month') {
          // 1. Check cache first
          const { data: cachedMonth, isStale } = await CalendarCacheService.getCachedMonthSummary(userId, year, month + 1)
          if (cachedMonth && active) {
            setMonthSummaries(cachedMonth)
            setLoading(false)
            if (!isStale && refreshVer === 0) return // Warm & fresh: zero network request!
          } else if (active) {
            setLoading(true)
          }

          // 2. Background revalidation
          const res = await fetch(`/api/calendar/month?year=${year}&month=${month + 1}&timezone=${encodeURIComponent(userTimezone)}`)
          const json = await res.json()
          if (active && json.success) {
            setMonthSummaries(json.data)
            await CalendarCacheService.saveCachedMonthSummary(userId, year, month + 1, json.data)
          }
        } else {
          const startStr = `${startOfWeekDate.getFullYear()}-${String(startOfWeekDate.getMonth() + 1).padStart(2, '0')}-${String(startOfWeekDate.getDate()).padStart(2, '0')}`
          
          // 1. Check cache first
          const { data: cachedWeek, isStale } = await CalendarCacheService.getCachedWeekData(userId, startStr)
          if (cachedWeek && active) {
            setWeekData(cachedWeek)
            setLoading(false)
            if (!isStale && refreshVer === 0) return // Warm & fresh: zero network request!
          } else if (active) {
            setLoading(true)
          }

          // 2. Background revalidation
          const res = await fetch(`/api/calendar/week?startOfWeek=${startStr}&timezone=${encodeURIComponent(userTimezone)}`)
          const json = await res.json()
          if (active && json.success) {
            setWeekData(json.data)
            await CalendarCacheService.saveCachedWeekData(userId, startStr, json.data)
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
  }, [view, currentDate, startOfWeekDate, year, month, userId, refreshVer, userTimezone])

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
      const baseDateStr = selectedDateStr || todayStr
      targetDates = getWeekDates(baseDateStr, startOfWeekPref)
      const [y1, m1, d1] = targetDates[0].split('-').map(Number)
      const [y2, m2, d2] = targetDates[6].split('-').map(Number)
      const startD = new Date(y1, m1 - 1, d1)
      const endD = new Date(y2, m2 - 1, d2)
      const startLabel = startD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const endLabel = endD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      rangeLabel = `${startLabel} – ${endLabel}`
    }
    
    const rangeLogs = logs.filter(l => l.activityId === workTemplateId && targetDates.includes(l.date))
    const officeHours = rangeLogs.filter(l => l.status === 'done').reduce((sum, l) => sum + (l.amount ?? 0), 0)
    const wfhHours = rangeLogs.filter(l => l.status === 'wfh').reduce((sum, l) => sum + (l.amount ?? 0), 0)
    const weeklyGoal = typeof window !== 'undefined' ? Number(localStorage.getItem('personal_weekly_goal') || '27') : 27
    const remaining = Math.max(0, weeklyGoal - officeHours)
    const goalMet = officeHours >= weeklyGoal
    
    return { officeHours, wfhHours, rangeLabel, remaining, goalMet, weeklyGoal, settingsVer }
  }, [logs, _templates, view, weekDaysList, selectedDateStr, todayStr, startOfWeekPref, settingsVer])

  // Canonical time-grid mapping
  const getEventPosition = (event: CalendarWeekEventDTO) => {
    const topPx = timeToPixelOffset(event.start, DEFAULT_GRID_CONFIG, userTimezone)
    const heightPx = durationToPixelHeight(event.start, event.end, DEFAULT_GRID_CONFIG)
    return { top: `${Math.max(0, topPx)}px`, height: `${heightPx}px` }
  }

  const handleStartDrag = (
    e: React.PointerEvent,
    event: CalendarWeekEventDTO,
    dateStr: string
  ) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const sDate = new Date(event.start)
    const eDate = new Date(event.end)
    const durationMs = eDate.getTime() - sDate.getTime()

    setDragState({
      event,
      originDate: dateStr,
      targetDateStr: dateStr,
      offsetY: timeToPixelOffset(event.start, DEFAULT_GRID_CONFIG, userTimezone),
      previewStart: sDate,
      previewEnd: eDate,
      durationMs,
    })

    const gridContainer = (e.currentTarget as HTMLElement).closest<HTMLDivElement>('[data-calendar-grid="true"]')

    const onPointerMove = (moveEv: PointerEvent) => {
      let targetCol = dateStr
      if (gridContainer) {
        for (const day of weekDaysList) {
          const dStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
          const el = gridContainer.querySelector<HTMLDivElement>(`[data-column-date="${dStr}"]`)
          if (el) {
            const rect = el.getBoundingClientRect()
            if (moveEv.clientX >= rect.left && moveEv.clientX <= rect.right) {
              targetCol = dStr
              break
            }
          }
        }
      }

      const colEl = gridContainer?.querySelector<HTMLDivElement>(`[data-column-date="${targetCol}"]`)
      if (!colEl) return

      const colRect = colEl.getBoundingClientRect()
      const offsetY = calculateContentOffsetY(moveEv.clientY, colRect.top, 0)
      const destination = calculateDragDestination({
        originalStart: event.start,
        originalEnd: event.end,
        targetDateStr: targetCol,
        offsetY,
        config: DEFAULT_GRID_CONFIG,
      })

      if (destination.isValid) {
        setDragState({
          event,
          originDate: dateStr,
          targetDateStr: targetCol,
          offsetY,
          previewStart: destination.newStart,
          previewEnd: destination.newEnd,
          durationMs,
        })
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)

      setDragState(current => {
        if (!current) return null

        const hasChanged =
          current.targetDateStr !== current.originDate ||
          current.previewStart.toISOString() !== new Date(event.start).toISOString()

        if (hasChanged) {
          const previousWeekData = weekData
          // Optimistic update
          setWeekData(prev => {
            if (!prev) return prev
            const nextDays = prev.days.map(d => {
              if (d.date === current.originDate) {
                return { ...d, events: d.events.filter(ev => ev.id !== event.id) }
              }
              return d
            }).map(d => {
              if (d.date === current.targetDateStr) {
                const updatedEv: CalendarWeekEventDTO = {
                  ...event,
                  start: current.previewStart.toISOString(),
                  end: current.previewEnd.toISOString(),
                }
                return { ...d, events: [...d.events, updatedEv] }
              }
              return d
            })
            return { ...prev, days: nextDays }
          })

          // Async persist
          updateCalendarEventAction(event.id, {
            start: current.previewStart.toISOString(),
            end: current.previewEnd.toISOString(),
          }).then(res => {
            if (!res.success) {
              setWeekData(previousWeekData)
              toast.error(res.error || 'Failed to move event')
            } else {
              CalendarCacheService.invalidateAll(userId)
              window.dispatchEvent(new CustomEvent('calendar_data_changed'))
            }
          }).catch(err => {
            setWeekData(previousWeekData)
            toast.error('Failed to move event: ' + (err instanceof Error ? err.message : String(err)))
          })
        }

        return null
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const handleStartResize = (
    e: React.PointerEvent,
    event: CalendarWeekEventDTO,
    handle: 'top' | 'bottom',
    dateStr: string
  ) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const sDate = new Date(event.start)
    const eDate = new Date(event.end)

    setResizeState({
      event,
      handle,
      dateStr,
      offsetY: handle === 'top'
        ? timeToPixelOffset(event.start, DEFAULT_GRID_CONFIG, userTimezone)
        : timeToPixelOffset(event.end, DEFAULT_GRID_CONFIG, userTimezone),
      previewStart: sDate,
      previewEnd: eDate,
    })

    const gridContainer = (e.currentTarget as HTMLElement).closest<HTMLDivElement>('[data-calendar-grid="true"]')

    const onPointerMove = (moveEv: PointerEvent) => {
      const colEl = gridContainer?.querySelector<HTMLDivElement>(`[data-column-date="${dateStr}"]`)
      if (!colEl) return

      const colRect = colEl.getBoundingClientRect()
      const offsetY = calculateContentOffsetY(moveEv.clientY, colRect.top, 0)

      const destination = calculateResizeDestination({
        originalStart: event.start,
        originalEnd: event.end,
        handle,
        targetDateStr: dateStr,
        offsetY,
        config: DEFAULT_GRID_CONFIG,
      })

      if (destination.isValid) {
        setResizeState({
          event,
          handle,
          dateStr,
          offsetY,
          previewStart: destination.newStart,
          previewEnd: destination.newEnd,
        })
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)

      setResizeState(current => {
        if (!current) return null

        const hasChanged =
          current.previewStart.toISOString() !== new Date(event.start).toISOString() ||
          current.previewEnd.toISOString() !== new Date(event.end).toISOString()

        if (hasChanged) {
          const previousWeekData = weekData
          // Optimistic update
          setWeekData(prev => {
            if (!prev) return prev
            const nextDays = prev.days.map(d => {
              if (d.date === dateStr) {
                return {
                  ...d,
                  events: d.events.map(ev => {
                    if (ev.id === event.id) {
                      return {
                        ...ev,
                        start: current.previewStart.toISOString(),
                        end: current.previewEnd.toISOString(),
                      }
                    }
                    return ev
                  })
                }
              }
              return d
            })
            return { ...prev, days: nextDays }
          })

          // Async persist
          updateCalendarEventAction(event.id, {
            start: current.previewStart.toISOString(),
            end: current.previewEnd.toISOString(),
          }).then(res => {
            if (!res.success) {
              setWeekData(previousWeekData)
              toast.error(res.error || 'Failed to resize event')
            } else {
              CalendarCacheService.invalidateAll(userId)
              window.dispatchEvent(new CustomEvent('calendar_data_changed'))
            }
          }).catch(err => {
            setWeekData(previousWeekData)
            toast.error('Failed to resize event: ' + (err instanceof Error ? err.message : String(err)))
          })
        }

        return null
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long' })

  return (
    <Card className="p-2.5 sm:p-4 md:p-6 flex flex-col gap-4 sm:gap-6 bg-[var(--color-bg-surface)] border-[var(--color-border)] shadow-xs rounded-[22px] sm:rounded-2xl">
      
      {/* Calendar header — redesigned for compact mobile first use */}
      <div className="space-y-3 sm:space-y-0">
        {/* Mobile header */}
        <div className="sm:hidden space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[25px] font-black tracking-[-0.04em] text-[var(--color-text-main)] leading-none">
                  {monthName}
                </h2>
                <span className="text-[14px] font-semibold text-[var(--color-text-muted)]">{year}</span>
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />}
              </div>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                {view === 'month' ? 'Month' : 'Week schedule'}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {googleConnected && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing}
                  aria-label="Sync Google Calendar"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs transition active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={handleResetToToday}
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-[11px] font-bold text-[var(--color-text-main)] shadow-xs transition active:scale-95"
              >
                Today
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl bg-[var(--color-bg-subtle)] p-1 border border-[var(--color-border)]/70">
              {(['month', 'week'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v)
                    localStorage.setItem('calendar_default_view', v)
                  }}
                  className={`h-9 flex-1 rounded-xl px-3 text-[11px] font-bold capitalize transition-all ${
                    view === v
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-sm ring-1 ring-[var(--color-border)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-1 shadow-xs">
              <button type="button" onClick={handlePrev} aria-label="Previous" className="grid h-9 w-9 place-items-center rounded-xl text-[var(--color-text-main)] active:bg-[var(--color-bg-subtle)]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={handleNext} aria-label="Next" className="grid h-9 w-9 place-items-center rounded-xl text-[var(--color-text-main)] active:bg-[var(--color-bg-subtle)]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {selectedDateStr && (
            <button
              type="button"
              onClick={() => onDayClick(selectedDateStr)}
              className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-left shadow-xs active:scale-[0.99]"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                  Selected day
                </p>
                <p className="mt-0.5 text-sm font-bold text-[var(--color-text-main)]">
                  {new Date(`${selectedDateStr}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">Open details →</span>
            </button>
          )}
        </div>

        {/* Desktop header — existing controls preserved */}
        <div className="hidden sm:flex sm:items-center justify-between gap-4">
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
            <div className="flex bg-[var(--color-bg-subtle)]/50 p-0.5 border border-[var(--color-border)] rounded-[var(--radius-md)]">
              {(['month', 'week'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v)
                    localStorage.setItem('calendar_default_view', v)
                  }}
                  className={`px-3.5 py-2.5 md:py-1.5 text-[11px] font-bold rounded-[var(--radius-sm)] transition-all duration-200 capitalize cursor-pointer border ${
                    view === v
                      ? 'bg-[var(--color-accent)] border-[var(--color-border)] text-[var(--color-text-main)] shadow-xs'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
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
              <Button onClick={handleResetToToday} variant="outline" size="sm">Today</Button>
              <div className="flex bg-[var(--surface-muted)] border border-[var(--border)] rounded-[var(--radius-md)] p-0.5 shadow-xs">
                <Button variant="ghost" size="sm" onClick={handlePrev} className="p-0 w-11 h-11 md:w-auto md:h-auto md:p-1 flex items-center justify-center"><ChevronLeft size={16} /></Button>
                <Button variant="ghost" size="sm" onClick={handleNext} className="p-0 w-11 h-11 md:w-auto md:h-auto md:p-1 flex items-center justify-center"><ChevronRight size={16} /></Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Work Hours Tracker Summary banner */}
      {workStats && (
        <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-[var(--radius-lg)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Briefcase size={14} className="shrink-0" />
            <span>
              Work Summary ({workStats.rangeLabel}): Office <span className="font-extrabold">{workStats.officeHours}h</span> / {workStats.weeklyGoal}h
              {workStats.wfhHours > 0 && <> + WFH <span className="font-extrabold">{workStats.wfhHours}h</span></>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={workStats.goalMet ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-[var(--muted-foreground)]'}>
              {workStats.goalMet ? '🎉 Weekly Goal Met!' : `${workStats.remaining.toFixed(1)}h remaining`}
            </span>
            <div className="w-24 h-1.5 bg-[var(--border)] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full ${workStats.goalMet ? 'bg-emerald-500' : 'bg-blue-500'} rounded-full`}
                style={{ width: `${Math.min(100, (workStats.officeHours / workStats.weeklyGoal) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 1. MONTH VIEW ── */}
      {view === 'month' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-7 text-center text-[9px] sm:text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-[0.08em]">
            {(startOfWeekPref === 'monday' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : WEEKDAYS).map(day => (
              <div key={day} className="py-1.5 sm:py-2">{day.slice(0, 1)}<span className="hidden sm:inline">{day.slice(1)}</span></div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-t border-l border-[var(--color-border)]/60 rounded-2xl overflow-hidden bg-[var(--color-bg-surface)] shadow-sm">
            {cells.map((cell, idx) => {
              const { dateStr, dayNumber, isCurrentMonth } = cell
              if (!isCurrentMonth || !dateStr) {
                return (
                  <div key={`pad-${idx}`} className="aspect-square sm:aspect-auto sm:min-h-[100px] border-r border-b border-[var(--color-border)]/60 bg-[var(--color-bg-subtle)]/50 p-2 opacity-40">
                    <span className="text-[11px] font-bold text-[var(--color-text-muted)]">{dayNumber}</span>
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
                  className={`aspect-square sm:aspect-auto sm:min-h-[100px] p-2 border-r border-b border-[var(--color-border)]/60 flex flex-col transition-colors focus:outline-hidden hover:bg-[var(--color-accent)]/50 group cursor-pointer ${
                    isToday ? 'bg-[var(--color-primary)]/5' : 'bg-[var(--color-bg-surface)]'
                  } ${
                    isSelected ? 'ring-2 ring-[var(--color-primary)] ring-inset bg-[var(--color-accent)]/30' : ''
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
                    <div className="flex sm:hidden w-full flex-wrap gap-1 justify-center mt-auto pb-0.5">
                      {summary.taskCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
                      {summary.eventCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      {summary.workedHours > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                      {summary.hasLeave && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
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
        <div className="flex flex-col bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)]/60 overflow-hidden shadow-sm">
          
          {/* Day Headers (7 Columns + Left Time Column Buffer) */}
          <div className="overflow-x-auto">
            <div className="min-w-[780px]">
              <div className="grid grid-cols-8 border-b border-[var(--color-border)]/60 text-center bg-[var(--color-bg-subtle)]/60 py-2.5 font-bold uppercase tracking-wider text-[11px] text-[var(--color-text-muted)]">
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
          <div data-calendar-grid="true" className="flex-1 min-h-[480px] max-h-[700px] overflow-y-auto relative select-none overscroll-contain">
            
            {/* Absolute positioning container for time grids */}
            <div className="grid min-w-[780px] grid-cols-8 relative" style={{ height: `${HOURS.length * 60}px` }}>
              
              {/* Left Column Hour Label Grid */}
              <div className="border-r border-[var(--color-border)]/60 flex flex-col h-full bg-[var(--color-bg-subtle)]/30 z-10">
                {HOURS.map((hour) => (
                  <div key={hour} className="h-[60px] text-right pr-2.5 text-[9px] font-bold text-[var(--color-text-muted)] border-b border-[var(--color-border)]/40 pt-1 leading-none select-none">
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
                    data-column-date={dateStr}
                    className={`border-r border-[var(--color-border)]/60 h-full relative group transition-colors ${
                      isToday 
                        ? 'bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10' 
                        : isSelected
                          ? 'bg-[var(--color-accent)]/10'
                          : 'hover:bg-[var(--color-accent)]/5'
                    }`}
                  >
                    {/* Current-time Indicator Line */}
                    {(() => {
                      const indicator = getCurrentTimeIndicatorPosition({
                        columnDateStr: dateStr,
                        currentLocalDateStr: todayStr,
                        currentTime,
                        config: DEFAULT_GRID_CONFIG,
                      })
                      if (!indicator.isVisible) return null
                      return (
                        <div
                          data-testid="current-time-indicator"
                          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                          style={{ top: `${indicator.topPx}px` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.25 shadow-xs border border-white dark:border-zinc-900" />
                          <div className="flex-1 border-t-2 border-red-500 shadow-xs" />
                          <span className="text-[8px] font-bold bg-red-500 text-white px-1 py-0.5 rounded-xs leading-none ml-1 shadow-xs font-mono">
                            {indicator.timeLabel}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Drag preview overlay */}
                    {dragState && dragState.targetDateStr === dateStr && (
                      <div
                        className="absolute rounded-lg border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary)]/20 px-1.5 py-1 text-[9px] font-bold z-30 pointer-events-none shadow-md overflow-hidden"
                        style={{
                          top: `${timeToPixelOffset(dragState.previewStart, DEFAULT_GRID_CONFIG, userTimezone)}px`,
                          height: `${durationToPixelHeight(dragState.previewStart, dragState.previewEnd, DEFAULT_GRID_CONFIG)}px`,
                          left: '2px',
                          right: '2px',
                        }}
                      >
                        <div className="truncate text-[var(--color-primary)] font-extrabold">{dragState.event.title}</div>
                        <div className="text-[8px] opacity-90 mt-0.5 font-mono">
                          {dragState.previewStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} – {dragState.previewEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                      </div>
                    )}

                    {/* Resize preview overlay */}
                    {resizeState && resizeState.dateStr === dateStr && (
                      <div
                        className="absolute rounded-lg border-2 border-dashed border-indigo-500 bg-indigo-500/20 px-1.5 py-1 text-[9px] font-bold z-30 pointer-events-none shadow-md overflow-hidden"
                        style={{
                          top: `${timeToPixelOffset(resizeState.previewStart, DEFAULT_GRID_CONFIG, userTimezone)}px`,
                          height: `${durationToPixelHeight(resizeState.previewStart, resizeState.previewEnd, DEFAULT_GRID_CONFIG)}px`,
                          left: '2px',
                          right: '2px',
                        }}
                      >
                        <div className="truncate text-indigo-600 dark:text-indigo-400 font-extrabold">{resizeState.event.title}</div>
                        <div className="text-[8px] opacity-90 mt-0.5 font-mono">
                          {resizeState.previewStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} – {resizeState.previewEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                      </div>
                    )}

                    {/* Hour cell borders */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        onClick={() => onDayClick(dateStr)}
                        className="h-[60px] border-b border-[var(--color-border)]/40 cursor-pointer"
                      />
                    ))}

                    {/* Events absolute overlay */}
                    {(() => {
                      // Compute overlap columns for this day's events
                      type LayoutEvent = CalendarWeekEventDTO & { col: number; totalCols: number }
                      const laid: LayoutEvent[] = []
                      for (const ev of dayEvents) {
                        const evStart = new Date(ev.start).getTime()
                        const evEnd   = new Date(ev.end).getTime()
                        // Find which column slot this event fits into
                        const usedCols = laid
                          .filter(l => new Date(l.end).getTime() > evStart && new Date(l.start).getTime() < evEnd)
                          .map(l => l.col)
                        let col = 0
                        while (usedCols.includes(col)) col++
                        laid.push({ ...ev, col, totalCols: 1 })
                      }
                      // Second pass: for each event, count how many columns its overlap group spans
                      for (const ev of laid) {
                        const evStart = new Date(ev.start).getTime()
                        const evEnd   = new Date(ev.end).getTime()
                        const overlapping = laid.filter(l =>
                          new Date(l.end).getTime() > evStart && new Date(l.start).getTime() < evEnd
                        )
                        const maxCol = Math.max(...overlapping.map(l => l.col))
                        ev.totalCols = maxCol + 1
                      }

                      return laid.map((event) => {
                        const pos = getEventPosition(event)
                        const colWidth = 100 / event.totalCols
                        const leftPct = event.col * colWidth

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
                            onPointerDown={(e) => handleStartDrag(e, event, dateStr)}
                            onClick={(e) => {
                              e.stopPropagation()
                              onDayClick(dateStr)
                            }}
                            className={`absolute rounded-lg border px-1.5 py-1 text-[9px] font-bold overflow-hidden shadow-xs hover:shadow-sm cursor-grab active:cursor-grabbing select-none transition-all ${colorClass} ${
                              dragState?.event.id === event.id ? 'opacity-30' : ''
                            }`}
                            style={{
                              top: pos.top,
                              height: pos.height,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${colWidth}% - 4px)`,
                            }}
                          >
                            {/* Top Resize Handle */}
                            <div
                              onPointerDown={(e) => handleStartResize(e, event, 'top', dateStr)}
                              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-20 hover:bg-black/15 dark:hover:bg-white/20 transition-colors"
                              title="Drag to resize start time"
                            />

                            <div className="truncate leading-tight pointer-events-none flex items-center gap-1">
                              {event.status === 'done' && <span className="text-emerald-500 font-extrabold">✓</span>}
                              <span className={event.status === 'done' ? 'line-through opacity-75' : ''}>{event.title}</span>
                            </div>
                            <div className="text-[8px] opacity-75 mt-0.5 pointer-events-none font-mono">
                              {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </div>

                            {/* Bottom Resize Handle */}
                            <div
                              onPointerDown={(e) => handleStartResize(e, event, 'bottom', dateStr)}
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-20 hover:bg-black/15 dark:hover:bg-white/20 transition-colors"
                              title="Drag to resize end time"
                            />
                          </div>
                        )
                      })
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
          </div>
        </div>
      )}
    </Card>
  )
}
