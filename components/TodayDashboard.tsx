"use client"

import React, { useState, useEffect } from 'react'
import { useStore } from '@/lib/store/store'
import { Skeleton, EmptyState, Button, Card, Input } from '@/design-system'
import {
  ExternalLink, Check, Plus, ArrowRightCircle,
  Scale, Shield, BookOpen, CalendarX, Lock,
  FileText, FileImage, FileVideo, FileArchive, FileCode, FileSpreadsheet, File,
  RefreshCw, Clock, Briefcase, GripVertical, ChevronLeft, ChevronRight, MoreVertical
} from 'lucide-react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis, TimelineItem } from '@/types'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { Icon } from './Icon'
import { useRouter } from 'next/navigation'
import { useActivityNotifications } from '@/lib/hooks/useActivityNotifications'
import { Sparkline } from './WeightPanel'
import { listVaultItems, VaultItem } from '@/app/actions/vault'
import { getTemplateColorClasses } from '@/lib/colors'
import { CompletionService } from '@/lib/services/CompletionService'
import { CompletionDialog } from './CompletionDialog'

interface TestAnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

export interface TodayDashboardProps {
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
  const { setTaskStatusAction, deleteActivityLog, createActivityTemplateAction, reorderActivityTemplatesAction, logWorkPresenceAction, logWeightAction } = useStore()
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null)
  const [activeCompletion, setActiveCompletion] = useState<{
    template: ActivityTemplate
    occurrence: TimelineItem
  } | null>(null)

  // Scheduler form state
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [vaultLoading, setVaultLoading] = useState(true)
  const [widgetsVisibility, setWidgetsVisibility] = useState<Record<string, boolean>>(() => {
    const defaults = {
      tasks: true,
      workHours: true,
      journal: true,
      leaveBalance: true,
      weight: true,
      recentDocuments: true,
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_dashboard_widgets')
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

    const handleSettingsUpdate = () => {
      const updated = localStorage.getItem('personal_dashboard_widgets')
      if (updated) {
        try {
          setWidgetsVisibility(prev => ({ ...prev, ...JSON.parse(updated) }))
        } catch (e) {
          console.error(e)
        }
      }
    }
    window.addEventListener('personal_settings_changed', handleSettingsUpdate)
    return () => window.removeEventListener('personal_settings_changed', handleSettingsUpdate)
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

  const [weeklyGoal, setWeeklyGoal] = useState(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('personal_weekly_goal')
      if (val) return Number(val)
    }
    return 27
  })

  useEffect(() => {
    const handleSettingsChange = () => {
      const val = localStorage.getItem('personal_weekly_goal')
      if (val) setWeeklyGoal(Number(val))
    }
    window.addEventListener('personal_settings_changed', handleSettingsChange)
    return () => window.removeEventListener('personal_settings_changed', handleSettingsChange)
  }, [])

  const remainingHours = Math.max(0, weeklyGoal - totalOfficeHours)
  const isGoalMet = totalOfficeHours >= weeklyGoal

  // Work Tracker state
  const [workStatus, setWorkStatus] = useState<'office' | 'wfh' | 'cleared'>(() => {
    if (todayWorkLog) {
      return todayWorkLog.status === 'wfh' ? 'wfh' : 'office'
    }
    return 'cleared'
  })

  const [loggingMode, setLoggingMode] = useState<'time' | 'manual'>(() => {
    const payload = todayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.loggingMode as 'time' | 'manual') || (payload?.inTime ? 'time' : 'manual')
  })

  const [inTime, setInTime] = useState(() => {
    const payload = todayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.inTime as string) || '09:00'
  })

  const [outTime, setOutTime] = useState(() => {
    const payload = todayWorkLog?.payload as Record<string, unknown> | null
    return (payload?.outTime as string) || ''
  })

  const [manualHours, setManualHours] = useState(() => {
    const payload = todayWorkLog?.payload as Record<string, unknown> | null
    if (payload?.manualHours !== undefined) return Number(payload.manualHours)
    return todayWorkLog?.amount || 8.0
  })

  const [isLoggingWork, setIsLoggingWork] = useState(false)

  // Sync state with incoming props on log updates during render to avoid useEffect warnings
  const [prevLogId, setPrevLogId] = useState(todayWorkLog?.id)
  if (todayWorkLog?.id !== prevLogId) {
    setPrevLogId(todayWorkLog?.id)
    if (todayWorkLog) {
      setWorkStatus(todayWorkLog.status === 'wfh' ? 'wfh' : 'office')
      const payload = todayWorkLog.payload as Record<string, unknown> | null
      setLoggingMode((payload?.loggingMode as 'time' | 'manual') || (payload?.inTime ? 'time' : 'manual'))
      setInTime((payload?.inTime as string) || '09:00')
      setOutTime((payload?.outTime as string) || '')
      setManualHours(payload?.manualHours !== undefined ? Number(payload.manualHours) : (todayWorkLog.amount || 8.0))
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
    if (!inT || !outT) return 0
    const [inH, inM] = inT.split(':').map(Number)
    const [outH, outM] = outT.split(':').map(Number)
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (diffMins < 0) diffMins += 24 * 60 // handle overnight shifts
    return parseFloat((diffMins / 60).toFixed(1))
  }

  const handleSaveWorkPresence = async () => {
    if (!workTemplateId || isLoggingWork) return
    
    // Validation
    if (workStatus !== 'cleared') {
      if (loggingMode === 'manual') {
        if (isNaN(manualHours) || manualHours < 0 || manualHours > 24) {
          alert('Please enter a valid number of hours between 0 and 24.')
          return
        }
      } else {
        if (!inTime) {
          alert('Please select a start time.')
          return
        }
      }
    }

    setIsLoggingWork(true)
    try {
      let computedHours = 0
      if (workStatus !== 'cleared') {
        if (loggingMode === 'time') {
          computedHours = outTime ? computeOfficeHours(inTime, outTime) : 0
        } else {
          computedHours = manualHours
        }
      }

      await logWorkPresenceAction({
        templateId: workTemplateId,
        date: todayStr,
        status: workStatus,
        inTime: workStatus !== 'cleared' && loggingMode === 'time' ? inTime : null,
        outTime: workStatus !== 'cleared' && loggingMode === 'time' ? (outTime || null) : null,
        hours: computedHours,
        loggingMode: workStatus !== 'cleared' ? loggingMode : null,
        manualHours: workStatus !== 'cleared' && loggingMode === 'manual' ? manualHours : null
      })
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

  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [isCreatingQuickTask, setIsCreatingQuickTask] = useState(false)
  const [quickTaskColor, setQuickTaskColor] = useState<string>('blue')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [allowDragIndex, setAllowDragIndex] = useState<number | null>(null)

  const handleCreateQuickTask = async () => {
    const title = quickTaskTitle.trim()
    if (!title || isCreatingQuickTask) return

    setIsCreatingQuickTask(true)
    setQuickTaskTitle('')
    try {
      await createActivityTemplateAction({
        name: title,
        category: 'general',
        type: 'TASK',
        priority: 'NORMAL',
        icon: 'CheckSquare',
        color: quickTaskColor,
        recurrenceType: 'one_time',
        targetDate: `${todayStr}T00:00:00.000Z`
      })
      router.refresh()
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
      if (diffMins > 0 && diffMins <= 240) return `🔥 Next ${activeContest.templateName.split(' ')[0]} in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
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

    const matchedTemplate = analyzedTemplates.find(t => t.template.id === occurrence.templateId)?.template
    if (!matchedTemplate) return

    const isDone = occurrence.completed && occurrence.status !== 'skipped' && occurrence.status !== 'postponed'
    
    if (isDone) {
      setCompletingHabitId(occurrence.templateId)
      try {
        await setTaskStatusAction(occurrence, todayStr, 'cleared')
      } catch (err) {
        console.error('Failed to clear task status:', err)
      } finally {
        setCompletingHabitId(null)
      }
    } else {
      const isWeightLoggedToday = weightRecords.some(r => {
        const dStr = typeof r.date === 'string' ? r.date.split('T')[0] : r.date.toISOString().split('T')[0]
        return dStr === todayStr
      })

      if (CompletionService.needsPrompting(matchedTemplate, isWeightLoggedToday)) {
        setActiveCompletion({ template: matchedTemplate, occurrence })
        return
      }

      setCompletingHabitId(occurrence.templateId)
      try {
        await setTaskStatusAction(occurrence, todayStr, 'done')
      } catch (err) {
        console.error('Failed to set task status done:', err)
      } finally {
        setCompletingHabitId(null)
      }
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
      await reorderActivityTemplatesAction(localTemplateIds)
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

  const isScheduledOnDate = (temp: ActivityTemplate, dStr: string): boolean => {
    if (!isOccurrenceValidForDate(temp, dStr)) return false
    if (temp.recurrenceType === 'daily') return true
    if (temp.recurrenceType === 'one_time') return temp.targetDate ? temp.targetDate.split('T')[0] === dStr : false
    if (temp.recurrenceType === 'weekly') {
      const date = new Date(dStr + 'T12:00:00Z')
      const dayOfWeek = date.getUTCDay()
      if (!temp.recurrenceDaysOfWeek) return true
      const days = temp.recurrenceDaysOfWeek.split(',').map(Number)
      return days.includes(dayOfWeek)
    }
    if (temp.recurrenceType === 'monthly') {
      const date = new Date(dStr + 'T12:00:00Z')
      const dayOfMonth = date.getUTCDate()
      return temp.recurrenceDayOfMonth ? temp.recurrenceDayOfMonth === dayOfMonth : true
    }
    return true
  }

  const getEffectiveFromStr = (effectiveFrom?: Date | string | null): string | null => {
    if (!effectiveFrom) return null
    const d = (effectiveFrom instanceof Date) ? effectiveFrom : new Date(effectiveFrom)
    if (isNaN(d.getTime())) return null
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const isOccurrenceValidForDate = (template: ActivityTemplate, dateStr: string): boolean => {
    if (!template.effectiveFrom) return true
    const effStr = getEffectiveFromStr(template.effectiveFrom)
    if (!effStr) return true
    return dateStr >= effStr
  }

  const diffUTCDays = (dateStr1: string, dateStr2: string): number => {
    const parseUDate = (str: string) => {
      const [year, month, day] = str.split('-').map(Number)
      return new Date(Date.UTC(year, month - 1, day))
    }
    const d1 = parseUDate(dateStr1)
    const d2 = parseUDate(dateStr2)
    const diffTime = d1.getTime() - d2.getTime()
    return Math.round(diffTime / (1000 * 60 * 60 * 24))
  }

  const renderTaskHistory = (templateId: string) => {
    const matched = analyzedTemplates.find(t => t.template.id === templateId)
    if (!matched) return null
    const template = matched.template
    
    const taskLogs = logs.filter(l => l.activityId === templateId)
    const completedLogs = taskLogs.filter(l => l.status === 'done' || l.status === 'paid')

    // 1. Last Completed calculation
    const lastCompletedLog = [...completedLogs].sort((a, b) => b.date.localeCompare(a.date))[0]
    let lastCompletedMain = 'Never completed'
    let lastCompletedSub = ''
    if (lastCompletedLog) {
      const logDateStr = lastCompletedLog.date
      const diff = diffUTCDays(todayStr, logDateStr)
      if (diff === 0) {
        lastCompletedMain = '✓ Today'
      } else if (diff === 1) {
        lastCompletedMain = '✓ Yesterday'
      } else {
        lastCompletedMain = `✓ ${diff} days ago`
      }
      
      const createdTime = lastCompletedLog.createdAt ? new Date(lastCompletedLog.createdAt) : null
      if (createdTime) {
        const dayMonth = createdTime.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        const timeStr = createdTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        lastCompletedSub = `(${dayMonth} • ${timeStr})`
      }
    }

    // 2. Next Due calculation
    const nextDueDate = matched.analysis.nextDueDate
    let nextDueText = '—'
    let nextDueColorClass = 'text-[var(--color-text-main)] font-semibold'
    if (nextDueDate) {
      const diff = diffUTCDays(nextDueDate, todayStr)
      if (diff === 0) {
        nextDueText = 'Today'
      } else if (diff === 1) {
        nextDueText = 'Tomorrow'
      } else if (diff < 0) {
        const overdueDays = Math.abs(diff)
        nextDueText = `Overdue by ${overdueDays} day${overdueDays > 1 ? 's' : ''}`
        nextDueColorClass = 'text-rose-500 font-bold'
      } else {
        nextDueText = `In ${diff} days`
      }
    }

    // 3. Usually Done calculation
    let usualTimeStr = '—'
    let totalMinutes = 0
    let validTimesCount = 0
    completedLogs.forEach(l => {
      if (l.createdAt) {
        const d = new Date(l.createdAt)
        const minutes = d.getHours() * 60 + d.getMinutes()
        totalMinutes += minutes
        validTimesCount++
      }
    })
    if (validTimesCount > 0) {
      const avgMinutes = Math.round(totalMinutes / validTimesCount)
      const avgHours = Math.floor(avgMinutes / 60)
      const avgMins = avgMinutes % 60
      const ampm = avgHours >= 12 ? 'PM' : 'AM'
      const displayHours = avgHours % 12 || 12
      const displayMins = String(avgMins).padStart(2, '0')
      usualTimeStr = `${displayHours}:${displayMins} ${ampm}`
    }

    // 4. Completion Rate (This Month)
    const [currYear, currMonth] = todayStr.split('-')
    const monthlyLogs = taskLogs.filter(l => l.date.startsWith(`${currYear}-${currMonth}`))
    const completedMonth = monthlyLogs.filter(l => l.status === 'done' || l.status === 'paid').length
    
    const startOfMonthStr = `${currYear}-${currMonth}-01`
    let expectedMonthCount = 0
    const startMonthDate = new Date(startOfMonthStr + 'T12:00:00Z')
    const currentDateObj = new Date(todayStr + 'T12:00:00Z')
    const loopDate = new Date(startMonthDate)
    while (loopDate <= currentDateObj) {
      const dStr = loopDate.toISOString().split('T')[0]
      if (isScheduledOnDate(template, dStr)) {
        expectedMonthCount++
      }
      loopDate.setUTCDate(loopDate.getUTCDate() + 1)
    }
    const monthlyCompletionRate = expectedMonthCount > 0 
      ? Math.round((completedMonth / expectedMonthCount) * 100) 
      : 0

    // Streak calculation
    const streak = matched.analysis.streak ?? 0
    const showStreak = template.recurrenceType !== 'one_time' && streak > 0
    let streakText = ''
    if (showStreak) {
      if (template.recurrenceType === 'daily') {
        streakText = `${streak} day streak`
      } else if (template.recurrenceType === 'weekly') {
        streakText = `${streak} week streak`
      } else if (template.recurrenceType === 'monthly') {
        streakText = `${streak} month streak`
      }
    }

    // Recent 7 Days History
    const recentDays: { weekday: string; symbol: string; colorClass: string; isToday: boolean; dateStr: string }[] = []
    const todayDateObj = new Date(todayStr + 'T12:00:00Z')
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDateObj)
      d.setUTCDate(todayDateObj.getUTCDate() - i)
      const dStr = d.toISOString().split('T')[0]
      const weekday = d.toLocaleDateString(undefined, { weekday: 'narrow' })
      const isToday = dStr === todayStr
      
      const log = taskLogs.find(l => l.date === dStr)
      let symbol = '○'
      let colorClass = 'text-slate-300 dark:text-zinc-700'
      if (log) {
        if (log.status === 'done' || log.status === 'paid') {
          symbol = '✓'
          colorClass = 'text-emerald-500 font-bold'
        } else if (log.status === 'skipped') {
          symbol = '✗'
          colorClass = 'text-rose-500 font-bold'
        } else if (log.status === 'postponed') {
          symbol = '→'
          colorClass = 'text-blue-500 font-bold'
        }
      } else {
        if (isScheduledOnDate(template, dStr) && dStr < todayStr) {
          symbol = '✗'
          colorClass = 'text-slate-350 dark:text-zinc-650'
        }
      }
      recentDays.push({ weekday, symbol, colorClass, isToday, dateStr: dStr })
    }

    // Helper to get structured log preview
    const getLogValuePreview = (log: ActivityLog): string => {
      const config = CompletionService.getCompletionConfig(template)
      const inputType = config.value?.inputType
      const unit = config.value?.unit

      if (log.amount !== null && log.amount !== undefined) {
        if (inputType === 'currency') {
          const symbol = unit || '₹'
          return `${symbol}${log.amount}`
        }
        if (unit) {
          return `${log.amount} ${unit}`
        }
        const catLower = template.category.toLowerCase()
        if (catLower.includes('finance') || template.type === 'BILL') {
          return `₹${Number(log.amount)}`
        }
        if (template.name.toLowerCase().includes('water') || catLower.includes('water')) {
          return `${log.amount} L`
        }
        return `${log.amount}`
      }

      if (log.payload) {
        try {
          const p = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload
          if (p.weight) return `${p.weight} kg`
          if (p.value !== undefined && p.value !== null) {
            if (inputType === 'currency') {
              const symbol = unit || '₹'
              return `${symbol}${p.value}`
            }
            if (unit) return `${p.value} ${unit}`
            return `${p.value}`
          }
          if (p.amount) return `₹${p.amount}`
          if (p.liters) return `${p.liters} L`
          if (p.exercises && Array.isArray(p.exercises)) {
            return p.exercises.map((e: { name: string; sets?: unknown[] }) => `${e.name} (${e.sets?.length || 0} sets)`).join(', ')
          }
        } catch {
          // ignore
        }
      }

      return log.note || ''
    }

    // Last entry details
    const lastLogWithContent = [...taskLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .find(l => (l.note && l.note.trim()) || l.amount !== null || l.payload || l.journalEntryId)

    let entryLabel = ''
    let entryText = ''
    let entryDateStr = ''
    
    if (lastLogWithContent) {
      entryDateStr = lastLogWithContent.date
      const nameLower = template.name.toLowerCase()
      const catLower = template.category.toLowerCase()
      
      if (nameLower.includes('weight') || catLower.includes('weight')) {
        entryLabel = 'Weight'
      } else if (nameLower.includes('journal') || catLower.includes('journal')) {
        entryLabel = 'Journal'
      } else if (nameLower.includes('read') || catLower.includes('read') || catLower.includes('learning')) {
        entryLabel = 'Reading'
      } else if (catLower.includes('finance') || catLower.includes('expense') || template.type === 'BILL') {
        entryLabel = 'Expense'
      } else if (nameLower.includes('water') || catLower.includes('water')) {
        entryLabel = 'Water Intake'
      } else {
        entryLabel = template.name
      }
      
      entryText = getLogValuePreview(lastLogWithContent)
    }

    const handleLastEntryClick = (e: React.MouseEvent) => {
      if (!lastLogWithContent) return
      e.stopPropagation()
      onTabChange('journal')
      router.push(`/?date=${lastLogWithContent.date}`)
    }

    return (
      <div className="px-10 py-3 bg-slate-50/20 dark:bg-zinc-950/10 border-t border-[var(--color-border)]/20 text-xs text-[var(--color-text-muted)] space-y-3 transition-all duration-300">
        {/* Row 1 — Primary Status */}
        <div className={`grid gap-4 ${showStreak ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
          <div className="space-y-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Last Completed</span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-[var(--color-text-main)]">{lastCompletedMain}</span>
              {lastCompletedSub && <span className="text-[10px] text-slate-400 dark:text-zinc-500">{lastCompletedSub}</span>}
            </div>
          </div>
          
          <div className="space-y-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Next Due</span>
            <span className={`block text-xs ${nextDueColorClass}`}>{nextDueText}</span>
          </div>

          <div className="space-y-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Usually Done</span>
            <span className="block text-xs font-semibold text-[var(--color-text-main)]">{usualTimeStr}</span>
          </div>

          <div className="space-y-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Completion Rate</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-[var(--color-text-main)]">{completedMonth} / {expectedMonthCount}</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">{monthlyCompletionRate}%</span>
            </div>
          </div>

          {showStreak && (
            <div className="space-y-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Streak</span>
              <span className="block text-xs font-semibold text-orange-500 dark:text-orange-400">🔥 {streakText}</span>
            </div>
          )}
        </div>

        {/* Row 2 — Recent History */}
        <div className="flex items-center gap-4 pt-1 border-t border-[var(--color-border)]/10">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Recent</span>
            <div className="flex items-center gap-1.5">
              {recentDays.map((rd, i) => (
                <div
                  key={i}
                  className={`flex flex-col items-center px-1.5 py-0.5 rounded text-center min-w-5 ${
                    rd.isToday ? 'bg-slate-100 dark:bg-zinc-800 ring-1 ring-[var(--color-border)]/40 font-bold' : ''
                  }`}
                  title={rd.dateStr}
                >
                  <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-650 leading-none">{rd.weekday}</span>
                  <span className={`text-[11px] leading-tight ${rd.colorClass}`}>{rd.symbol}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3 — Last Entry */}
        {lastLogWithContent && (
          <div className="pt-2 border-t border-[var(--color-border)]/15">
            <button
              type="button"
              onClick={handleLastEntryClick}
              className="text-left group flex items-baseline gap-2 max-w-full cursor-pointer hover:underline"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 shrink-0">
                {entryLabel}
              </span>
              <span className="text-xs text-[var(--color-text-main)] font-medium truncate block leading-tight max-w-[400px]">
                {entryText ? `"${entryText}"` : '—'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 font-normal">
                ({new Date(entryDateStr + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
              </span>
            </button>
          </div>
        )}
      </div>
    )
  }

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

    const isCanceled = occurrence.status === 'skipped'
    const isPostponed = occurrence.status === 'postponed'
    const isDone = occurrence.completed && !isCanceled && !isPostponed

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

    const isExpanded = expandedTaskId === occurrence.templateId

    return (
      <div key={occurrence.id} className="flex flex-col border-b border-[var(--color-border)]/40 last:border-b-0">
        <div
          draggable={!isGoogleCalendar && allowDragIndex === index}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
          onClick={() => {
            if (!isGoogleCalendar && occurrence.templateId) {
              setExpandedTaskId(expandedTaskId === occurrence.templateId ? null : occurrence.templateId)
            }
          }}
          className={`flex items-center gap-3 px-3 py-2.5 transition-all duration-150 group relative hover:bg-[var(--color-accent)]/30 ${
            isGoogleCalendar ? '' : 'cursor-pointer'
          } ${isDone ? 'opacity-65' : isCanceled || isPostponed ? 'opacity-40' : ''}`}
        >
          {/* Left Indicator Strip inside card */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusIndicatorColor}`} />

          {/* ── Custom Cycling Checkbox Component ── */}
          <button
            disabled={completingHabitId === occurrence.templateId}
            onClick={(e) => {
              e.stopPropagation()
              cycleTaskStatus(occurrence)
            }}
            title={`Status: ${isDone ? 'Done' : isCanceled ? 'Canceled' : isPostponed ? 'Postponed' : 'Cleared'}. Click to cycle.`}
            aria-label="Cycle task status"
            className="shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 active:scale-90 disabled:opacity-50"
          >
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300 shadow-xs ${completingHabitId === occurrence.templateId ? 'bg-slate-100 dark:bg-zinc-800 border-[var(--color-border)]' :
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
          <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${isGoogleCalendar
              ? 'bg-[var(--color-external)]/10 border-[var(--color-external)]/20 text-[var(--color-external)]'
              : `${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`
            }`}>
            <Icon name={occurrence.icon || template?.icon || 'CheckSquare'} size={12} />
          </div>

          {/* ── Content ── */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold leading-tight truncate ${isDone || isCanceled
                  ? 'line-through text-[var(--color-text-muted)]'
                  : 'text-[var(--color-text-main)]'
                }`}>
                {occurrence.htmlLink ? (
                  <a href={occurrence.htmlLink} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline inline-flex items-center gap-1">
                    <span className="truncate">{occurrence.templateName}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-40 shrink-0" />
                  </a>
                ) : occurrence.templateName}
              </span>
              {isGoogleCalendar && (
                <span className="shrink-0 text-[8px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded bg(--color-external)/10 text-[var(--color-external)] border border-[var(--color-external)]/20">
                  Google Calendar
                </span>
              )}
              {isTimed && startTimeLabel && (
                <span className={`shrink-0 text-[9px] font-mono font-bold px-1 py-0.5 rounded-sm border ${isGoogleCalendar
                    ? 'text-[var(--color-external)] border-[var(--color-external)]/25 bg-[var(--color-external)]/5'
                    : `${colorClasses.text} ${colorClasses.border} ${colorClasses.bg}`
                  }`}>
                  {startTimeLabel}
                  {estimatedDuration ? ` • ${estimatedDuration}m` : ''}
                </span>
              )}
              {streak > 1 && !isDone && !isCanceled && (
                <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-extrabold text-orange-500 bg-orange-500/10 px-1 py-0.5 rounded-sm border border-orange-500/25" title={`${streak} day streak!`}>
                  🔥 {streak}
                </span>
              )}
            </div>
          </div>

          {/* Three-Dot Menu button */}
          {!isGoogleCalendar && (
            <div className="relative shrink-0 flex items-center ml-auto mr-1">
              <button
                type="button"
                title="More Actions"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveMenuId(activeMenuId === occurrence.id ? null : occurrence.id)
                }}
                className="p-1 rounded-sm text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {activeMenuId === occurrence.id && (
                <div className="absolute right-0 bottom-6 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 z-50 w-44 animate-in slide-in-from-bottom-2 duration-100">
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation()
                      setActiveMenuId(null)
                      await cycleTaskStatus(occurrence)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-main)] hover:bg-[var(--color-accent)]/10 font-medium transition-colors"
                  >
                    {isDone ? 'Mark Uncompleted' : 'Mark Completed'}
                  </button>

                  {!isCanceled && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        setActiveMenuId(null)
                        await setTaskStatusAction(occurrence, todayStr, 'skipped')
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-medium transition-colors"
                    >
                      Skip / Cancel Today
                    </button>
                  )}

                  {!isPostponed && template?.recurrenceType !== 'daily' && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        setActiveMenuId(null)
                        await setTaskStatusAction(occurrence, todayStr, 'postponed')
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 font-medium transition-colors"
                    >
                      Postpone to Tomorrow
                    </button>
                  )}

                  {occurrence.templateId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveMenuId(null)
                        onOpenCreateActivity()
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]/10 font-medium transition-colors border-t border-[var(--color-border)]/50 mt-1 pt-1"
                    >
                      Edit Template
                    </button>
                  )}

                  {(occurrence.logId || occurrence.id.includes('temp-')) && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        setActiveMenuId(null)
                        if (confirm("Are you sure you want to delete today's log?")) {
                          if (occurrence.logId) {
                            await deleteActivityLog(occurrence.logId)
                          }
                        }
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium transition-colors border-t border-[var(--color-border)]/50 mt-1 pt-1"
                    >
                      Delete Today&apos;s Log
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Reorder Grip Handle ── */}
          {!isGoogleCalendar && (
            <button
              type="button"
              onMouseEnter={() => setAllowDragIndex(index)}
              onMouseLeave={() => setAllowDragIndex(null)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 p-1 cursor-grab active:cursor-grabbing text-slate-300 dark:text-zinc-600 hover:text-slate-500 transition-colors ml-auto flex items-center"
              title="Drag to reorder"
            >
              <GripVertical size={14} />
            </button>
          )}
        </div>
        {isExpanded && occurrence.templateId && renderTaskHistory(occurrence.templateId)}
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

  const handleNavigateDate = (offset: number) => {
    const current = new Date(todayStr + 'T12:00:00Z')
    current.setUTCDate(current.getUTCDate() + offset)
    const nextDateStr = current.toISOString().split('T')[0]
    router.push(`/?date=${nextDateStr}`)
  }

  return (
    <div className="w-full">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNavigateDate(-1)}
              icon={<ChevronLeft className="w-4 h-4" />}
              title="Yesterday"
              className="p-1.5"
            />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">
              {todayStr === new Date().toISOString().split('T')[0] ? 'Today' : 'Timeline'}
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNavigateDate(1)}
              icon={<ChevronRight className="w-4 h-4" />}
              title="Tomorrow"
              className="p-1.5"
            />
            {todayStr !== new Date().toISOString().split('T')[0] && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/')}
                className="text-xs font-bold"
              >
                Today
              </Button>
            )}
          </div>
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
              <div className="p-2.5 bg-[var(--color-bg-subtle)]/60 border-t border-[var(--color-border)]/60 flex items-center gap-2 relative">
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
                
                {/* Color Picker popover */}
                <div className="relative shrink-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className={`w-5 h-5 rounded-full border border-slate-350 dark:border-zinc-700 transition-all hover:scale-110 cursor-pointer ${
                      quickTaskColor === 'red' ? 'bg-red-500' :
                      quickTaskColor === 'orange' ? 'bg-orange-500' :
                      quickTaskColor === 'amber' ? 'bg-amber-500' :
                      quickTaskColor === 'green' ? 'bg-green-500' :
                      quickTaskColor === 'blue' ? 'bg-blue-500' :
                      quickTaskColor === 'purple' ? 'bg-purple-500' :
                      quickTaskColor === 'pink' ? 'bg-pink-500' :
                      'bg-zinc-500'
                    }`}
                    title="Choose task color"
                  />
                  {showColorPicker && (
                    <div className="absolute bottom-8 right-0 bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-2 rounded-lg shadow-lg flex gap-1.5 z-50 animate-in fade-in duration-100">
                      {(['blue', 'green', 'amber', 'orange', 'red', 'purple', 'pink', 'zinc'] as const).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setQuickTaskColor(c)
                            setShowColorPicker(false)
                          }}
                          className={`w-4 h-4 rounded-full hover:scale-115 cursor-pointer ${
                            c === 'red' ? 'bg-red-500' :
                            c === 'orange' ? 'bg-orange-500' :
                            c === 'amber' ? 'bg-amber-500' :
                            c === 'green' ? 'bg-green-500' :
                            c === 'blue' ? 'bg-blue-500' :
                            c === 'purple' ? 'bg-purple-500' :
                            c === 'pink' ? 'bg-pink-500' :
                            'bg-zinc-500'
                          } ${quickTaskColor === c ? 'ring-2 ring-white border border-slate-900' : ''}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Templates Selector Dropdown */}
                <div className="relative shrink-0 flex items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowTemplatesDropdown(!showTemplatesDropdown)
                      setShowColorPicker(false)
                    }}
                    className="text-xs font-semibold shadow-xs"
                  >
                    Templates
                  </Button>
                  {showTemplatesDropdown && (
                    <div className="absolute bottom-10 right-0 bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-2 rounded-xl shadow-lg flex flex-col gap-1 z-50 w-64 max-h-60 overflow-y-auto animate-in slide-in-from-bottom-2 duration-150">
                      <div className="text-[9px] uppercase tracking-wider font-extrabold text-[var(--color-text-muted)] border-b border-[var(--color-border)]/50 pb-1.5 mb-1.5 px-1.5">
                        Select Activity Template
                      </div>
                      {analyzedTemplates.filter(at => at.template.recurrenceType !== 'one_time').length === 0 ? (
                        <div className="text-[10px] text-slate-400 italic py-3 text-center">No templates available</div>
                      ) : (
                        analyzedTemplates
                          .filter(at => at.template.recurrenceType !== 'one_time')
                          .map(at => {
                            const t = at.template
                            const colorClasses = getTemplateColorClasses(t.color)
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setShowTemplatesDropdown(false)
                                  const isWeightLogged = weightRecords.some(r => {
                                    const dStr = typeof r.date === 'string' ? r.date.split('T')[0] : r.date.toISOString().split('T')[0]
                                    return dStr === todayStr
                                  })
                                  const occ: TimelineItem = {
                                    id: `schedule_${t.id}_${todayStr}`,
                                    templateId: t.id,
                                    templateName: t.name,
                                    type: t.type,
                                    priority: t.priority,
                                    start: new Date(`${todayStr}T00:00:00Z`),
                                    end: new Date(`${todayStr}T23:59:59Z`),
                                    isAllDay: true,
                                    completed: false,
                                  }
                                  if (CompletionService.needsPrompting(t, isWeightLogged)) {
                                    setActiveCompletion({ template: t, occurrence: occ })
                                  } else {
                                    setCompletingHabitId(t.id)
                                    setTaskStatusAction(occ, todayStr, 'done')
                                      .finally(() => setCompletingHabitId(null))
                                  }
                                }}
                                className="flex items-center gap-2 p-1.5 hover:bg-[var(--color-accent)]/20 rounded-lg transition-all cursor-pointer text-left w-full hover:translate-x-0.5 group"
                              >
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center border text-[9px] group-hover:scale-105 transition-transform ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}>
                                  <Icon name={t.icon} size={10} />
                                </div>
                                <span className="text-[10px] font-bold text-[var(--color-text-main)] truncate flex-1">{t.name}</span>
                              </button>
                            )
                          })
                      )}
                    </div>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={handleCreateQuickTask}
                  isLoading={isCreatingQuickTask}
                  disabled={!quickTaskTitle.trim() || isCreatingQuickTask}
                  className="shrink-0 text-xs font-bold"
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
          {widgetsVisibility.workHours !== false && workTemplateId && (
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
                      className={`flex-1 py-1 text-[10px] font-bold rounded-md capitalize transition-all duration-150 cursor-pointer ${workStatus === status
                          ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                        }`}
                    >
                      {status === 'cleared' ? 'Clear' : status}
                    </button>
                  ))}
                </div>

                {/* Inputs based on workStatus and loggingMode */}
                {workStatus !== 'cleared' && (
                  <div className="space-y-3">
                    {/* Logging Mode Selector */}
                    <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[9px] border border-[var(--color-border)]">
                      {(['time', 'manual'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            if (mode === 'manual' && inTime && outTime) {
                              setManualHours(computeOfficeHours(inTime, outTime))
                            }
                            setLoggingMode(mode)
                          }}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-md capitalize transition-all duration-150 cursor-pointer ${
                            loggingMode === mode
                              ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                          }`}
                        >
                          {mode === 'time' ? 'Time-Based' : 'Manual'}
                        </button>
                      ))}
                    </div>

                    {/* Mode A: Time-Based Inputs */}
                    {loggingMode === 'time' && (
                      <div className="space-y-2 pt-1 animate-fade-in">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Start Time</label>
                            <input
                              type="time"
                              value={inTime}
                              onChange={(e) => setInTime(e.target.value)}
                              className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">End Time</label>
                            <input
                              type="time"
                              value={outTime}
                              onChange={(e) => setOutTime(e.target.value)}
                              className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                            />
                          </div>
                        </div>
                        <div className="text-[10px] text-right font-semibold text-[var(--color-text-muted)] pr-0.5 flex justify-between items-center">
                          <span>Status:</span>
                          {!outTime ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Session Active
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-main)] font-mono">
                              Calculated: {computeOfficeHours(inTime, outTime)}h
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Mode B: Manual Input */}
                    {loggingMode === 'manual' && (
                      <div className="space-y-1.5 pt-1 animate-fade-in">
                        <div className="flex justify-between items-center text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                          <span>Total Hours Worked</span>
                          <span className="text-xs font-mono text-[var(--color-text-main)] font-bold">{manualHours}h</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          value={manualHours}
                          onChange={(e) => setManualHours(parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </div>
                    )}
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
                      className={`h-full transition-all duration-500 rounded-full ${isGoalMet ? 'bg-emerald-500' : 'bg-blue-500'
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

          {widgetsVisibility.journal !== false && (
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
          )}

          {/* Time Off Status Card */}
          {widgetsVisibility.leaveBalance !== false && (
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
          )}

          {/* Weight Tracker Card */}
          {widgetsVisibility.weight !== false && (
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
          )}

          {/* Secure Vault Card */}
          {widgetsVisibility.recentDocuments !== false && (
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
          )}

        </div>
      </div>
      
      <CompletionDialog
        key={activeCompletion ? `${activeCompletion.occurrence.id}-${activeCompletion.occurrence.templateId}` : 'closed'}
        isOpen={!!activeCompletion}
        onClose={() => setActiveCompletion(null)}
        template={activeCompletion?.template || null}
        onSave={async (payload) => {
          if (!activeCompletion) return
          const { template, occurrence } = activeCompletion
          const config = CompletionService.getCompletionConfig(template)
          
          if (config.hook === 'weight' && typeof payload.value === 'number') {
            await logWeightAction(todayStr, payload.value)
          } else {
            await setTaskStatusAction(occurrence, todayStr, 'done', payload)
          }
          setActiveCompletion(null)
          router.refresh()
        }}
      />
    </div>
  )
}
