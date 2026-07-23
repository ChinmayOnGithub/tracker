"use client"

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { ActivityTemplate, ActivityLog, Note, TimelineItem, AnalyzedTemplate } from '@/types'
import { CalendarDayDTO } from '@/modules/calendar/dto/CalendarDayDTO'
import { analyzeRecurrence } from '@/lib/recurrence'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { markComplete, updateLog, deleteLog, postponeOneTimeTask, unpostponeOneTimeTask } from '@/app/actions/log'
import { createCalendarEventAction, updateCalendarEventAction, deleteCalendarEventAction } from '@/app/actions/calendar'
import { Icon } from './Icon'
import { X, Sparkles, BookOpen, Search, Plus, Clock, Check, ArrowRightCircle, Edit2, Trash2, Settings, Briefcase } from 'lucide-react'
import { getTemplateColorClasses } from '@/lib/colors'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/design-system'
import { MarathiCalendarEvents } from './daylogs/MarathiCalendarEvents'

interface CalendarDayEvent {
  id: string
  title: string
  start?: string
  end?: string
  allDay: boolean
  color?: string | null
  type: string
}

interface DayLogsModalProps {
  isOpen: boolean
  onClose: () => void
  dateStr: string
  templates: ActivityTemplate[]
  logs: ActivityLog[]
  note: Note | null
  initialTab?: 'activities' | 'notes'
  allLogs?: ActivityLog[]
  mode?: 'modal' | 'sidebar'
}

const dayDtoCache: Record<string, CalendarDayDTO> = {}

