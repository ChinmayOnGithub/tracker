"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store/store'
import { saveDashboardConfigAction } from '@/app/actions/settings'
import { useRouter } from 'next/navigation'
import { TodayHeader } from './today/TodayHeader'
import { TodayTasks } from './today/TodayTasks'
import { WorkHoursWidget } from './today/WorkHoursWidget'
import { JournalWidget } from './today/JournalWidget'
import { RecentDocumentsWidget } from './today/RecentDocumentsWidget'
import { LeaveWidget } from './today/LeaveWidget'
import { WeightWidget } from './today/WeightWidget'
import { CompletionDialog } from './CompletionDialog'
import { CompletionService } from '@/lib/services/CompletionService'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { ActivityTemplate, ActivityLog, TimelineItem, AnalyzedTemplate } from '@/types'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { getWeekDates } from '@/lib/recurrence'

import { LeaveRecord, LeaveAllowance, WeightRecord, JournalEntry, CalendarData } from '@/lib/store/store'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/design-system'

interface WidgetDefinition {
  id: string
  title: string
  description: string
  category: string
  defaultEnabled: boolean
}

const WIDGET_REGISTRY: WidgetDefinition[] = [
  { id: 'journal', title: 'Journal', description: 'Write daily journal reflections', category: 'Habits', defaultEnabled: true },
  { id: 'workHours', title: 'Work Hours', description: 'Track work presence and goal status', category: 'Work', defaultEnabled: true },
  { id: 'leaveBalance', title: 'Leave Balance', description: 'View vacation and personal leave statistics', category: 'Work', defaultEnabled: true },
  { id: 'weight', title: 'Weight Tracker', description: 'Log and monitor body weight stats', category: 'Health', defaultEnabled: true },
  { id: 'recentDocuments', title: 'Recent Vault Documents', description: 'Quick access to recently decrypted files', category: 'Vault', defaultEnabled: true },
]

// ─── Sortable widget row (used inside the customizer dialog) ──────────────────

