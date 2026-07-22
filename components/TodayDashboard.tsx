"use client"

import React, { useState, useEffect } from 'react'
import { Skeleton, EmptyState, Button, Card, Input } from '@/design-system'
import {
  ExternalLink, Check, Plus, ArrowRightCircle,
  Scale, Shield, BookOpen, CalendarX, Lock,
  FileText, FileImage, FileVideo, FileArchive, FileCode, FileSpreadsheet, File,
  RefreshCw, Clock, Briefcase
} from 'lucide-react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis, TimelineItem } from '@/types'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { Icon } from './Icon'
import { useRouter } from 'next/navigation'
import { deleteLog, markComplete, updateLog, postponeOneTimeTask, unpostponeOneTimeTask } from '@/app/actions/log'
import { reorderActivityTemplates, createActivityTemplate } from '@/app/actions/template'
import { useActivityNotifications } from '@/lib/hooks/useActivityNotifications'
import { Sparkline } from './WeightPanel'
import { listVaultItems, VaultItem } from '@/app/actions/vault'
import { getTemplateColorClasses } from '@/lib/colors'

interface TestAnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface TodayDashboardProps {
  analyzedTemplates: TestAnalyzedTemplate[]
  logs: ActivityLog[]
  _notes: Note[]
  todayStr: string
  calendarData: {
    connected: boolean
    agenda: {
      today: ParsedCalendarEvent[]
      tomorrow: ParsedCalendarEvent[]
      upcoming: ParsedCalendarEvent[]
    } | null
    error: string | null
    loading: boolean
  }
  onRefetchCalendar: (force?: boolean) => void
  onOpenCreateActivity: () => void
  _onMarkHabitComplete: (template: ActivityTemplate) => Promise<void>
  _onEditTemplate: (template: ActivityTemplate) => void
  journalEntries: {
    id: string; journalDate: string | Date; content: string; mood: string | null
    gratitude: string | null; reflections: string | null
    lessonsLearned: string | null; tomorrowPlan: string | null
    createdAt: string | Date; updatedAt: string | Date; deletedAt: string | Date | null
  }[]
  leaveRecords: {
    id: string; leaveType: string; startDate: string | Date; endDate: string | Date
    totalDays: number; status: string; notes: string | null; createdAt: string | Date
  }[]
  leaveAllowances: { leaveType: string; allowance: number }[]
  weightRecords: { id: string; date: string | Date; weight: number; notes: string | null }[]
  onTabChange: (tabId: string) => void
}


