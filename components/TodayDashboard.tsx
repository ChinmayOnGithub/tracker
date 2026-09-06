"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store/store'
import { saveDashboardConfigAction } from '@/app/actions/settings'
import { useRouter } from 'next/navigation'
import { TodayHeader } from './today/TodayHeader'
import { TodayTasks } from './today/TodayTasks'
import {
  WorkHoursWidget,
  JournalWidget,
  RecentDocumentsWidget,
  LeaveWidget,
  WeightWidget,
  DailyCodingWidget,
  HourlyWeatherWidget,
} from './today/widgets'

import { CompletionDialog } from './CompletionDialog'
import { CompletionService } from '@/lib/services/CompletionService'
import { ActivityTemplate, ActivityLog, TimelineItem, AnalyzedTemplate } from '@/types'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { getWeekDates } from '@/lib/recurrence'

import { LeaveRecord, LeaveAllowance, WeightRecord, JournalEntry, CalendarData } from '@/lib/store/store'
import { Button } from '@/design-system'

import { TodayGrid } from './today/grid/TodayGrid'
import { EditDashboardModal } from './today/grid/EditDashboardModal'
import { DashboardConfig, LegacyDashboardConfig } from '@/lib/dashboard/types'
import {
  migrateAndNormalizeDashboardConfig,
  generateDefaultDashboardLayout,
  findNextAvailablePosition,
} from '@/lib/dashboard/layoutEngine'
import { getWidgetDefinition, GRID_COLUMNS } from '@/lib/dashboard/registry'

export interface TodayDashboardProps {
  analyzedTemplates: AnalyzedTemplate[]
  logs: ActivityLog[]
  todayStr: string
  calendarData: CalendarData
  onRefetchCalendar: (force?: boolean) => void
  onOpenCreateActivity: () => void
  journalEntries: JournalEntry[]
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  weightRecords: WeightRecord[]
  onTabChange: (tabId: string) => void
  initialDashboardConfig?: DashboardConfig | LegacyDashboardConfig | null
  isValidating?: boolean
}