function SortableWidgetRow({
  widgetId,
  index,
  total,
  isHidden,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
}: {
  widgetId: string
  index: number
  total: number
  isHidden: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleHidden: () => void
}) {
  const widget = WIDGET_REGISTRY.find(w => w.id === widgetId)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  if (!widget) return null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-lg)]"
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        aria-label="Drag to reorder widget"
        className="shrink-0 mr-2 text-[var(--color-border)] hover:text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/50 rounded-sm"
      >
        <GripVertical className="w-4 h-4" aria-hidden />
      </button>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-[var(--color-text-main)]">{widget.title}</span>
        <span className="block text-[10px] text-[var(--color-text-muted)] truncate">{widget.description}</span>
      </div>

      {/* Accessible fallback controls */}
      <div className="flex items-center gap-1.5 ml-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label={`Move ${widget.title} up`}
          className="w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] disabled:opacity-30 rounded transition-colors"
        >
          ▲
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label={`Move ${widget.title} down`}
          className="w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] disabled:opacity-30 rounded transition-colors"
        >
          ▼
        </button>
        <button
          type="button"
          onClick={onToggleHidden}
          className="text-xs font-bold px-2 py-1 rounded-[var(--radius-sm)] transition-colors"
          aria-label={`Toggle ${widget.title} visibility`}
        >
          <span className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-bold ${
            isHidden
              ? 'bg-rose-500/10 text-[var(--color-overdue)]'
              : 'bg-emerald-500/10 text-[var(--color-completed)]'
          }`}>
            {isHidden ? 'Hidden' : 'Visible'}
          </span>
        </button>
      </div>
    </div>
  )
}

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
  initialDashboardConfig?: { order: string[]; hidden: string[] } | null
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

  // Widget config — standard Next.js isomorphic hydration approach
  const WIDGET_DEFAULTS = {
    order: ['journal', 'workHours', 'leaveBalance', 'weight', 'recentDocuments'] as string[],
    hidden: [] as string[],
  }
  const [widgetsConfig, setWidgetsConfig] = useState<{ order: string[]; hidden: string[] }>(() => {
    if (initialDashboardConfig) {
      return {
        order: initialDashboardConfig.order || WIDGET_DEFAULTS.order,
        hidden: initialDashboardConfig.hidden || WIDGET_DEFAULTS.hidden,
      }
    }
    return WIDGET_DEFAULTS
  })
  const [saveError, setSaveError] = useState(false)

  // Load config client-side only after mounting if server-sent config is not present
  useEffect(() => {
    if (initialDashboardConfig) return
    try {
      const saved = localStorage.getItem('personal_dashboard_config')
      if (saved) {
        const parsed = JSON.parse(saved)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidgetsConfig(prev => ({ ...prev, ...parsed }))
      }
    } catch (e) {
      console.error('[TodayDashboard] Failed to load widget config:', e)
    }
  }, [initialDashboardConfig])

  // Persist widgetsConfig when changed
  const initialMount = useRef(true)
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      return
    }
    localStorage.setItem('personal_dashboard_config', JSON.stringify(widgetsConfig))

    let active = true
    const saveConfig = async () => {
      try {
        const res = await saveDashboardConfigAction(widgetsConfig)
        if (active) {
          if (!res.success) {
            setSaveError(true)
          } else {
            setSaveError(false)
          }
        }
      } catch (err) {
        console.error('[TodayDashboard] Exception saving dashboard config:', err)
        if (active) setSaveError(true)
      }
    }
    saveConfig()
    return () => {
      active = false
    }
  }, [widgetsConfig])

  const [isCustomizing, setIsCustomizing] = useState(false)

  // dnd-kit sensors for widget customizer
  const widgetSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleWidgetDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = widgetsConfig.order.indexOf(String(active.id))
    const newIndex = widgetsConfig.order.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    setWidgetsConfig(prev => ({
      ...prev,
      order: arrayMove(prev.order, oldIndex, newIndex),
    }))
  }, [widgetsConfig.order])

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
      {/* Compose TodayHeader */}
      <TodayHeader
        todayStr={todayStr}
        todayLongDate={todayLongDate}
        calendarConnected={calendarData.connected}
        calendarLoading={calendarData.loading}
        onRefetchCalendar={onRefetchCalendar}
        onOpenCreateActivity={onOpenCreateActivity}
        onNavigateDate={handleNavigateDate}
        onGoToToday={() => router.push('/')}
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
                const res = await saveDashboardConfigAction(widgetsConfig)
                if (res.success) setSaveError(false)
              } catch (_) {}
            }}
          >
            Retry Sync
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3.25fr)_minmax(0,1.25fr)] gap-8 items-start">
        {/* Left Column: Tasks Feed */}
        <div className="space-y-6 min-w-0">
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
          />
        </div>

        {/* Right Column: Widgets */}
        <div className="space-y-6 xl:sticky xl:top-6">
          <div className="flex justify-between items-center pb-2 border-b border-[var(--color-border)]/40">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Dashboard Widgets</span>
            <Button variant="ghost" size="sm" onClick={() => setIsCustomizing(true)} className="text-xs font-semibold">
              Edit Dashboard
            </Button>
          </div>

          {widgetsConfig.order.map((widgetId) => {
            if (widgetsConfig.hidden.includes(widgetId)) return null

            switch (widgetId) {
              case 'journal':
                return (
                  <JournalWidget
                    key="journal"
                    todayJournal={todayJournal}
                    onOpenJournal={() => onTabChange('journal')}
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
                  />
                )
              case 'weight':
                return (
                  <WeightWidget
                    key="weight"
                    isVisible={true}
                    weightRecords={weightRecords}
                  />
                )
              case 'recentDocuments':
                return (
                  <RecentDocumentsWidget
                    key="recentDocs"
                    isVisible={true}
                    onTabChange={onTabChange}
                  />
                )
              default:
                return null
            }
          })}
        </div>
      </div>

      <Dialog open={isCustomizing} onOpenChange={setIsCustomizing}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit Dashboard Widgets</DialogTitle>
            <DialogDescription>
              Toggle visibility and arrange the order of your home screen widgets.
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 space-y-4">
            <div className="space-y-2.5">
              <DndContext
                sensors={widgetSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleWidgetDragEnd}
              >
                <SortableContext
                  items={widgetsConfig.order}
                  strategy={verticalListSortingStrategy}
                >
                  {widgetsConfig.order.map((widgetId, index) => {
                    const isHidden = widgetsConfig.hidden.includes(widgetId)
                    return (
                      <SortableWidgetRow
                        key={widgetId}
                        widgetId={widgetId}
                        index={index}
                        total={widgetsConfig.order.length}
                        isHidden={isHidden}
                        onMoveUp={() => {
                          const newOrder = [...widgetsConfig.order]
                          ;[newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]]
                          setWidgetsConfig(prev => ({ ...prev, order: newOrder }))
                        }}
                        onMoveDown={() => {
                          const newOrder = [...widgetsConfig.order]
                          ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
                          setWidgetsConfig(prev => ({ ...prev, order: newOrder }))
                        }}
                        onToggleHidden={() => {
                          const newHidden = isHidden
                            ? widgetsConfig.hidden.filter(id => id !== widgetId)
                            : [...widgetsConfig.hidden, widgetId]
                          setWidgetsConfig(prev => ({ ...prev, hidden: newHidden }))
                        }}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setWidgetsConfig({
                  order: ['journal', 'workHours', 'leaveBalance', 'weight', 'recentDocuments'],
                  hidden: []
                })
              }}
            >
              Reset to Defaults
            </Button>
            <Button variant="primary" onClick={() => setIsCustomizing(false)}>
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