export const TodayDashboard: React.FC<TodayDashboardProps> = ({
  analyzedTemplates,
  logs,
  _notes,
  todayStr,
  calendarData,
  onRefetchCalendar,
  onOpenCreateActivity,
  _onMarkHabitComplete,
  _onEditTemplate,
  journalEntries,
  leaveRecords,
  leaveAllowances,
  weightRecords,
  onTabChange
}) => {
  const router = useRouter()
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null)
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [vaultLoading, setVaultLoading] = useState(true)
  useEffect(() => {
    async function loadVault() {
      try {
        const res = await listVaultItems(null, undefined, 20, true)
        if (res.success) {
          // Show most recently updated files (excluding folder structures)
          setVaultItems((res.items as VaultItem[]).filter(item => !item.isFolder).slice(0, 4))
        }
      } catch (err) {
        console.error("Failed to load vault items for dashboard:", err)
      } finally {
        setVaultLoading(false)
      }
    }
    loadVault()
  }, [])

  const getVaultIcon = (mimeGroup: string | null) => {
    switch (mimeGroup) {
      case 'IMAGE': return FileImage
      case 'VIDEO': return FileVideo
      case 'ARCHIVE': return FileArchive
      case 'PDF': return FileText
      case 'TEXT': return FileText
      case 'SPREADSHEET': return FileSpreadsheet
      case 'CODE': return FileCode
      default: return File
    }
  }

  const getVaultIconColor = (mimeGroup: string | null): string => {
    switch (mimeGroup) {
      case 'IMAGE': return 'text-pink-500'
      case 'VIDEO': return 'text-purple-500'
      case 'PDF': return 'text-red-500'
      case 'ARCHIVE': return 'text-orange-500'
      case 'SPREADSHEET': return 'text-emerald-500'
      case 'TEXT': return 'text-blue-500'
      case 'CODE': return 'text-cyan-500'
      default: return 'text-[var(--color-text-muted)]'
    }
  }

  // collapsed state removed as it is unused

  // Compute start and end dates of the current week (Mon to Sun) based on todayStr
  const getWeekDates = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const current = new Date(Date.UTC(y, m - 1, d))
    const day = current.getUTCDay()
    const monDiff = day === 0 ? -6 : 1 - day // Adjust for Monday start
    
    const mon = new Date(current)
    mon.setUTCDate(current.getUTCDate() + monDiff)
    
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const temp = new Date(mon)
      temp.setUTCDate(mon.getUTCDate() + i)
      dates.push(temp.toISOString().split('T')[0])
    }
    return dates
  }

  const weekDates = getWeekDates(todayStr)
  
  // Find the Work Tracker template and daily log
  const workTemplateObj = analyzedTemplates.find(t => t.template.name === 'Work Tracker')?.template
  const workTemplateId = workTemplateObj?.id
  
  const todayWorkLog = workTemplateId
    ? logs.find(l => l.activityId === workTemplateId && l.date === todayStr)
    : null
    
  // Calculate weekly stats
  const weeklyWorkLogs = workTemplateId
    ? logs.filter(l => l.activityId === workTemplateId && weekDates.includes(l.date))
    : []
    
  const totalOfficeHours = weeklyWorkLogs
    .filter(l => l.status === 'done')
    .reduce((sum, l) => sum + (l.amount ?? 0), 0)
    
  const totalWfhHours = weeklyWorkLogs
    .filter(l => l.status === 'wfh')
    .reduce((sum, l) => sum + (l.amount ?? 0), 0)

  const weeklyGoal = 27
  const remainingHours = Math.max(0, weeklyGoal - totalOfficeHours)
  const isGoalMet = totalOfficeHours >= weeklyGoal

  // Work Tracker state
  const [workStatus, setWorkStatus] = useState<'office' | 'wfh' | 'cleared'>(() => {
    if (todayWorkLog) {
      return todayWorkLog.status === 'wfh' ? 'wfh' : 'office'
    }
    return 'cleared'
  })
  
  const [inTime, setInTime] = useState(() => {
    const payload = todayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.inTime as string) || '09:00'
  })
  
  const [outTime, setOutTime] = useState(() => {
    const payload = todayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.outTime as string) || '17:30'
  })
  
  const [wfhHours, setWfhHours] = useState(() => {
    if (todayWorkLog && todayWorkLog.status === 'wfh') {
      return todayWorkLog.amount || 8.0
    }
    return 8.0
  })

  const [isLoggingWork, setIsLoggingWork] = useState(false)

  // Sync state with incoming props on log updates during render to avoid useEffect warnings
  const [prevLogId, setPrevLogId] = useState(todayWorkLog?.id)
  if (todayWorkLog?.id !== prevLogId) {
    setPrevLogId(todayWorkLog?.id)
    if (todayWorkLog) {
      setWorkStatus(todayWorkLog.status === 'wfh' ? 'wfh' : 'office')
      const payload = todayWorkLog.payload as Record<string, unknown> | null
      setInTime((payload?.inTime as string) || '09:00')
      setOutTime((payload?.outTime as string) || '17:30')
      setWfhHours(todayWorkLog.status === 'wfh' ? (todayWorkLog.amount || 8.0) : 8.0)
    } else {
      setWorkStatus('cleared')
    }
  }

  // Restore currentTime tick interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const computeOfficeHours = (inT: string, outT: string): number => {
    const [inH, inM] = inT.split(':').map(Number)
    const [outH, outM] = outT.split(':').map(Number)
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (diffMins < 0) diffMins += 24 * 60 // handle overnight shifts
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
        date: todayStr,
        status: workStatus,
        inTime: workStatus === 'office' ? inTime : null,
        outTime: workStatus === 'office' ? outTime : null,
        hours: computedHours
      })
      if (res.success) {
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to log work presence:', err)
    } finally {
      setIsLoggingWork(false)
    }
  }

  const calendarEvents = calendarData.agenda?.today || []
  const timeline = generateTimeline(analyzedTemplates, logs, todayStr, calendarEvents)
  useActivityNotifications(timeline, analyzedTemplates)

  const overdueTemplates = analyzedTemplates.filter(t => t.analysis.overdue && t.template.isActive)
  const overdueOccurrences: TimelineItem[] = overdueTemplates.map(t => {
    const log = logs.find(l => l.activityId === t.template.id && l.date === todayStr)
    return {
      id: `overdue_${t.template.id}`,
      templateId: t.template.id,
      templateName: t.template.name,
      type: t.template.type,
      priority: t.template.priority,
      start: t.analysis.nextDueDate ? new Date(`${t.analysis.nextDueDate}T00:00:00Z`) : new Date(),
      end: new Date(),
      isAllDay: true,
      completed: !!log,
      logId: log?.id,
      status: log?.status,
      notes: t.template.notes
    }
  })

  const activeTimeline = timeline.filter(o => !o.completed)
  const activeOverdue = overdueOccurrences.filter(o => !o.completed)
  const timed = activeTimeline.filter(o => !o.isAllDay)

  const activeEvents = timed.filter(o => {
    const start = o.start ? new Date(o.start) : null
    const end = o.end ? new Date(o.end) : null
    if (!start || !end) return false
    return currentTime >= start && currentTime <= end
  })

  const upcomingEvents = timed
    .filter(o => o.start && new Date(o.start) > currentTime)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const nextEvent = upcomingEvents[0] ?? null

  // groupedTimeline removed as it is unused

  const overdueTemplateIds = new Set(overdueOccurrences.map(o => o.templateId).filter(Boolean))
  const nonOverdueTimeline = timeline.filter(o => !o.templateId || !overdueTemplateIds.has(o.templateId))

  const [manualOrderIds, setManualOrderIds] = useState<string[] | null>(null)
  const [prevLogs, setPrevLogs] = useState(logs)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, { completed: boolean; status?: string }>>({})

  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [isCreatingQuickTask, setIsCreatingQuickTask] = useState(false)

  const handleCreateQuickTask = async () => {
    const title = quickTaskTitle.trim()
    if (!title || isCreatingQuickTask) return

    setIsCreatingQuickTask(true)
    try {
      const res = await createActivityTemplate({
        name: title,
        category: 'general',
        type: 'TASK',
        priority: 'NORMAL',
        icon: 'CheckSquare',
        color: 'blue',
        recurrenceType: 'one_time',
        targetDate: `${todayStr}T00:00:00.000Z`
      })

      if (res.success) {
        setQuickTaskTitle('')
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to create quick task:', err)
    } finally {
      setIsCreatingQuickTask(false)
    }
  }

  const handleQuickTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateQuickTask()
    }
  }

  // Clear optimistic statuses when server logs are updated
  if (logs !== prevLogs) {
    setPrevLogs(logs)
    setOptimisticStatuses({})
  }

  // Sort: timed events first (sorted by start time), then all-day events (sorted by template sortOrder)
  const sortedTimed = nonOverdueTimeline.filter(o => !o.isAllDay).sort((a, b) => {
    const aTime = a.start ? new Date(a.start).getTime() : 0
    const bTime = b.start ? new Date(b.start).getTime() : 0
    return aTime - bTime
  })
  const sortedAnytime = nonOverdueTimeline.filter(o => o.isAllDay).sort((a, b) => {
    if (manualOrderIds) {
      const idxA = manualOrderIds.indexOf(a.templateId || '')
      const idxB = manualOrderIds.indexOf(b.templateId || '')
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
    }
    const tA = analyzedTemplates.find(t => t.template.id === a.templateId)?.template
    const tB = analyzedTemplates.find(t => t.template.id === b.templateId)?.template
    return (tA?.sortOrder ?? 0) - (tB?.sortOrder ?? 0)
  })
  
  const orderedItems = [...overdueOccurrences, ...sortedTimed, ...sortedAnytime]

  const getContextSubtitle = () => {
    // 1. Coding Contests Context (highest priority for developer user)
    const activeContest = upcomingEvents.find(e => e.templateName.toLowerCase().includes('codeforces') || e.templateName.toLowerCase().includes('leetcode'))
    if (activeContest) {
      const diffMins = Math.round((new Date(activeContest.start!).getTime() - currentTime.getTime()) / 60000)
      if (diffMins > 0 && diffMins <= 240) return `🔥 Next ${activeContest.templateName.split(' ')[0]} in ${Math.floor(diffMins/60)}h ${diffMins%60}m`
    }

    // 2. Overdue or Standard Context
    if (activeOverdue.length > 0) return `${activeOverdue.length} overdue ${activeOverdue.length === 1 ? 'activity' : 'activities'} need attention`
    const activeMeeting = activeEvents.find(e => e.type === 'MEETING')
    if (activeMeeting) return `Now: ${activeMeeting.templateName} is active`
    if (nextEvent) {
      const diffMins = Math.round((new Date(nextEvent.start!).getTime() - currentTime.getTime()) / 60000)
      if (diffMins > 0 && diffMins <= 120) return `Next: ${nextEvent.templateName} in ${diffMins} min`
    }
    return 'Nothing scheduled for the next 2 hours'
  }

  // ── Action handlers ──────────────────────────────────────────────────────
  // ── Action handlers ──────────────────────────────────────────────────────
  const cycleTaskStatus = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return
    
    // Read current states with optimistic overrides
    const optimisticVal = optimisticStatuses[occurrence.id]
    const currentCompleted = optimisticVal ? optimisticVal.completed : occurrence.completed
    const currentStatus = optimisticVal ? optimisticVal.status : occurrence.status
    
    const isCanceled = currentStatus === 'skipped'
    const isPostponed = currentStatus === 'postponed'
    const isDone = currentCompleted && !isCanceled && !isPostponed

    let nextCompleted = false
    let nextStatus: string | undefined = undefined

    if (!currentCompleted && !isCanceled && !isPostponed) {
      // Cleared -> Done
      const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
      nextCompleted = true
      nextStatus = matched?.template.category === 'finance' ? 'paid' : 'done'
    } else if (isDone) {
      // Done -> Canceled
      nextCompleted = true
      nextStatus = 'skipped'
    } else if (isCanceled) {
      // Canceled -> Postponed (or Cleared if daily)
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
      // Postponed -> Cleared
      nextCompleted = false
      nextStatus = undefined
    }

    // Apply optimistic updates immediately
    setOptimisticStatuses(prev => ({
      ...prev,
      [occurrence.id]: { completed: nextCompleted, status: nextStatus }
    }))

    setCompletingHabitId(occurrence.templateId)
    try {
      if (!currentCompleted && !isCanceled && !isPostponed) {
        // Cleared -> Done
        const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
        const status = matched?.template.category === 'finance' ? 'paid' : 'done'
        const amount = matched?.template.amount
        await markComplete(occurrence.templateId, todayStr, status, amount ?? null, null)
      } else if (isDone) {
        // Done -> Canceled
        if (occurrence.logId) {
          await updateLog(occurrence.logId, { status: 'skipped' })
        } else {
          await markComplete(occurrence.templateId, todayStr, 'skipped')
        }
      } else if (isCanceled) {
        // Canceled -> Postponed (or Cleared if daily)
        const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
        const isDaily = matched?.template.recurrenceType === 'daily'
        const isOneTime = matched?.template.recurrenceType === 'one_time'
        if (isDaily) {
          if (occurrence.logId) {
            await deleteLog(occurrence.logId)
          }
        } else if (isOneTime) {
          // For one_time tasks: use dedicated action that updates targetDate
          await postponeOneTimeTask(occurrence.templateId, todayStr, occurrence.logId)
        } else {
          if (occurrence.logId) {
            await updateLog(occurrence.logId, { status: 'postponed' })
          } else {
            await markComplete(occurrence.templateId, todayStr, 'postponed')
          }
        }
      } else if (isPostponed) {
        // Postponed -> Cleared
        const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
        const isOneTime = matched?.template.recurrenceType === 'one_time'
        if (isOneTime && occurrence.logId) {
          // For one_time tasks: revert targetDate back to today
          await unpostponeOneTimeTask(occurrence.templateId, occurrence.logId, todayStr)
        } else if (occurrence.logId) {
          await deleteLog(occurrence.logId)
        }
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to cycle task status:', err)
      // Rollback optimistic updates on failure
      setOptimisticStatuses(prev => {
        const copy = { ...prev }
        delete copy[occurrence.id]
        return copy
      })
    } finally {
      setCompletingHabitId(null)
    }
  }

  // ── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const dragIndex = Number(e.dataTransfer.getData('text/plain'))
    if (isNaN(dragIndex) || dragIndex === dropIndex) return

    const reordered = [...orderedItems]
    const [movedItem] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, movedItem)

    // Gather local templates that can be sorted
    const localTemplateIds = reordered
      .map(item => item.templateId)
      .filter((id): id is string => !!id)

    // Optimistically update order locally
    setManualOrderIds(localTemplateIds)

    try {
      await reorderActivityTemplates(localTemplateIds)
    } catch (err) {
      console.error('Failed to persist template order:', err)
    }
  }

  // handleHabit handlers removed as they are unused



  // getCardBgClass removed as it is unused

  // toggleCollapse removed as it is unused

  // Parse date from todayStr to avoid SSR hydration mismatch
  const todayDate = new Date(todayStr + 'T12:00:00Z')
  const dayName = todayDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const dayNum = todayDate.getUTCDate()
  const monthName = todayDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const todayLongDate = `${dayName} • ${dayNum} ${monthName}`

  // ── Section header ────────────────────────────────────────────────────────
  // renderSectionHeader removed as it is unused

  // Helper to determine semantic border and background colors
  // getCardClasses removed as it is unused

  // ── Timeline item card (unified flat style) ────────────────────────────────
  const renderTimelineItemCard = (occurrence: TimelineItem, index: number) => {
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
    
    // Map color names to Tailwind bg classes
    const colorBgClasses: Record<string, string> = {
      red: 'bg-red-500 dark:bg-red-400',
      orange: 'bg-orange-500 dark:bg-orange-400',
      amber: 'bg-amber-500 dark:bg-amber-400',
      green: 'bg-green-500 dark:bg-green-400',
      blue: 'bg-blue-500 dark:bg-blue-400',
      purple: 'bg-purple-500 dark:bg-purple-400',
      pink: 'bg-pink-500 dark:bg-pink-400',
      zinc: 'bg-zinc-500 dark:bg-zinc-400',
    }
    const colorBg = colorBgClasses[templateColor] || 'bg-zinc-500'

    // Read status from optimistic state if available
    const optimisticVal = optimisticStatuses[occurrence.id]
    const isCanceled = optimisticVal ? optimisticVal.status === 'skipped' : occurrence.status === 'skipped'
    const isPostponed = optimisticVal ? optimisticVal.status === 'postponed' : occurrence.status === 'postponed'
    const isDone = optimisticVal ? (optimisticVal.completed && !isCanceled && !isPostponed) : (occurrence.completed && !isCanceled && !isPostponed)

    // Status border color strip
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
        draggable={!isGoogleCalendar}
        onDragStart={(e) => handleDragStart(e, index)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, index)}
        className={`flex items-center gap-3 px-3 py-1.5 transition-all duration-150 group relative hover:bg-[var(--color-accent)]/30 ${
          isGoogleCalendar ? '' : 'cursor-move'
        } ${
          isDone ? 'opacity-65' : isCanceled || isPostponed ? 'opacity-40' : ''
        }`}
      >
        {/* Left Indicator Strip inside card */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusIndicatorColor}`} />

        {/* ── Custom Cycling Checkbox Component ── */}
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

        {/* ── Category Icon ── */}
        <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
          isGoogleCalendar 
            ? 'bg-[var(--color-external)]/10 border-[var(--color-external)]/20 text-[var(--color-external)]' 
            : `${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`
        }`}>
          <Icon name={occurrence.icon || template?.icon || 'CheckSquare'} size={12} />
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold leading-tight truncate ${
              isDone || isCanceled
                ? 'line-through text-[var(--color-text-muted)]'
                : 'text-[var(--color-text-main)]'
            }`}>
              {occurrence.htmlLink ? (
                <a href={occurrence.htmlLink} target="_blank" rel="noopener noreferrer"
                  className="hover:underline inline-flex items-center gap-1">
                  <span className="truncate">{occurrence.templateName}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-40 shrink-0" />
                </a>
              ) : occurrence.templateName}
            </span>
            {isGoogleCalendar && (
              <span className="shrink-0 text-[8px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded bg-[var(--color-external)]/10 text-[var(--color-external)] border border-[var(--color-external)]/20">
                Google Calendar
              </span>
            )}
            {isTimed && startTimeLabel && (
              <span className={`shrink-0 text-[9px] font-mono font-bold px-1 py-0.5 rounded-sm border ${
                isGoogleCalendar 
                  ? 'text-[var(--color-external)] border-[var(--color-external)]/25 bg-[var(--color-external)]/5' 
                  : `${colorClasses.text} ${colorClasses.border} ${colorClasses.bg}`
              }`}>
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

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalActivities = timeline.length
  const completedCount = timeline.filter(t => t.completed && t.status !== 'skipped').length
  const progressPct = totalActivities > 0 ? Math.round((completedCount / totalActivities) * 100) : 0

  // ── Render ────────────────────────────────────────────────────────────────
  const todayJournal = journalEntries.find(e => {
    const entryDateStr = typeof e.journalDate === 'string' 
      ? e.journalDate.split('T')[0] 
      : new Date(e.journalDate).toISOString().split('T')[0]
    return entryDateStr === todayStr
  })

  const stripHtml = (htmlStr: string) => {
    return htmlStr.replace(/<[^>]*>/g, '')
  }

  // Compute approved leaves used
  const usedByType: Record<string, number> = {}
  leaveRecords.filter(r => r.status === 'APPROVED').forEach(r => {
    usedByType[r.leaveType] = (usedByType[r.leaveType] ?? 0) + r.totalDays
  })
  const leaveTypes = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF']
  const leaveLabels: Record<string, string> = {
    CASUAL: 'Casual', SICK: 'Sick', PTO: 'PTO', COMP_OFF: 'Comp Off'
  }
  const leaveColors: Record<string, string> = {
    CASUAL: 'text-blue-500 border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10',
    SICK: 'text-red-500 border-red-500/20 bg-red-500/5 dark:bg-red-500/10',
    PTO: 'text-purple-500 border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10',
    COMP_OFF: 'text-amber-500 border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10'
  }

  // Weight Sparkline data formatting
  const sparklineData = [...weightRecords]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(r => ({
      date: typeof r.date === 'string' ? r.date : r.date.toISOString(),
      weight: r.weight
    }))
  const latestWeightRecord = weightRecords.length > 0
    ? [...weightRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : null

  return (
    <div className="w-full">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">Today</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 font-normal">
            {todayLongDate} • {getContextSubtitle()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {calendarData.connected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRefetchCalendar(true)}
              isLoading={calendarData.loading}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              className="font-semibold shadow-xs"
            >
              Refresh
            </Button>
          )}
          <Button onClick={onOpenCreateActivity} size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
            New Activity
          </Button>
        </div>
      </div>

      {/* 2-column grid layout on desktop, single column on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3.25fr)_minmax(0,1.25fr)] gap-8 items-start">

        {/* ── Left Column: Timeline feed ── */}
        <div className="space-y-6 min-w-0">
          
          {/* Minimal Progress bar */}
          {totalActivities > 0 && (
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]/40 pb-2 mb-2">
              <span className="font-semibold">
                Today&apos;s Progress: <span className="text-[var(--color-text-main)] font-mono">{completedCount}/{totalActivities}</span> ({progressPct}%)
              </span>
              <div className="w-24 h-1 bg-[var(--color-border)] rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-[var(--color-completed)] transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Flat List Container */}
          {calendarData.loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : (
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]/40 overflow-hidden shadow-xs">
              {orderedItems.length === 0 ? (
                <EmptyState title="Your Day is Clear! 🎉" description="No activities scheduled for today." />
              ) : (
                orderedItems.map((o, idx) => renderTimelineItemCard(o, idx))
              )}
              <div className="p-2.5 bg-[var(--color-bg-subtle)]/60 border-t border-[var(--color-border)]/60 flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="+ Type a task for today and press Enter..."
                    value={quickTaskTitle}
                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                    onKeyDown={handleQuickTaskKeyDown}
                    className="text-xs bg-[var(--color-bg-surface)] placeholder:text-[var(--color-text-muted)]"
                    disabled={isCreatingQuickTask}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateQuickTask}
                  isLoading={isCreatingQuickTask}
                  disabled={!quickTaskTitle.trim() || isCreatingQuickTask}
                  className="shrink-0 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Metrics & Modular Widgets ── */}
        <div className="space-y-6 xl:sticky xl:top-6">
          
          {/* Today's Journal Card */}
      {/* Work Presence Tracker Card */}
      {workTemplateId && (
        <Card className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
          <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
            <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
              Work Hours Tracker
            </span>
            <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
          </div>

          <div className="space-y-3">
            {/* Status Segmented Controls */}
            <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[9px] border border-[var(--color-border)]">
              {(['cleared', 'office', 'wfh'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setWorkStatus(status)}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-md capitalize transition-all duration-150 cursor-pointer ${
                    workStatus === status
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

            {/* Action Save Button */}
            <Button
              onClick={handleSaveWorkPresence}
              isLoading={isLoggingWork}
              variant="primary"
              size="sm"
              className="w-full font-bold text-xs"
            >
              Save Presence
            </Button>

            {/* Progress Section */}
            <div className="border-t border-[var(--color-border)]/50 pt-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-[var(--color-text-muted)]">
                <span>Weekly Office Presence</span>
                <span className="font-mono text-[var(--color-text-main)]">
                  {totalOfficeHours}h / {weeklyGoal}h
                </span>
              </div>
              <div className="w-full h-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isGoalMet ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, (totalOfficeHours / weeklyGoal) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-semibold text-[var(--color-text-muted)]">
                <span>
                  {isGoalMet ? '🎉 Weekly Goal Met!' : `${remainingHours.toFixed(1)}h remaining`}
                </span>
                {totalWfhHours > 0 && (
                  <span>WFH: <span className="font-mono text-[var(--color-text-main)]">{totalWfhHours}h</span></span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
        <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
          <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-[var(--color-personal)]" />
            Journal Today
          </span>
          {todayJournal?.mood && (
            <span className="text-sm p-1 bg-[var(--color-accent)] rounded-lg animate-bounce" title={`Mood: ${todayJournal.mood}`}>
              {todayJournal.mood}
            </span>
          )}
        </div>
            {todayJournal ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--color-text-main)] leading-relaxed line-clamp-3 italic">
                  &ldquo;{stripHtml(todayJournal.content)}&rdquo;
                </p>
                <Button
                  onClick={() => onTabChange('journal')}
                  size="sm"
                  className="w-full text-center"
                >
                  Open Full Journal
                </Button>
              </div>
            ) : (
              <div className="space-y-2 text-center py-2">
                <p className="text-xs text-[var(--color-text-muted)] italic">No entry written for today yet.</p>
                <Button
                  onClick={() => onTabChange('journal')}
                  size="sm"
                  className="w-full"
                >
                  Write Entry
                </Button>
              </div>
            )}
          </Card>

          {/* Time Off Status Card */}
          <Card className="p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
            <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
              <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
                <CalendarX className="w-3.5 h-3.5 text-[var(--color-overdue)]" />
                Time Off
              </span>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">Remaining</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {leaveTypes.map(type => {
                const allowance = leaveAllowances.find(a => a.leaveType === type)?.allowance ?? 0
                const used = usedByType[type] ?? 0
                const remaining = Math.max(0, allowance - used)
                return (
                  <div key={type} className={`border border-[var(--color-border)] p-2 rounded-xl flex flex-col justify-center ${leaveColors[type] || ''}`}>
                    <div className="text-sm font-black tabular-nums">{remaining} / {allowance}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider opacity-85 mt-0.5">{leaveLabels[type] || type}</div>
                  </div>
                )
              })}
            </div>
            <Button
              onClick={() => onTabChange('leave')}
              size="sm"
              className="w-full"
            >
              Request Time Off
            </Button>
          </Card>

          {/* Weight Tracker Card */}
          <Card className="p-4 space-y-3 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
            <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
              <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
                <Scale className="w-3.5 h-3.5 text-[var(--color-completed)]" />
                Weight Graph
              </span>
              {latestWeightRecord && (
                <span className="text-xs font-black text-[var(--color-text-main)] tabular-nums">
                  {latestWeightRecord.weight.toFixed(1)} kg
                </span>
              )}
            </div>
            {sparklineData.length >= 2 ? (
              <div className="pt-2">
                <Sparkline data={sparklineData} width={280} height={120} />
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[var(--color-text-muted)] italic">
                Need at least 2 logs to show weight graph.
              </div>
            )}
          </Card>

          {/* Secure Vault Card */}
          <Card className="p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
            <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
              <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[var(--color-external)]" />
                Secure Vault
              </span>
              <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />
            </div>

            {/* Active Documents List */}
            {vaultLoading ? (
              <div className="space-y-1.5 py-1">
                {[1, 2].map(i => <Skeleton key={i} className="h-6 w-full rounded-md" />)}
              </div>
            ) : vaultItems.length > 0 ? (
              <div className="space-y-1 py-0.5">
                {vaultItems.map((item: VaultItem) => {
                  const IconComponent = getVaultIcon(item.mimeGroup)
                  const iconColor = getVaultIconColor(item.mimeGroup)
                  return (
                    <div 
                      key={item.id}
                      onClick={() => onTabChange('documents')}
                      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-[var(--color-accent)]/50 transition-colors cursor-pointer border border-transparent hover:border-[var(--color-border)] group/vaultitem"
                    >
                      <IconComponent className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
                      <span className="text-xs text-[var(--color-text-main)] font-semibold truncate flex-1 group-hover/vaultitem:text-[var(--color-primary)]">
                        {item.searchName}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0">
                        {item.extension ? `.${item.extension}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-2 text-center text-xs text-[var(--color-text-muted)] italic">
                No files in vault yet.
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  )
}