export const DayLogsModal: React.FC<DayLogsModalProps> = ({
  isOpen,
  onClose,
  dateStr,
  templates,
  logs,
  note,
  initialTab,
  allLogs,
  mode = 'modal',
}) => {
  const router = useRouter()

  // ── Compute timeline from props (instant, no API) ───────────────────────
  const analyzedTemplates: AnalyzedTemplate[] = useMemo(() => {
    const allLogsArr = allLogs || logs
    return templates.map(template => {
      const templateLogs = allLogsArr.filter(l => l.activityId === template.id)
      const analysis = analyzeRecurrence(template, templateLogs, dateStr)
      return { template, analysis }
    })
  }, [templates, logs, allLogs, dateStr])

  const timeline: TimelineItem[] = useMemo(() => {
    return generateTimeline(analyzedTemplates, logs, dateStr, [])
  }, [analyzedTemplates, logs, dateStr])

  // Sort: timed first (by start), then anytime (by sortOrder)
  const orderedItems = useMemo(() => {
    const timed = timeline.filter(o => !o.isAllDay).sort((a, b) => {
      return new Date(a.start).getTime() - new Date(b.start).getTime()
    })
    const anytime = timeline.filter(o => o.isAllDay).sort((a, b) => {
      const tA = analyzedTemplates.find(t => t.template.id === a.templateId)?.template
      const tB = analyzedTemplates.find(t => t.template.id === b.templateId)?.template
      return (tA?.sortOrder ?? 0) - (tB?.sortOrder ?? 0)
    })
    return [...timed, ...anytime]
  }, [timeline, analyzedTemplates])

  // ── Local Day View Summary (Instant) ───────────────────────────────────
  const workTemplateObj = templates.find(t => t.name === 'Work Tracker')
  const workTemplateId = workTemplateObj?.id
  const dayWorkLog = workTemplateId ? logs.find(l => l.activityId === workTemplateId) : null

  const localDTO = useMemo(() => {
    let workStatus: 'office' | 'wfh' | 'cleared' = 'cleared'
    if (dayWorkLog) {
      workStatus = dayWorkLog.status === 'wfh' ? 'wfh' : 'office'
    }
    const weightLog = logs.find(l => {
      const t = templates.find(temp => temp.id === l.activityId)
      return t?.name.toLowerCase().includes('weight')
    })
    let weight = weightLog ? weightLog.amount : null
    if (weightLog && !weight && weightLog.note) {
      const match = weightLog.note.match(/Logged weight:\s*([\d.]+)/i)
      if (match) {
        weight = parseFloat(match[1])
      }
    }
    const journalEntry = note ? { id: note.id, title: 'Journal Entry', content: note.content } : null

    return {
      date: dateStr,
      events: [] as CalendarDayEvent[],
      tasks: [] as CalendarDayDTO['tasks'],
      workedHours: dayWorkLog ? (dayWorkLog.amount ?? 0) : 0,
      workStatus,
      workDetails: null as CalendarDayDTO['workDetails'],
      journalEntry,
      weight,
      habits: [] as CalendarDayDTO['habits'],
      isLeave: false,
      leaveDetails: null as CalendarDayDTO['leaveDetails'],
    }
  }, [templates, logs, note, dateStr, dayWorkLog])

  // ── Lazy DTO fetch with Cache ──────────────────────────────────────────
  const [dayDTO, setDayDTO] = useState<CalendarDayDTO | null>(() => {
    return dayDtoCache[dateStr] || null
  })
  const [isDtoLoading, setIsDtoLoading] = useState(false)

  const fetchDayDetails = useCallback(async () => {
    if (dayDtoCache[dateStr]) {
      setDayDTO(dayDtoCache[dateStr])
      return
    }
    try {
      setIsDtoLoading(true)
      const res = await fetch(`/api/calendar/day?date=${dateStr}`)
      const json = await res.json()
      if (json.success) {
        dayDtoCache[dateStr] = json.data
        setDayDTO(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch day summary DTO:', err)
    } finally {
      setIsDtoLoading(false)
    }
  }, [dateStr])

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchDayDetails()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isOpen, fetchDayDetails])

  // Sync state if selected date changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDayDTO(dayDtoCache[dateStr] || null)
    }, 0)
    return () => clearTimeout(timer)
  }, [dateStr])

  // Merge local state with loaded DTO (preferring local state for instant synchronization of logs)
  const mergedDTO = useMemo(() => {
    const base = dayDTO || localDTO
    return {
      ...base,
      workStatus: localDTO.workStatus,
      workedHours: localDTO.workedHours,
      journalEntry: localDTO.journalEntry,
      weight: localDTO.weight,
    }
  }, [dayDTO, localDTO])

  // ── Tab / UI State ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'activities' | 'notes'>(initialTab || 'activities')
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, { completed: boolean; status?: string }>>({})

  // Scheduler form state
  const [isScheduling, setIsScheduling] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('10:30')
  const [selectedColor, setSelectedColor] = useState('zinc')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Template selector
  const [activitySearch, setActivitySearch] = useState('')

  // Work Tracker state

  const [workStatus, setWorkStatus] = useState<'office' | 'wfh' | 'cleared'>(() => {
    if (dayWorkLog) {
      return dayWorkLog.status === 'wfh' ? 'wfh' : 'office'
    }
    return 'cleared'
  })

  const [inTime, setInTime] = useState(() => {
    const payload = dayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.inTime as string) || '09:00'
  })

  const [outTime, setOutTime] = useState(() => {
    const payload = dayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.outTime as string) || '17:30'
  })

  const [wfhHours, setWfhHours] = useState(() => {
    if (dayWorkLog && dayWorkLog.status === 'wfh') {
      return dayWorkLog.amount || 8.0
    }
    return 8.0
  })

  const [isLoggingWork, setIsLoggingWork] = useState(false)
  const [isEditingWork, setIsEditingWork] = useState(false)
  const [isTemplatesExpanded, setIsTemplatesExpanded] = useState(false)
  const [instantContent, setInstantContent] = useState('')
  const [isSavingJournal, setIsSavingJournal] = useState(false)

  // Sync work state with date/prop changes
  const [prevLogId, setPrevLogId] = useState(dayWorkLog?.id)
  const [prevDateStr, setPrevDateStr] = useState(dateStr)
  if (dayWorkLog?.id !== prevLogId || dateStr !== prevDateStr) {
    setPrevLogId(dayWorkLog?.id)
    setPrevDateStr(dateStr)
    setIsEditingWork(false)
    if (dayWorkLog) {
      setWorkStatus(dayWorkLog.status === 'wfh' ? 'wfh' : 'office')
      const payload = dayWorkLog.payload as Record<string, unknown> | null
      setInTime((payload?.inTime as string) || '09:00')
      setOutTime((payload?.outTime as string) || '17:30')
      setWfhHours(dayWorkLog.status === 'wfh' ? (dayWorkLog.amount || 8.0) : 8.0)
    } else {
      setWorkStatus('cleared')
    }
  }

  // Customize View Config
  const [config, setConfig] = useState(() => {
    const defaults = {
      marathiEvents: true,
      workPresence: true,
      daySummary: true,
      tasksList: true,
      calendarEvents: true,
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_day_sidebar_visibility')
      if (saved) {
        try {
          return { ...defaults, ...JSON.parse(saved) }
        } catch (e) {
          console.error(e)
        }
      }
    }
    return defaults
  })

  const [showConfig, setShowConfig] = useState(false)

  const toggleConfig = (key: keyof typeof config) => {
    const updated = { ...config, [key]: !config[key] }
    setConfig(updated)
    localStorage.setItem('personal_day_sidebar_visibility', JSON.stringify(updated))
  }

  const computeOfficeHours = (inT: string, outT: string): number => {
    const [inH, inM] = inT.split(':').map(Number)
    const [outH, outM] = outT.split(':').map(Number)
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (diffMins < 0) diffMins += 24 * 60
    return parseFloat((diffMins / 60).toFixed(1))
  }

  const handleSaveWorkPresence = async () => {
    if (!workTemplateId || isLoggingWork) return
    setIsLoggingWork(true)
    try {
      const computedHours = workStatus === 'office'
        ? computeOfficeHours(inTime, outTime)
        : workStatus === 'wfh' ? wfhHours : 0

      const { logWorkPresence } = await import('@/app/actions/log')
      const res = await logWorkPresence({
        templateId: workTemplateId,
        date: dateStr,
        status: workStatus,
        inTime: workStatus === 'office' ? inTime : null,
        outTime: workStatus === 'office' ? outTime : null,
        hours: computedHours
      })
      if (res.success) {
        setIsEditingWork(false)
        fetchDayDetails()
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to log work presence:', err)
    } finally {
      setIsLoggingWork(false)
    }
  }

  const handleSaveInstantJournal = async () => {
    if (!instantContent.trim() || isSavingJournal) return
    setIsSavingJournal(true)
    try {
      const { upsertJournalEntry } = await import('@/app/actions/journal')
      const res = await upsertJournalEntry(dateStr, {
        content: instantContent.trim()
      })
      if (res.success) {
        setInstantContent('')
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to save instant journal:', err)
    } finally {
      setIsSavingJournal(false)
    }
  }

  const filteredTemplates = templates.filter(t => {
    const query = activitySearch.trim().toLowerCase()
    return t.name.toLowerCase().includes(query) || t.category.toLowerCase().includes(query)
  })

  if (!isOpen) return null

  const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('default', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Status cycling (same logic as TodayDashboard) ───────────────────────
  const cycleTaskStatus = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return

    const optimisticVal = optimisticStatuses[occurrence.id]
    const currentCompleted = optimisticVal ? optimisticVal.completed : occurrence.completed
    const currentStatus = optimisticVal ? optimisticVal.status : occurrence.status

    const isCanceled = currentStatus === 'skipped'
    const isPostponed = currentStatus === 'postponed'
    const isDone = currentCompleted && !isCanceled && !isPostponed

    let nextCompleted = false
    let nextStatus: string | undefined = undefined

    if (!currentCompleted && !isCanceled && !isPostponed) {
      const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
      nextCompleted = true
      nextStatus = matched?.template.category === 'finance' ? 'paid' : 'done'
    } else if (isDone) {
      nextCompleted = true
      nextStatus = 'skipped'
    } else if (isCanceled) {
      const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
      const isDaily = matched?.template.recurrenceType === 'daily'
      if (isDaily) {
        nextCompleted = false
        nextStatus = undefined
      } else {
        nextCompleted = true
        nextStatus = 'postponed'
      }
    } else if (isPostponed) {
      nextCompleted = false
      nextStatus = undefined
    }

    setOptimisticStatuses(prev => ({
      ...prev,
      [occurrence.id]: { completed: nextCompleted, status: nextStatus }
    }))

    setCompletingHabitId(occurrence.templateId)
    try {
      if (!currentCompleted && !isCanceled && !isPostponed) {
        const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
        const status = matched?.template.category === 'finance' ? 'paid' : 'done'
        const amount = matched?.template.amount
        await markComplete(occurrence.templateId, dateStr, status, amount ?? null, null)
      } else if (isDone) {
        if (occurrence.logId) {
          await updateLog(occurrence.logId, { status: 'skipped' })
        } else {
          await markComplete(occurrence.templateId, dateStr, 'skipped')
        }
      } else if (isCanceled) {
        const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
        const isDaily = matched?.template.recurrenceType === 'daily'
        const isOneTime = matched?.template.recurrenceType === 'one_time'
        if (isDaily) {
          if (occurrence.logId) await deleteLog(occurrence.logId)
        } else if (isOneTime) {
          await postponeOneTimeTask(occurrence.templateId, dateStr, occurrence.logId)
        } else {
          if (occurrence.logId) {
            await updateLog(occurrence.logId, { status: 'postponed' })
          } else {
            await markComplete(occurrence.templateId, dateStr, 'postponed')
          }
        }
      } else if (isPostponed) {
        const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
        const isOneTime = matched?.template.recurrenceType === 'one_time'
        if (isOneTime && occurrence.logId) {
          await unpostponeOneTimeTask(occurrence.templateId, occurrence.logId, dateStr)
        } else if (occurrence.logId) {
          await deleteLog(occurrence.logId)
        }
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to cycle task status:', err)
      setOptimisticStatuses(prev => {
        const copy = { ...prev }
        delete copy[occurrence.id]
        return copy
      })
    } finally {
      setCompletingHabitId(null)
    }
  }

  // ── Scheduler actions ───────────────────────────────────────────────────
  const handleOpenScheduler = (template?: ActivityTemplate) => {
    setErrorMsg('')
    if (template) {
      setEditingEventId(null)
      setTaskTitle(template.name)
      setAllDay(!template.scheduledTime)
      setStartTime(template.scheduledTime || '10:00')
      const dur = template.estimatedDuration || 30
      if (template.scheduledTime) {
        const [h, m] = template.scheduledTime.split(':').map(Number)
        const d = new Date()
        d.setHours(h, m + dur, 0, 0)
        setEndTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
      } else {
        setEndTime('10:30')
      }
      setSelectedColor(template.color || 'zinc')
    } else {
      setEditingEventId(null)
      setTaskTitle('')
      setAllDay(true)
      setStartTime('10:00')
      setEndTime('10:30')
      setSelectedColor('zinc')
    }
    setIsScheduling(true)
  }

  const handleEditEvent = (event: CalendarDayEvent) => {
    setErrorMsg('')
    setEditingEventId(event.id)
    setTaskTitle(event.title)
    setAllDay(event.allDay)
    if (!event.allDay && event.start && event.end) {
      const sDate = new Date(event.start)
      const eDate = new Date(event.end)
      setStartTime(`${String(sDate.getHours()).padStart(2, '0')}:${String(sDate.getMinutes()).padStart(2, '0')}`)
      setEndTime(`${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}`)
    } else {
      setStartTime('10:00')
      setEndTime('10:30')
    }
    setSelectedColor(event.color || 'zinc')
    setIsScheduling(true)
  }

  const handleSaveEvent = async () => {
    if (!taskTitle.trim()) { setErrorMsg('Please specify a title'); return }
    try {
      setIsSaving(true)
      setErrorMsg('')
      const startIso = allDay ? `${dateStr}T00:00:00.000Z` : `${dateStr}T${startTime}:00.000`
      const endIso = allDay ? `${dateStr}T23:59:59.000Z` : `${dateStr}T${endTime}:00.000`
      if (editingEventId) {
        await updateCalendarEventAction(editingEventId, { title: taskTitle.trim(), start: startIso, end: endIso, allDay, color: selectedColor })
      } else {
        await createCalendarEventAction({ title: taskTitle.trim(), start: startIso, end: endIso, allDay, type: 'TASK', color: selectedColor })
      }
      setIsScheduling(false)
      setEditingEventId(null)
      fetchDayDetails()
      router.refresh()
    } catch (_err) {
      setErrorMsg('Something went wrong')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if (confirm('Remove this scheduled event?')) {
      try {
        await deleteCalendarEventAction(id)
        fetchDayDetails()
        router.refresh()
      } catch (_err) {
        alert('Failed to delete event')
      }
    }
  }

  // ── Timeline card renderer (matches TodayDashboard style) ───────────────
  const renderTimelineCard = (occurrence: TimelineItem) => {
    const isTimed = !occurrence.isAllDay
    const startTimeLabel = isTimed && occurrence.start
      ? new Date(occurrence.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : ''

    const matchedTemplate = occurrence.templateId
      ? analyzedTemplates.find(t => t.template.id === occurrence.templateId)
      : null
    const template = matchedTemplate?.template
    const estimatedDuration = template?.estimatedDuration
    const streak = matchedTemplate?.analysis.streak ?? 0

    const isGoogleCalendar = occurrence.id.startsWith('google_') || !occurrence.templateId
    const templateColor = template?.color || 'zinc'
    const colorClasses = getTemplateColorClasses(templateColor)

    const colorBgClasses: Record<string, string> = {
      red: 'bg-red-500 dark:bg-red-400', orange: 'bg-orange-500 dark:bg-orange-400',
      amber: 'bg-amber-500 dark:bg-amber-400', green: 'bg-green-500 dark:bg-green-400',
      blue: 'bg-blue-500 dark:bg-blue-400', purple: 'bg-purple-500 dark:bg-purple-400',
      pink: 'bg-pink-500 dark:bg-pink-400', zinc: 'bg-zinc-500 dark:bg-zinc-400',
    }
    const colorBg = colorBgClasses[templateColor] || 'bg-zinc-500'

    const optimisticVal = optimisticStatuses[occurrence.id]
    const isCanceled = optimisticVal ? optimisticVal.status === 'skipped' : occurrence.status === 'skipped'
    const isPostponed = optimisticVal ? optimisticVal.status === 'postponed' : occurrence.status === 'postponed'
    const isDone = optimisticVal ? (optimisticVal.completed && !isCanceled && !isPostponed) : (occurrence.completed && !isCanceled && !isPostponed)

    let statusIndicatorColor = colorBg
    if (isGoogleCalendar) {
      statusIndicatorColor = 'bg-[var(--color-external)]'
    } else if (isDone) {
      statusIndicatorColor = 'bg-[var(--color-completed)]'
    } else if (isCanceled) {
      statusIndicatorColor = 'bg-[var(--color-overdue)]'
    } else if (isPostponed) {
      statusIndicatorColor = 'bg-[var(--color-external)]'
    }

    return (
      <div
        key={occurrence.id}
        className={`flex items-center gap-3 px-3 py-1.5 transition-all duration-150 group relative hover:bg-[var(--color-accent)]/30 ${
          isDone ? 'opacity-65' : isCanceled || isPostponed ? 'opacity-40' : ''
        }`}
      >
        {/* Left Indicator Strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusIndicatorColor}`} />

        {/* Cycling Checkbox */}
        <button
          disabled={completingHabitId === occurrence.templateId}
          onClick={() => cycleTaskStatus(occurrence)}
          title={`Status: ${isDone ? 'Done' : isCanceled ? 'Canceled' : isPostponed ? 'Postponed' : 'Cleared'}. Click to cycle.`}
          aria-label="Cycle task status"
          className="shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 active:scale-90 disabled:opacity-50"
        >
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300 shadow-xs ${
            completingHabitId === occurrence.templateId ? 'bg-slate-100 dark:bg-zinc-800 border-[var(--color-border)]' :
            isDone ? 'bg-[var(--color-completed)] border-[var(--color-completed)] text-white' :
            isCanceled ? 'bg-[var(--color-overdue)] border-[var(--color-overdue)] text-white' :
            isPostponed ? 'bg-[var(--color-external)] border-[var(--color-external)] text-white' :
            'bg-[var(--color-bg-base)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
          }`}>
            {completingHabitId === occurrence.templateId ? (
              <span className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-ping" />
            ) : isDone ? (
              <Check className="w-3.5 h-3.5 animate-check-pop" />
            ) : isCanceled ? (
              <span className="text-[10px] font-black leading-none">✕</span>
            ) : isPostponed ? (
              <ArrowRightCircle className="w-3.5 h-3.5" />
            ) : null}
          </div>
        </button>

        {/* Category Icon */}
        <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
          isGoogleCalendar
            ? 'bg-[var(--color-external)]/10 border-[var(--color-external)]/20 text-[var(--color-external)]'
            : `${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`
        }`}>
          <Icon name={occurrence.icon || template?.icon || 'CheckSquare'} size={12} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold leading-tight truncate ${
              isDone || isCanceled
                ? 'line-through text-[var(--color-text-muted)]'
                : 'text-[var(--color-text-main)]'
            }`}>
              {occurrence.templateName}
            </span>
            {isTimed && startTimeLabel && (
              <span className={`shrink-0 text-[9px] font-mono font-bold px-1 py-0.5 rounded-sm border ${colorClasses.text} ${colorClasses.border} ${colorClasses.bg}`}>
                {startTimeLabel}
                {estimatedDuration ? ` • ${estimatedDuration}m` : ''}
              </span>
            )}
            {streak > 1 && !isDone && !isCanceled && (
              <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-extrabold text-orange-500 bg-orange-500/10 px-1 py-0.5 rounded-sm border border-orange-500/20" title={`${streak} day streak!`}>
                🔥 {streak}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Render Shared Content ──────────────────────────────────────────────────
  const contentEl = (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)] dark:border-zinc-855 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--color-text-muted)]">Day Planner</h3>
          <p className="text-xs font-bold text-[var(--color-text-main)] mt-0.5">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
            icon={<Settings size={14} className={showConfig ? 'text-[var(--color-primary)]' : ''} />}
            title="Customize Widgets"
          />
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={16} />} />
        </div>
      </div>

      {/* Customize Panel */}
      {showConfig && (
        <div className="px-5 py-3 border-b border-[var(--color-border)] bg-slate-50/50 dark:bg-zinc-955/45 space-y-2 animate-in fade-in duration-200">
          <div className="font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Customize Day View Widgets</div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-[var(--color-text-main)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.marathiEvents} onChange={() => toggleConfig('marathiEvents')} className="rounded border-slate-350 dark:border-zinc-800 accent-[var(--color-primary)] w-3.5 h-3.5" />
              Marathi Events
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.workPresence} onChange={() => toggleConfig('workPresence')} className="rounded border-slate-350 dark:border-zinc-800 accent-[var(--color-primary)] w-3.5 h-3.5" />
              Work Presence Tracker
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.daySummary} onChange={() => toggleConfig('daySummary')} className="rounded border-slate-350 dark:border-zinc-800 accent-[var(--color-primary)] w-3.5 h-3.5" />
              Day Summary Cards
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.tasksList} onChange={() => toggleConfig('tasksList')} className="rounded border-slate-350 dark:border-zinc-800 accent-[var(--color-primary)] w-3.5 h-3.5" />
              Tasks & Activities
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.calendarEvents} onChange={() => toggleConfig('calendarEvents')} className="rounded border-slate-350 dark:border-zinc-800 accent-[var(--color-primary)] w-3.5 h-3.5" />
              Calendar Events
            </label>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/20 flex justify-center shrink-0">
        <div className="flex bg-slate-100 dark:bg-zinc-800/60 p-0.5 rounded-[9px] shadow-inner w-full max-w-xs">
          <button onClick={() => setActiveTab('activities')}
            className={`flex-1 py-1.5 text-center font-bold rounded-md transition-all duration-200 flex justify-center items-center gap-1.5 text-xs cursor-pointer ${
              activeTab === 'activities' ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-extrabold' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}>
            <Sparkles size={14} /> Schedule & Tasks
          </button>
          <button onClick={() => setActiveTab('notes')}
            className={`flex-1 py-1.5 text-center font-bold rounded-md transition-all duration-200 flex justify-center items-center gap-1.5 text-xs cursor-pointer ${
              activeTab === 'notes' ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-extrabold' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}>
            <BookOpen size={14} /> Journal
            {note && <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400" />}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {config.marathiEvents && <MarathiCalendarEvents dateStr={dateStr} />}

        <div className="mt-3">
          {activeTab === 'activities' && (
            <div className="space-y-6">

              {/* Event Scheduler Form */}
              {isScheduling && (
                <div className="p-5 bg-slate-50 dark:bg-zinc-955/40 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm animate-in slide-in-from-top-4 duration-200">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-900 pb-2">
                    <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[var(--color-primary)]" />
                      {editingEventId ? 'Edit Event' : 'Schedule Task / Event'}
                    </h4>
                    <Button variant="ghost" size="sm" onClick={() => { setIsScheduling(false); setEditingEventId(null) }}>Cancel</Button>
                  </div>
                  {errorMsg && <div className="p-2.5 bg-rose-50 dark:bg-rose-950/45 border border-rose-200 dark:border-rose-900 text-rose-500 rounded-lg font-semibold text-xs">{errorMsg}</div>}
                  <div className="space-y-3">
                    <Input label="Event Name" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Sync with team, Gym session..." />
                    <div className="flex items-center gap-2 pt-1">
                      <input type="checkbox" id="formIsAllDay" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-4 h-4 text-[var(--color-primary)] border-slate-300 rounded-sm cursor-pointer" />
                      <label htmlFor="formIsAllDay" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">Anytime / All Day</label>
                    </div>
                    {!allDay && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <Input type="time" label="Start Time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                        <Input type="time" label="End Time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Color</label>
                      <div className="flex gap-2">
                        {['zinc', 'red', 'orange', 'amber', 'green', 'blue', 'purple', 'pink'].map(col => {
                          const cc = getTemplateColorClasses(col)
                          return (
                            <button key={col} type="button" onClick={() => setSelectedColor(col)}
                              className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${cc.bg} ${selectedColor === col ? 'border-black dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-zinc-800 pt-3">
                    <Button variant="primary" size="sm" disabled={isSaving} onClick={handleSaveEvent} loading={isSaving}>
                      {editingEventId ? 'Update Event' : 'Schedule Event'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Timeline Items (Tasks & Activities) - AT THE TOP */}
              {config.tasksList && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 dark:text-zinc-555">
                      Tasks & Activities ({orderedItems.length})
                    </div>
                    {!isScheduling && (
                      <Button onClick={() => handleOpenScheduler()} variant="outline" size="sm"
                        className="flex items-center gap-1 text-[10px] py-1 px-2.5 font-bold uppercase tracking-wider">
                        <Plus size={11} /> Add Task
                      </Button>
                    )}
                  </div>

                  {orderedItems.length === 0 ? (
                    <div className="p-6 bg-slate-50 dark:bg-zinc-950/40 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-center text-slate-400 dark:text-zinc-500 text-xs italic">
                      No tasks scheduled for this day.
                    </div>
                  ) : (
                    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]/40 overflow-hidden shadow-xs">
                      {orderedItems.map(o => renderTimelineCard(o))}
                    </div>
                  )}
                </div>
              )}

              {/* Work Presence Logger Section - MINIMAL HEIGHT */}
              {config.workPresence && workTemplateId && (
                <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-3.5 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                      Work Hours
                    </span>
                    {!isEditingWork && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingWork(true)}
                        className="text-[10px] py-0.5 px-2 font-bold uppercase"
                      >
                        Edit
                      </Button>
                    )}
                  </div>

                  {!isEditingWork ? (
                    <div className="text-[11px] font-semibold text-[var(--color-text-main)]">
                      {workStatus === 'cleared' && <span className="text-[var(--color-text-muted)]">Not logged</span>}
                      {workStatus === 'office' && (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <span>🏢 Office:</span>
                          <span className="font-bold font-mono">{inTime} – {outTime} ({dayWorkLog?.amount ?? 0}h)</span>
                        </div>
                      )}
                      {workStatus === 'wfh' && (
                        <div className="flex items-center gap-2 text-blue-500">
                          <span>🏠 WFH:</span>
                          <span className="font-bold font-mono">{wfhHours}h</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 border-t border-[var(--color-border)]/40">
                      {/* Status Segmented Controls */}
                      <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[9px] border border-[var(--color-border)]">
                        {(['cleared', 'office', 'wfh'] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setWorkStatus(status)}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-md capitalize transition-all duration-150 cursor-pointer ${workStatus === status
                                ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                              }`}
                          >
                            {status === 'cleared' ? 'Clear' : status}
                          </button>
                        ))}
                      </div>

                      {/* Office Time Pickers */}
                      {workStatus === 'office' && (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="block text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">In-Time</label>
                              <input
                                type="time"
                                value={inTime}
                                onChange={(e) => setInTime(e.target.value)}
                                className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Out-Time</label>
                              <input
                                type="time"
                                value={outTime}
                                onChange={(e) => setOutTime(e.target.value)}
                                className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                              />
                            </div>
                          </div>
                          <div className="text-[10px] text-right font-semibold text-[var(--color-text-muted)] pr-0.5">
                            Calculated: <span className="text-[var(--color-text-main)] font-mono">{computeOfficeHours(inTime, outTime)}h</span>
                          </div>
                        </div>
                      )}

                      {/* WFH Hours Inputs */}
                      {workStatus === 'wfh' && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                            <span>WFH Hours</span>
                            <span className="text-xs font-mono text-[var(--color-text-main)] font-bold">{wfhHours}h</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="16"
                            step="0.5"
                            value={wfhHours}
                            onChange={(e) => setWfhHours(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleSaveWorkPresence}
                          isLoading={isLoggingWork}
                          variant="primary"
                          size="sm"
                          className="flex-1 font-bold text-xs"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => {
                            setIsEditingWork(false)
                            // Restore initial
                            if (dayWorkLog) {
                              setWorkStatus(dayWorkLog.status === 'wfh' ? 'wfh' : 'office')
                            } else {
                              setWorkStatus('cleared')
                            }
                          }}
                          variant="outline"
                          size="sm"
                          className="text-xs font-bold"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Day Summary Overview (lazy loaded from DTO) */}
              {config.daySummary && mergedDTO && (mergedDTO.workStatus !== 'cleared' || mergedDTO.isLeave || mergedDTO.weight !== null || mergedDTO.journalEntry) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 p-4 rounded-xl">
                  <div className="sm:col-span-2 text-[10px] uppercase tracking-widest font-extrabold text-slate-400 dark:text-zinc-550">
                    Day Summary {isDtoLoading && '...'}
                  </div>
                  {mergedDTO.workStatus !== 'cleared' && (
                    <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 p-2.5 rounded-lg flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">💼</div>
                      <div>
                        <div className="font-bold text-[var(--color-text-main)] capitalize">Work: {mergedDTO.workStatus}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{mergedDTO.workedHours}h logged</div>
                      </div>
                    </div>
                  )}
                  {mergedDTO.isLeave && (
                    <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 p-2.5 rounded-lg flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">🏖️</div>
                      <div><div className="font-bold text-[var(--color-text-main)]">Leave Day</div></div>
                    </div>
                  )}
                  {mergedDTO.weight !== null && (
                    <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 p-2.5 rounded-lg flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">⚖️</div>
                      <div><div className="font-bold text-[var(--color-text-main)]">{mergedDTO.weight} kg</div></div>
                    </div>
                  )}
                  {mergedDTO.journalEntry && (
                    <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 p-2.5 rounded-lg flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">📓</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[var(--color-text-main)] truncate">{mergedDTO.journalEntry.title || 'Journal Entry'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scheduled Calendar Events (from DTO) */}
              {config.calendarEvents && mergedDTO?.events && mergedDTO.events.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 dark:text-zinc-555">
                    Calendar Events ({mergedDTO.events.length})
                  </div>
                  <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]/40 overflow-hidden shadow-xs">
                    {mergedDTO.events.map(event => {
                      const colorClasses = getTemplateColorClasses(event.color || 'zinc')
                      let timeLabel = 'All Day'
                      if (!event.allDay && event.start && event.end) {
                        const s = new Date(event.start)
                        const e = new Date(event.end)
                        timeLabel = `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      }
                      return (
                        <div key={`event-${event.id}`} className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-accent)]/30 transition-colors group relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--color-primary)]" />
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}>
                              <Icon name={event.type === 'MEETING' ? 'Calendar' : 'CheckSquare'} size={12} />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-[var(--color-text-main)] truncate">{event.title}</span>
                              <p className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                                <Clock size={10} /> {timeLabel}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => handleEditEvent(event)} className="p-1"><Edit2 size={12} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEvent(event.id)} className="p-1 text-red-500"><Trash2 size={12} /></Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Template Selector - COLLAPSIBLE AND COMPACT */}
              {!isScheduling && (
                <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl p-3.5 space-y-3.5">
                  <button
                    type="button"
                    onClick={() => setIsTemplatesExpanded(!isTemplatesExpanded)}
                    className="w-full flex items-center justify-between font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-405 cursor-pointer hover:text-[var(--color-text-main)] transition-colors"
                  >
                    <span>Schedule from Templates</span>
                    <span className="text-[9px] text-[var(--color-text-muted)] font-normal border border-[var(--color-border)] rounded px-1.5 py-0.5 hover:bg-[var(--color-bg-surface)]">
                      {isTemplatesExpanded ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {isTemplatesExpanded && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <div className="relative w-full">
                        <Search className="absolute left-2.5 top-2.5 h-3 w-3 text-slate-400 dark:text-zinc-550" />
                        <input type="text" placeholder="Search templates..." value={activitySearch} onChange={e => setActivitySearch(e.target.value)}
                          className="w-full bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-hidden focus:border-[var(--color-border)]" />
                      </div>
                      {filteredTemplates.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400 dark:text-zinc-650 italic">No activities match.</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                          {filteredTemplates.map(t => {
                            const colorClasses = getTemplateColorClasses(t.color)
                            return (
                              <button key={t.id} type="button" onClick={() => handleOpenScheduler(t)}
                                className="flex items-center gap-2 p-1.5 bg-[var(--color-bg-surface)] hover:bg-[var(--color-accent)]/20 border border-[var(--color-border)] rounded-lg transition-all cursor-pointer text-left hover:-translate-y-0.5 hover:shadow-xs group">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center border group-hover:scale-105 transition-all ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}>
                                  <Icon name={t.icon} size={11} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-bold text-slate-850 dark:text-zinc-205 truncate group-hover:text-slate-950 dark:group-hover:text-white transition-colors">{t.name}</div>
                                  <div className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium capitalize truncate">{t.scheduledTime ? `@ ${t.scheduledTime}` : 'anytime'}</div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              {note ? (
                <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-5 rounded-xl space-y-3 shadow-xs">
                  <div className="border-b border-slate-200 dark:border-zinc-900 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-base">Journal Entry</h3>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Written on this day</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push('/journal')}
                      className="text-xs font-bold"
                    >
                      Open in module
                    </Button>
                  </div>
                  <div className="text-slate-800 dark:text-zinc-300 text-sm leading-relaxed prose dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: note.content }} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="py-6 text-center text-xs text-[var(--color-text-muted)] italic">No journal entry for this day.</div>

                  <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
                    <div className="font-bold text-xs text-[var(--color-text-main)]">Write instant journal entry</div>
                    <textarea
                      placeholder="What happened today? Write your thoughts here..."
                      value={instantContent}
                      onChange={(e) => setInstantContent(e.target.value)}
                      className="w-full h-24 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-lg p-2.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)] placeholder-slate-400 dark:placeholder-zinc-650"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveInstantJournal}
                        isLoading={isSavingJournal}
                        disabled={!instantContent.trim() || isSavingJournal}
                        variant="primary"
                        size="sm"
                        className="text-xs font-bold"
                      >
                        Add Entry
                      </Button>
                      <Button
                        onClick={() => router.push('/journal')}
                        variant="outline"
                        size="sm"
                        className="text-xs font-bold"
                      >
                        Go to Journal Module
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )

  if (mode === 'sidebar') {
    return (
      <div className="w-full bg-[var(--color-bg-surface)] border border-[var(--color-border)] dark:border-zinc-850 rounded-xl flex flex-col shadow-xs relative overflow-hidden h-full min-h-[500px]">
        {contentEl}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 overflow-hidden flex justify-end">
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="relative w-[90vw] max-w-2xl bg-[var(--color-bg-surface)] border-l border-[var(--color-border)] dark:border-zinc-850 h-full flex flex-col shadow-2xl z-50 animate-slide-in-right">
        {contentEl}
      </div>
    </div>
  )
}