export const TodayDashboard: React.FC<TodayDashboardProps> = ({
  analyzedTemplates,
  logs,
  todayStr,
  calendarData,
  onRefetchCalendar,
  onOpenCreateActivity,
  journalEntries,
  leaveRecords,
  leaveAllowances,
  weightRecords,
  onTabChange,
  initialDashboardConfig,
  isValidating = false,
}) => {
  const router = useRouter()
  const {
    cycleTaskStatusAction,
    setTaskStatusAction,
    deleteActivityLog,
    createActivityTemplateAction,
    updateActivityTemplateAction,
    reorderActivityTemplatesAction,
    logWorkPresenceAction,
    logWeightAction
  } = useStore()

  // Shim: the store's payload is typed `any`; narrow it to `unknown` for strict child props
  const typedSetTaskStatus = (
    occurrence: TimelineItem,
    date: string,
    status: 'cleared' | 'done' | 'skipped' | 'postponed',
    payload?: unknown
  ) => setTaskStatusAction(occurrence, date, status, payload)

  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [activeCompletion, setActiveCompletion] = useState<{
    template: ActivityTemplate
    occurrence: TimelineItem
  } | null>(null)

  // Keep time ticking
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const [prevInitial, setPrevInitial] = useState(initialDashboardConfig)
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig>(() =>
    migrateAndNormalizeDashboardConfig(initialDashboardConfig)
  )

  if (initialDashboardConfig !== prevInitial) {
    setPrevInitial(initialDashboardConfig)
    if (initialDashboardConfig) {
      setDashboardConfig(migrateAndNormalizeDashboardConfig(initialDashboardConfig))
    }
  }

  const [saveError, setSaveError] = useState(false)
  const [isEditingGrid, setIsEditingGrid] = useState(false)
  const [isCustomizing, setIsCustomizing] = useState(false)

  // Persist dashboardConfig when modified (debounced 500ms to avoid flooding server on rapid gestures)
  const isInitialMount = useRef(true)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await saveDashboardConfigAction(dashboardConfig)
        if (!res.success) {
          setSaveError(true)
        } else {
          setSaveError(false)
        }
      } catch (err) {
        console.error('[TodayDashboard] Exception saving dashboard config:', err)
        setSaveError(true)
      }
    }, 500)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [dashboardConfig])

  const handleToggleWidget = useCallback((widgetId: string) => {
    setDashboardConfig(prev => {
      const isHidden = prev.hidden.includes(widgetId)
      if (isHidden) {
        // Unhide widget: place it at next available position if not already placed
        const existing = prev.items.find(i => i.id === widgetId)
        const items = [...prev.items]
        if (!existing) {
          const def = getWidgetDefinition(widgetId)
          if (def) {
            const pos = findNextAvailablePosition(items, def.defaultW, def.defaultH, GRID_COLUMNS)
            items.push({
              id: def.id,
              x: pos.x,
              y: pos.y,
              w: def.defaultW,
              h: def.defaultH,
            })
          }
        }
        return {
          ...prev,
          items,
          hidden: prev.hidden.filter(id => id !== widgetId),
        }
      } else {
        // Hide widget
        return {
          ...prev,
          hidden: [...prev.hidden, widgetId],
        }
      }
    })
  }, [])

  const handleResetLayout = useCallback(() => {
    const defaults = generateDefaultDashboardLayout()
    setDashboardConfig(prev => ({
      ...defaults,
      hidden: prev.hidden, // Preserve user's visibility preferences!
    }))
  }, [])

  // Weekly goal — isomorphic hydration
  const [weeklyGoal, setWeeklyGoal] = useState(27)

  useEffect(() => {
    const val = localStorage.getItem('personal_weekly_goal')
    if (val) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWeeklyGoal(Number(val))
    }

    const handleSettingsChange = () => {
      const v = localStorage.getItem('personal_weekly_goal')
      if (v) {
        setWeeklyGoal(Number(v))
      }
    }
    window.addEventListener('personal_settings_changed', handleSettingsChange)
    return () => window.removeEventListener('personal_settings_changed', handleSettingsChange)
  }, [])




  const weekDates = getWeekDates(todayStr)
  const workTemplateObj = analyzedTemplates.find(t => t.template.name === 'Work Tracker')?.template
  const workTemplateId = workTemplateObj?.id
  const todayWorkLog = workTemplateId
    ? logs.find(l => l.activityId === workTemplateId && l.date === todayStr) || null
    : null

  const calendarEvents = useMemo(() => calendarData.agenda?.today || [], [calendarData.agenda?.today])

  // Debounced timeline generation
  const [debouncedTimeline, setDebouncedTimeline] = useState<TimelineItem[]>(() =>
    generateTimeline(analyzedTemplates, logs, todayStr, calendarEvents)
  )

  useEffect(() => {
    const t = setTimeout(() => {
      const freshTimeline = generateTimeline(analyzedTemplates, logs, todayStr, calendarEvents)
      setDebouncedTimeline(freshTimeline)
    }, 150)
    return () => clearTimeout(t)
  }, [analyzedTemplates, logs, todayStr, calendarEvents])

  // Unified derived timeline viewModel selector to minimize layouts and re-filters
  const _viewModel = useMemo(() => {
    const activeTimeline = debouncedTimeline.filter(o => !o.completed)
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

    const totalActivities = debouncedTimeline.length
    const completedCount = debouncedTimeline.filter(t => t.completed && t.status !== 'skipped').length
    const progressPct = totalActivities > 0 ? Math.round((completedCount / totalActivities) * 100) : 0

    // Compute contextual subtitle
    let contextSubtitle = 'Nothing scheduled for the next 2 hours'
    const activeContest = upcomingEvents.find(e =>
      e.templateName.toLowerCase().includes('codeforces') || e.templateName.toLowerCase().includes('leetcode')
    )
    if (activeContest) {
      const diffMins = Math.round((new Date(activeContest.start!).getTime() - currentTime.getTime()) / 60000)
      if (diffMins > 0 && diffMins <= 240) {
        contextSubtitle = `🔥 Next ${activeContest.templateName.split(' ')[0]} in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
      }
    } else if (activeOverdue.length > 0) {
      contextSubtitle = `${activeOverdue.length} overdue ${activeOverdue.length === 1 ? 'activity' : 'activities'} need attention`
    } else {
      const activeMeeting = activeEvents.find(e => e.type === 'MEETING')
      if (activeMeeting) {
        contextSubtitle = `Now: ${activeMeeting.templateName} is active`
      } else if (nextEvent) {
        const diffMins = Math.round((new Date(nextEvent.start!).getTime() - currentTime.getTime()) / 60000)
        if (diffMins > 0 && diffMins <= 120) {
          contextSubtitle = `Next: ${nextEvent.templateName} in ${diffMins} min`
        }
      }
    }

    return {
      activeTimeline,
      activeEvents,
      upcomingEvents,
      nextEvent,
      totalActivities,
      completedCount,
      progressPct,
      contextSubtitle,
    }
  }, [debouncedTimeline, analyzedTemplates, logs, todayStr, currentTime])

  // Parse Date Strings
  const todayDate = new Date(todayStr + 'T12:00:00Z')
  const dayName = todayDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const dayNum = todayDate.getUTCDate()
  const monthName = todayDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const todayLongDate = `${dayName} • ${dayNum} ${monthName}`

  const handleNavigateDate = (offset: number) => {
    const current = new Date(todayStr + 'T12:00:00Z')
    current.setUTCDate(current.getUTCDate() + offset)
    const nextDateStr = current.toISOString().split('T')[0]
    router.push(`/?date=${nextDateStr}`)
  }

  const todayJournal = journalEntries.find(e => {
    const entryDateStr = typeof e.journalDate === 'string'
      ? e.journalDate.split('T')[0]
      : new Date(e.journalDate).toISOString().split('T')[0]
    return entryDateStr === todayStr
  }) || null

  const cycleTaskStatus = async (occurrence: TimelineItem) => {
    const isWeightLogged = weightRecords.some(r => {
      const dStr = typeof r.date === 'string' ? r.date.split('T')[0] : r.date.toISOString().split('T')[0]
      return dStr === todayStr
    })
    const matched = analyzedTemplates.find(t => t.template.id === occurrence.templateId)
    const template = matched?.template || null

    if (template && CompletionService.needsPrompting(template, isWeightLogged)) {
      setActiveCompletion({ template, occurrence })
    } else {
      if (occurrence.templateId) {
        setCompletingHabitId(occurrence.templateId)
      }
      try {
        await cycleTaskStatusAction(occurrence, todayStr)
      } finally {
        setCompletingHabitId(null)
      }
    }
  }

  // Widget hydration is handled locally per widget to prevent slow API components blocking primary UI.
  // Instead of a single coarse indicator, today tasks are rendered as soon as local store is hydrated.
  const isTasksHydrated = true

  return (
    <div className="w-full">
      {/* Compose TodayHeader with Edit controls */}
      <TodayHeader
        todayStr={todayStr}
        todayLongDate={todayLongDate}
        calendarConnected={calendarData.connected}
        calendarLoading={calendarData.loading}
        onRefetchCalendar={onRefetchCalendar}
        onOpenCreateActivity={onOpenCreateActivity}
        onNavigateDate={handleNavigateDate}
        onGoToToday={() => router.push('/')}
        isEditing={isEditingGrid}
        onToggleEdit={() => setIsEditingGrid(prev => !prev)}
        onOpenCustomize={() => setIsCustomizing(true)}
        isValidating={isValidating}
      />

      {saveError && (
        <div className="mb-4 p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>⚠️ Failed to sync dashboard preferences to your account. Offline or server unavailable.</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
            onClick={async () => {
              try {
                const res = await saveDashboardConfigAction(dashboardConfig)
                if (res.success) setSaveError(false)
              } catch (_) {}
            }}
          >
            Retry Sync
          </Button>
        </div>
      )}

      {/* 20-Column Desktop Grid with Mobile Responsive Stack */}
      <TodayGrid
        config={dashboardConfig}
        isEditing={isEditingGrid}
        onChangeConfig={setDashboardConfig}
        onHideWidget={handleToggleWidget}
        renderWidget={(widgetId, w, h) => {
          switch (widgetId) {
            case 'tasks':
              return (
                <TodayTasks
                  timeline={debouncedTimeline}
                  analyzedTemplates={analyzedTemplates}
                  logs={logs}
                  todayStr={todayStr}
                  isTodayHydrated={isTasksHydrated}
                  completingHabitId={completingHabitId}
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  cycleTaskStatus={cycleTaskStatus}
                  setTaskStatusAction={typedSetTaskStatus}
                  deleteActivityLog={deleteActivityLog}
                  createActivityTemplateAction={createActivityTemplateAction}
                  updateActivityTemplateAction={updateActivityTemplateAction}
                  reorderActivityTemplatesAction={reorderActivityTemplatesAction}
                  onOpenCreateActivity={onOpenCreateActivity}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'journal':
              return (
                <JournalWidget
                  key="journal"
                  todayJournal={todayJournal}
                  onOpenJournal={() => onTabChange('journal')}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'workHours':
              return workTemplateId ? (
                <WorkHoursWidget
                  key={workTemplateId}
                  todayWorkLog={todayWorkLog}
                  workTemplateId={workTemplateId}
                  todayStr={todayStr}
                  weekDates={weekDates}
                  logs={logs}
                  weeklyGoal={weeklyGoal}
                  logWorkPresenceAction={logWorkPresenceAction}
                  gridW={w}
                  gridH={h}
                />
              ) : null
            case 'leaveBalance':
              return (
                <LeaveWidget
                  key="leave"
                  isVisible={true}
                  leaveRecords={leaveRecords}
                  leaveAllowances={leaveAllowances}
                  onTabChange={onTabChange}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'weight':
              return (
                <WeightWidget
                  key="weight"
                  isVisible={true}
                  weightRecords={weightRecords}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'recentDocuments':
              return (
                <RecentDocumentsWidget
                  key="recentDocs"
                  isVisible={true}
                  onTabChange={onTabChange}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'leetcodePOTD':
              return (
                <DailyCodingWidget
                  key="leetcodePOTD"
                  platform="leetcode"
                  todayStr={todayStr}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'gfgPOTD':
              return (
                <DailyCodingWidget
                  key="gfgPOTD"
                  platform="gfg"
                  todayStr={todayStr}
                  gridW={w}
                  gridH={h}
                />
              )
            case 'weather':
              return (
                <HourlyWeatherWidget
                  key="weather"
                  displayedDate={todayStr}
                  gridW={w}
                  gridH={h}
                />
              )

            default:
              return null

          }
        }}
      />

      {/* Edit Dashboard Widgets Modal */}
      <EditDashboardModal
        isOpen={isCustomizing}
        onClose={() => setIsCustomizing(false)}
        hiddenWidgets={dashboardConfig.hidden}
        onToggleWidget={handleToggleWidget}
        onResetLayout={handleResetLayout}
      />

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
        }}
      />
    </div>
  )
}
