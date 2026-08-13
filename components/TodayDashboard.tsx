"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store/store'
import { useRouter } from 'next/navigation'
import { TodayHeader } from './today/TodayHeader'
import { TodayContext } from './today/TodayContext'
import { TodayTasks } from './today/TodayTasks'
import { WorkHoursWidget } from './today/WorkHoursWidget'
import { JournalWidget } from './today/JournalWidget'
import { RecentDocumentsWidget } from './today/RecentDocumentsWidget'
import { LeaveWidget } from './today/LeaveWidget'
import { WeightWidget } from './today/WeightWidget'
import { CompletionDialog } from './CompletionDialog'
import { CompletionService } from '@/lib/services/CompletionService'
import { ActivityTemplate, ActivityLog, Note, TimelineItem, AnalyzedTemplate } from '@/types'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { getWeekDates } from '@/lib/recurrence'

import { LeaveRecord, LeaveAllowance, WeightRecord, JournalEntry, CalendarData } from '@/lib/store/store'

export interface TodayDashboardProps {
  analyzedTemplates: AnalyzedTemplate[]
  logs: ActivityLog[]
  _notes: Note[]
  todayStr: string
  calendarData: CalendarData
  onRefetchCalendar: (force?: boolean) => void
  onOpenCreateActivity: () => void
  journalEntries: JournalEntry[]
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  weightRecords: WeightRecord[]
  onTabChange: (tabId: string) => void
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
}) => {
  const router = useRouter()
  const {
    cycleTaskStatusAction,
    setTaskStatusAction,
    deleteActivityLog,
    createActivityTemplateAction,
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

  // Widget visibility configurations
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
  const viewModel = useMemo(() => {
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
      {/* Compose TodayHeader */}
      <TodayHeader
        todayStr={todayStr}
        todayLongDate={todayLongDate}
        contextSubtitle={viewModel.contextSubtitle}
        calendarConnected={calendarData.connected}
        calendarLoading={calendarData.loading}
        onRefetchCalendar={onRefetchCalendar}
        onOpenCreateActivity={onOpenCreateActivity}
        onNavigateDate={handleNavigateDate}
        onGoToToday={() => router.push('/')}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3.25fr)_minmax(0,1.25fr)] gap-8 items-start">
        {/* Left Column: Timeline feed & Progress */}
        <div className="space-y-6 min-w-0">
          <TodayContext
            totalActivities={viewModel.totalActivities}
            completedCount={viewModel.completedCount}
            progressPct={viewModel.progressPct}
          />

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
            reorderActivityTemplatesAction={reorderActivityTemplatesAction}
            onOpenCreateActivity={onOpenCreateActivity}
          />
        </div>

        {/* Right Column: Widgets */}
        <div className="space-y-6 xl:sticky xl:top-6">
          {widgetsVisibility.journal !== false && (
            <JournalWidget
              todayJournal={todayJournal}
              onOpenJournal={() => onTabChange('journal')}
            />
          )}

          {widgetsVisibility.workHours !== false && workTemplateId && (
            <WorkHoursWidget
              key={todayWorkLog?.id || todayStr}
              todayWorkLog={todayWorkLog}
              workTemplateId={workTemplateId}
              todayStr={todayStr}
              weekDates={weekDates}
              logs={logs}
              weeklyGoal={weeklyGoal}
              logWorkPresenceAction={logWorkPresenceAction}
            />
          )}

          <LeaveWidget
            isVisible={widgetsVisibility.leaveBalance !== false}
            leaveRecords={leaveRecords}
            leaveAllowances={leaveAllowances}
            onTabChange={onTabChange}
          />

          <WeightWidget
            isVisible={widgetsVisibility.weight !== false}
            weightRecords={weightRecords}
          />

          <RecentDocumentsWidget
            isVisible={widgetsVisibility.recentDocuments !== false}
            onTabChange={onTabChange}
          />
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
        }}
      />
    </div>
  )
}
