"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { Skeleton, EmptyState, Button, Card } from '@/design-system'
import {
  Calendar, Clock, MapPin, ExternalLink, Link as LinkIcon,
  Check, Plus, ChevronDown, ChevronRight, Edit2, XCircle, ArrowRightCircle, RefreshCw, Sparkles
} from 'lucide-react'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis, TimelineItem } from '@/types'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { upsertNote } from '@/app/actions/note'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { Icon } from './Icon'
import { useRouter } from 'next/navigation'
import { deleteLog, markComplete } from '@/app/actions/log'
import { updateActivityTemplate } from '@/app/actions/template'
import { ContestsWidget } from './ContestsWidget'
import { useActivityNotifications } from '@/lib/hooks/useActivityNotifications'

interface TestAnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface TodayDashboardProps {
  analyzedTemplates: TestAnalyzedTemplate[]
  logs: ActivityLog[]
  notes: Note[]
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
  onMarkHabitComplete: (template: ActivityTemplate) => Promise<void>
  onEditTemplate: (template: ActivityTemplate) => void
}

type SectionKey = 'overdue' | 'now' | 'next' | 'later' | 'anytime' | 'completed'

export const TodayDashboard: React.FC<TodayDashboardProps> = ({
  analyzedTemplates,
  logs,
  notes,
  todayStr,
  calendarData,
  onOpenCreateActivity,
  onMarkHabitComplete,
  onEditTemplate
}) => {
  const router = useRouter()
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null)

  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    overdue: false, now: false, next: false,
    later: false, anytime: false, completed: false // Don't collapse completed section by default
  })

  const todayNote = notes.find(n => n.date.split('T')[0] === todayStr)
  const [reflection, setReflection] = useState(todayNote?.content || '')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [isReflectionExpanded, setIsReflectionExpanded] = useState(!!todayNote?.content)

  const isSavingRef = React.useRef(false)
  const pendingSaveRef = React.useRef<string | null>(null)

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const saveReflection = useCallback(async (contentToSave: string = reflection) => {
    if (contentToSave.trim() === '') return
    if (isSavingRef.current) { pendingSaveRef.current = contentToSave; return }
    isSavingRef.current = true
    setSaveStatus('saving')
    try {
      const res = await upsertNote(todayStr, contentToSave, 'Daily Reflection')
      setSaveStatus(res.success ? 'saved' : 'error')
    } catch { setSaveStatus('error') }
    finally {
      isSavingRef.current = false
      if (pendingSaveRef.current !== null) {
        const next = pendingSaveRef.current; pendingSaveRef.current = null; saveReflection(next)
      }
    }
  }, [todayStr, reflection])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const [prevTodayStr, setPrevTodayStr] = useState(todayStr)
  const [prevTodayNoteContent, setPrevTodayNoteContent] = useState(todayNote?.content)
  if (todayStr !== prevTodayStr || todayNote?.content !== prevTodayNoteContent) {
    setReflection(todayNote?.content || '')
    setPrevTodayStr(todayStr)
    setPrevTodayNoteContent(todayNote?.content)
  }

  useEffect(() => {
    const dbValue = todayNote?.content || ''
    if (reflection === dbValue) return
    const timer = setTimeout(() => saveReflection(reflection), 2500)
    return () => clearTimeout(timer)
  }, [reflection, todayNote?.content, saveReflection])

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
  const completedTimeline = timeline.filter(o => o.completed)
  const activeOverdue = overdueOccurrences.filter(o => !o.completed)

  const timed = activeTimeline.filter(o => !o.isAllDay)
  const anytime = activeTimeline.filter(o => o.isAllDay)

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
  const laterEvents = upcomingEvents.slice(1)

  const getPriorityWeight = (p?: string) =>
    p === 'CRITICAL' ? 4 : p === 'HIGH' ? 3 : p === 'NORMAL' || p === 'MEDIUM' ? 2 : 1

  const groupedTimeline = {
    overdue: activeOverdue,
    now: activeEvents,
    next: nextEvent ? [nextEvent] : [],
    later: laterEvents,
    anytime: anytime.sort((a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority)),
    completed: completedTimeline
  }

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
  const handleHabitToggle = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return
    const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
    if (!matched) return
    setCompletingHabitId(occurrence.templateId)
    try {
      if (occurrence.completed) {
        if (occurrence.logId) await deleteLog(occurrence.logId)
      } else {
        await onMarkHabitComplete(matched.template)
      }
      router.refresh()
    } catch (err) { console.error(err) }
    finally { setCompletingHabitId(null) }
  }

  const handleHabitSkip = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return
    setCompletingHabitId(occurrence.templateId)
    try { await markComplete(occurrence.templateId, todayStr, 'skipped'); router.refresh() }
    catch (err) { console.error(err) }
    finally { setCompletingHabitId(null) }
  }

  const handleHabitSnooze = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return
    const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
    if (!matched) return
    const meta = (matched.template.metadata || {}) as Record<string, string>
    const [h, m] = (meta.startTime || '09:00').split(':').map(Number)
    let newM = m + 15, newH = h
    if (newM >= 60) { newM -= 60; newH = (newH + 1) % 24 }
    const newTimeStr = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
    setCompletingHabitId(occurrence.templateId)
    try { await updateActivityTemplate(occurrence.templateId, { metadata: { ...meta, startTime: newTimeStr } }); router.refresh() }
    catch (err) { console.error(err) }
    finally { setCompletingHabitId(null) }
  }

  const handleHabitRescheduleTomorrow = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return
    const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
    if (!matched) return
    setCompletingHabitId(occurrence.templateId)
    try {
      if (matched.template.recurrenceType === 'one_time') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        await updateActivityTemplate(occurrence.templateId, { targetDate: tomorrow.toISOString().split('T')[0] })
      } else {
        await markComplete(occurrence.templateId, todayStr, 'skipped')
      }
      router.refresh()
    } catch (err) { console.error(err) }
    finally { setCompletingHabitId(null) }
  }

  // Semantic color mapping - color by meaning, not category
  const getSemanticColor = (occurrence: TimelineItem): {
    iconBg: string
    textColor: string
    semanticType: 'external' | 'completed' | 'warning' | 'overdue' | 'personal' | 'neutral'
  } => {
    // Determine semantic meaning
    if (occurrence.completed && occurrence.status !== 'skipped') {
      return {
        iconBg: 'bg-[var(--color-completed)]/10 border-[var(--color-completed)]/20 text-[var(--color-completed)]',
        textColor: 'text-[var(--color-completed)]',
        semanticType: 'completed'
      }
    }
    
    if (occurrence.type === 'MEETING' || occurrence.type === 'EVENT') {
      return {
        iconBg: 'bg-[var(--color-external)]/10 border-[var(--color-external)]/20 text-[var(--color-external)]',
        textColor: 'text-[var(--color-external)]',
        semanticType: 'external'
      }
    }

    const matchedTemplate = occurrence.templateId
      ? analyzedTemplates.find(t => t.template.id === occurrence.templateId)
      : null
    const template = matchedTemplate?.template
    const analysis = matchedTemplate?.analysis
    
    if (analysis?.overdue) {
      return {
        iconBg: 'bg-[var(--color-overdue)]/10 border-[var(--color-overdue)]/20 text-[var(--color-overdue)]',
        textColor: 'text-[var(--color-overdue)]',
        semanticType: 'overdue'
      }
    }
    
    if (occurrence.priority === 'HIGH' || occurrence.priority === 'CRITICAL') {
      return {
        iconBg: 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20 text-[var(--color-warning)]',
        textColor: 'text-[var(--color-warning)]',
        semanticType: 'warning'
      }
    }
    
    if (template?.category === 'PERSONAL' || occurrence.templateId?.includes('personal')) {
      return {
        iconBg: 'bg-[var(--color-personal)]/10 border-[var(--color-personal)]/20 text-[var(--color-personal)]',
        textColor: 'text-[var(--color-personal)]',
        semanticType: 'personal'
      }
    }
    
    // Default neutral
    return {
      iconBg: 'bg-[var(--color-accent)] border-[var(--color-border)] text-[var(--color-text-muted)]',
      textColor: 'text-[var(--color-text-muted)]',
      semanticType: 'neutral'
    }
  }

  const getCardBgClass = (occurrence: TimelineItem): string => {
    const semantic = getSemanticColor(occurrence)
    let bg = 'bg-[var(--color-bg-surface)]'
    
    // Apply very subtle background tints to give depth and separation
    if (semantic.semanticType === 'completed') bg = 'bg-[var(--color-completed)]/5 dark:bg-[var(--color-completed)]/10'
    else if (semantic.semanticType === 'warning') bg = 'bg-[var(--color-warning)]/5 dark:bg-[var(--color-warning)]/10'
    else if (semantic.semanticType === 'overdue') bg = 'bg-[var(--color-overdue)]/5 dark:bg-[var(--color-overdue)]/10'
    else if (semantic.semanticType === 'personal') bg = 'bg-[var(--color-personal)]/5 dark:bg-[var(--color-personal)]/10'
    else if (semantic.semanticType === 'external') bg = 'bg-[var(--color-external)]/5 dark:bg-[var(--color-external)]/10'

    const baseClass = [
      bg,
      'border-[var(--color-border)]',
      'hover:border-[var(--color-primary)]/30',
      'hover:shadow-[var(--card-hover-shadow)]',
    ].join(' ')
    
    if (occurrence.completed && occurrence.status !== 'skipped')
      return `${baseClass} opacity-70`
    if (occurrence.status === 'skipped')
      return `${baseClass} opacity-50`
    
    return baseClass
  }

  const toggleCollapse = (section: SectionKey) =>
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))

  // Parse date from todayStr to avoid SSR hydration mismatch
  const todayDate = new Date(todayStr + 'T12:00:00Z')
  const dayName = todayDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const dayNum = todayDate.getUTCDate()
  const monthName = todayDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const todayLongDate = `${dayName} • ${dayNum} ${monthName}`

  // ── Section header ────────────────────────────────────────────────────────
  const renderSectionHeader = (key: SectionKey, title: string, count: number) => {
    const isExpanded = !collapsed[key]
    return (
      <button
        onClick={() => toggleCollapse(key)}
        className="w-full flex items-center gap-2 py-2 px-2 hover:bg-[var(--color-accent)]/50 rounded-lg text-left select-none transition-colors"
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
        }
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex-1">
          {title}
        </span>
        <span className="text-[9px] font-bold text-[var(--color-text-muted)] px-1.5 py-0.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md tabular-nums">
          {count}
        </span>
      </button>
    )
  }

  // ── Timeline item card ────────────────────────────────────────────────────
  const renderTimelineItemCard = (occurrence: TimelineItem) => {
    const isCompleting = completingHabitId === occurrence.templateId
    const isTimed = !occurrence.isAllDay
    const startTimeLabel = isTimed && occurrence.start
      ? new Date(occurrence.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : ''

    const matchedTemplate = occurrence.templateId
      ? analyzedTemplates.find(t => t.template.id === occurrence.templateId)
      : null
    const template = matchedTemplate?.template
    const analysis = matchedTemplate?.analysis
    const templateTags = template?.tags ?? []
    const estimatedDuration = template?.estimatedDuration
    const templateNotes = occurrence.notes ?? template?.notes
    const streak = analysis?.streak ?? 0

    // Get semantic colors
    const semantic = getSemanticColor(occurrence)

    return (
      <div
        key={occurrence.id}
        className={`flex items-center gap-3 px-3 py-3 border rounded-[var(--card-radius)] transition-all duration-200 ease-in-out hover:translate-x-1 hover:shadow-sm group ${getCardBgClass(occurrence)}`}
      >
        {/* ── Checkbox / complete button (minimum 44px) ── */}
        <div className="shrink-0 w-11 h-11 flex items-center justify-center">
          {occurrence.completed && occurrence.status !== 'skipped' ? (
            <button
              onClick={() => handleHabitToggle(occurrence)}
              title="Undo completion"
              className="w-11 h-11 rounded-lg bg-[var(--color-completed)] border border-[var(--color-completed)] text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer hover:bg-[var(--color-completed)]/90"
            >
              <Check className="w-4 h-4 animate-check-pop" />
            </button>
          ) : occurrence.templateId ? (
            <button
              disabled={isCompleting}
              onClick={() => handleHabitToggle(occurrence)}
              title="Mark complete"
              className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40 ${
                isCompleting
                  ? 'border-[var(--color-completed)]/40 bg-[var(--color-completed)]/10 animate-pulse'
                  : occurrence.status === 'skipped'
                    ? 'border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-bg-base)]'
                    : `border-slate-300 dark:border-zinc-700 text-transparent hover:border-current hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10`
              }`}
            >
              {isCompleting
                ? <span className="w-3 h-3 bg-[var(--color-completed)] rounded-full" />
                : <Check className="w-4 h-4" />
              }
            </button>
          ) : (
            <div className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center border-current/30 ${semantic.textColor}`}>
              <Calendar className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* ── Semantic icon badge (rounded square) ── */}
        <div className={`w-9 h-9 rounded-[var(--radius-md)] border flex items-center justify-center shrink-0 ${semantic.iconBg}`}>
          {occurrence.icon
            ? <Icon name={occurrence.icon} size={16} />
            : <Icon name={template?.icon || 'CheckSquare'} size={16} />
          }
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold leading-tight truncate ${
              occurrence.completed
                ? 'line-through text-[var(--color-text-muted)]'
                : 'text-[var(--color-text-main)]'
            }`}>
              {occurrence.htmlLink ? (
                <a href={occurrence.htmlLink} target="_blank" rel="noopener noreferrer"
                  className="hover:underline inline-flex items-center gap-1">
                  <span className="truncate">{occurrence.templateName}</span>
                  <ExternalLink className="w-3 h-3 opacity-40 shrink-0" />
                </a>
              ) : occurrence.templateName}
            </span>
            {/* Time badge */}
            {isTimed && startTimeLabel && (
              <span className={`shrink-0 text-[11px] font-mono font-bold px-2 py-1 rounded-[var(--radius-sm)] border ${semantic.textColor} bg-current/5 border-current/20`}>
                {startTimeLabel}
                {estimatedDuration ? ` (${estimatedDuration}m)` : (occurrence.end && occurrence.start ? ` (${Math.round((new Date(occurrence.end).getTime() - new Date(occurrence.start).getTime()) / 60000)}m)` : '')}
              </span>
            )}
            {/* Streak indicator */}
            {streak > 1 && !occurrence.completed && occurrence.status !== 'skipped' && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-extrabold text-orange-500 bg-orange-500/10 px-2 py-1 rounded-[var(--radius-sm)] border border-orange-500/20" title={`${streak} day streak!`}>
                🔥 {streak}
              </span>
            )}
            {/* Priority badge with semantic colors */}
            {(occurrence.priority === 'HIGH' || occurrence.priority === 'CRITICAL') && (
              <span className="shrink-0 text-[10px] font-extrabold text-[var(--color-warning)] border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/8 px-2 py-1 rounded-[var(--radius-sm)]">
                {occurrence.priority === 'CRITICAL' ? '🔴 Critical' : '⚡ High'}
              </span>
            )}
          </div>

          {/* Meta row - only essential information */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Remove category badge - it's duplicate information */}
            {streak > 1 && (
              <span className="text-[11px] font-black text-[var(--color-warning)]">🔥 {streak}</span>
            )}
            {occurrence.location && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] truncate max-w-[100px]">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{occurrence.location}</span>
              </span>
            )}
            {/* Show only most relevant tag */}
            {templateTags.length > 0 && (
              <span key={templateTags[0].id}
                className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border"
                style={{
                  color: templateTags[0].color ?? undefined,
                  borderColor: templateTags[0].color ? `${templateTags[0].color}40` : undefined,
                  backgroundColor: templateTags[0].color ? `${templateTags[0].color}15` : undefined,
                }}
              >{templateTags[0].name}</span>
            )}
            {/* Show template notes only if short and meaningful */}
            {templateNotes && !occurrence.completed && templateNotes.length < 50 && (
              <span className="text-[11px] text-[var(--color-text-muted)] italic truncate max-w-[160px]">{templateNotes}</span>
            )}
          </div>
        </div>

        {/* ── Hover action buttons — larger hit targets (minimum 44px) ── */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {occurrence.templateId && (
            <div className="flex items-center gap-0.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-1">
              {occurrence.completed ? (
                <button onClick={() => handleHabitToggle(occurrence)} title="Undo"
                  className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-md hover:bg-[var(--color-accent)] transition-colors cursor-pointer min-w-10 min-h-10 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </button>
              ) : (
                <>
                  {isTimed && (
                    <button onClick={() => handleHabitSnooze(occurrence)} title="Snooze 15m"
                      className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-md hover:bg-[var(--color-accent)] transition-colors cursor-pointer min-w-10 min-h-10 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleHabitSkip(occurrence)} title="Skip"
                    className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-overdue)] rounded-md hover:bg-[var(--color-overdue)]/10 transition-colors cursor-pointer min-w-10 min-h-10 flex items-center justify-center">
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleHabitRescheduleTomorrow(occurrence)} title="Move to tomorrow"
                    className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-md hover:bg-[var(--color-accent)] transition-colors cursor-pointer min-w-10 min-h-10 flex items-center justify-center">
                    <ArrowRightCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => { const m = analyzedTemplates.find(t => t.template.id === occurrence.templateId); if (m) onEditTemplate(m.template) }}
                    title="Edit"
                    className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-md hover:bg-[var(--color-accent)] transition-colors cursor-pointer min-w-10 min-h-10 flex items-center justify-center">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}
          {occurrence.type === 'MEETING' && occurrence.location?.startsWith('http') && (
            <a href={occurrence.location} target="_blank" rel="noopener noreferrer"
              title="Join meeting"
              className="ml-0.5 p-2 rounded-lg bg-[var(--color-external)]/10 border border-[var(--color-external)]/20 text-[var(--color-external)] hover:bg-[var(--color-external)]/20 transition-colors cursor-pointer min-w-10 min-h-10 flex items-center justify-center">
              <LinkIcon className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    )
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalActivities = timeline.length
  const completedCount = timeline.filter(t => t.completed && t.status !== 'skipped').length
  const skippedCount = timeline.filter(t => t.status === 'skipped').length
  const pendingCount = totalActivities - completedCount - skippedCount
  const progressPct = totalActivities > 0 ? Math.round((completedCount / totalActivities) * 100) : 0

  const topStreaks = analyzedTemplates
    .filter(t => t.analysis.streak > 1 && t.template.isActive)
    .sort((a, b) => b.analysis.streak - a.analysis.streak)
    .slice(0, 5)

  const tomorrowEvents = calendarData.agenda?.tomorrow ?? []

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3 mb-4">
        <div>
          <h1 className="text-xl font-black text-[var(--color-text-main)] tracking-tight">Today</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <p className="text-sm text-[var(--color-text-muted)] font-medium">
              {todayLongDate}
            </p>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 text-[11px] font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <Sparkles className="w-3.5 h-3.5" />
              {getContextSubtitle()}
            </div>
          </div>
        </div>
        <Button onClick={onOpenCreateActivity} size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
          New Activity
        </Button>
      </div>

      {/* Two-column grid with 75%/25% ratio */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-8 items-start">

        {/* ── Left: Primary Timeline (75%) ── */}
        <div className="space-y-6 min-w-0">

          {/* Progress bar redesign */}
          {totalActivities > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--color-text-main)]">
                  Today&apos;s Progress
                </span>
                <span className="text-sm font-mono font-bold text-[var(--color-text-main)] tabular-nums">
                  {completedCount}/{totalActivities}
                </span>
              </div>
              <div className="relative">
                <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-completed)] rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {/* Progress bar segments */}
                <div className="absolute inset-0 flex justify-between pointer-events-none">
                  {Array.from({ length: totalActivities }).map((_, i) => (
                    <div 
                      key={i}
                      className={`w-0.5 h-2 ${i < completedCount ? 'bg-[var(--color-completed)]' : 'bg-[var(--color-border)]'}`}
                      style={{ marginLeft: i === 0 ? '1px' : '0', marginRight: i === totalActivities - 1 ? '1px' : '0' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Feed */}
          {calendarData.loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : timeline.length === 0 && overdueTemplates.length === 0 ? (
            <EmptyState title="Your Day is Clear! 🎉" description="No activities or habits scheduled for today." />
          ) : (
            <div className="space-y-4">

              {(['overdue', 'now', 'next', 'later', 'anytime', 'completed'] as SectionKey[]).map(key => {
                const items = groupedTimeline[key]
                if (items.length === 0) return null
                const labels: Record<SectionKey, string> = {
                  overdue: '🔴 Overdue', now: '⚡ Now', next: '→ Next',
                  later: 'Later Today', anytime: 'Anytime', completed: '✓ Completed'
                }
                return (
                  <div key={key} className="space-y-1.5">
                    {renderSectionHeader(key, labels[key], items.length)}
                    {!collapsed[key] && (
                      <div className={`${
                        (key === 'anytime' || key === 'completed') && items.length > 2
                          ? 'grid grid-cols-1 lg:grid-cols-2 gap-1.5'
                          : 'space-y-1.5'
                      }`}>
                        {items.map(o => renderTimelineItemCard(o))}
                      </div>
                    )}
                  </div>
                )
              })}

            </div>
          )}
        </div>

        {/* ── Right: Sticky sidebar ── */}
        <div className="space-y-4 xl:sticky xl:top-4">

          {/* Day at a Glance - Reduced visual weight */}
          <Card className="opacity-90">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
              Day at a Glance
            </p>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0 w-14 h-14">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.915" fill="none"
                    className="stroke-[var(--color-border)]/60" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="15.915" fill="none"
                    stroke="var(--color-completed)" strokeWidth="2.5"
                    strokeDasharray={`${progressPct} ${100 - progressPct}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.7s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-semibold text-[var(--color-text-main)]">{progressPct}%</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-3">
                {[
                  { val: completedCount, label: 'Done', color: 'text-[var(--color-completed)]' },
                  { val: pendingCount,   label: 'Left', color: 'text-[var(--color-warning)]' },
                  { val: skippedCount,   label: 'Skip', color: 'text-[var(--color-text-muted)]' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className={`text-base font-semibold leading-tight ${s.color}`}>{s.val}</div>
                    <div className="text-[9px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Contests */}
          <ContestsWidget />

          {/* Streaks - Reduced visual weight */}
          {topStreaks.length > 0 && (
            <Card className="overflow-hidden opacity-90 p-0">
              <div className="px-3 py-2 border-b border-[var(--color-border)]/40 flex items-center gap-2">
                <span className="text-sm opacity-75">🔥</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Active Streaks</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]/40">
                {topStreaks.map(({ template, analysis }) => {
                  return (
                    <div key={template.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--color-accent)]/30 transition-colors">
                      <div className={`w-7 h-7 rounded-[var(--radius-md)] border flex items-center justify-center shrink-0 bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20 text-[var(--color-warning)]`}>
                        <Icon name={template.icon} size={13} />
                      </div>
                      <span className="flex-1 text-xs font-medium text-[var(--color-text-main)] truncate">{template.name}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--color-warning)] tabular-nums">{analysis.streak}d</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Tomorrow preview - Better hierarchy */}
          {tomorrowEvents.length > 0 && (
            <Card className="overflow-hidden opacity-90 p-0">
              <div className="px-3 py-2 border-b border-[var(--color-border)]/40 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-[var(--color-external)]" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Tomorrow</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]/40">
                {tomorrowEvents.slice(0, 4).map(evt => (
                  <div key={evt.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-mono font-semibold text-[var(--color-text-main)]">
                        {!evt.isAllDay && evt.start
                          ? new Date(evt.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                          : 'All day'
                        }
                      </span>
                    </div>
                    <span className="flex-1 text-xs font-medium text-[var(--color-text-main)] truncate leading-tight">{evt.summary}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Daily Reflection - Apple Notes style */}
          <Card className="overflow-hidden opacity-90 p-0">
            <div className="px-3 py-2 border-b border-[var(--color-border)]/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-3.5 h-3.5 text-[var(--color-personal)]" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Reflection</span>
              </div>
              <div className="flex items-center gap-2">
                {isReflectionExpanded && (
                  <span className={`text-[9px] font-medium ${
                    saveStatus === 'saving' ? 'text-[var(--color-external)] animate-pulse'
                    : saveStatus === 'error' ? 'text-[var(--color-overdue)]'
                    : 'text-[var(--color-completed)]'
                  }`}>
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Error' : 'Saved'}
                  </span>
                )}
                <button
                  onClick={() => setIsReflectionExpanded(v => !v)}
                  className="text-[10px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] cursor-pointer transition-colors px-2 py-1 rounded hover:bg-[var(--color-accent)]/50"
                >
                  {isReflectionExpanded ? 'Collapse' : 'Write'}
                </button>
              </div>
            </div>
            {!isReflectionExpanded ? (
              <div onClick={() => setIsReflectionExpanded(true)}
                className="px-3 py-4 cursor-text hover:bg-[var(--color-accent)]/30 transition-colors">
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {todayNote?.content
                    ? todayNote.content.slice(0, 100) + (todayNote.content.length > 100 ? '…' : '')
                    : 'Click to write your daily reflection…'
                  }
                </p>
              </div>
            ) : (
              <div className="p-3">
                <textarea
                  value={reflection}
                  onChange={e => setReflection(e.target.value)}
                  placeholder="How was today? What did you achieve?"
                  className="w-full h-32 text-sm bg-transparent text-[var(--color-text-main)] focus:outline-none font-normal resize-none p-0 placeholder:text-[var(--color-text-muted)]/50"
                  style={{ minHeight: '120px' }}
                />
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  )
}
