"use client"

import React, { useState, useMemo, useCallback } from 'react'
import { ExternalLink, MoreVertical, Clock } from 'lucide-react'
import { TimelineItem, ActivityLog, AnalyzedTemplate } from '@/types'
import { Button, Input, Skeleton, EmptyState, IconButton, StatusBadge, Section, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, ConfirmDialog } from '@/design-system'
import { getTemplateColorClasses } from '@/lib/colors'
import { SortableTaskList, DragHandle } from './SortableTaskList'
import { TaskActivityRow } from '@/components/shared/TaskActivityRow'
import { TaskCreateDialog } from '@/components/shared/TaskCreateDialog'
import { Icon } from '@/components/Icon'

interface TodayTasksProps {
  timeline: TimelineItem[]
  analyzedTemplates: AnalyzedTemplate[]
  logs: ActivityLog[]
  todayStr: string
  isTodayHydrated: boolean
  completingHabitId: string | null
  activeMenuId: string | null
  setActiveMenuId: (id: string | null) => void
  cycleTaskStatus: (occurrence: TimelineItem) => Promise<void>
  setTaskStatusAction: (occurrence: TimelineItem, date: string, status: 'cleared' | 'done' | 'skipped' | 'postponed', payload?: unknown) => Promise<void>
  deleteActivityLog: (id: string) => Promise<unknown>
  createActivityTemplateAction: (data: unknown) => Promise<unknown>
  reorderActivityTemplatesAction: (ids: string[]) => Promise<unknown>
  onOpenCreateActivity: () => void
}

interface TaskRowProps {
  occurrence: TimelineItem
  index: number
  completingHabitId: string | null
  activeMenuId: string | null
  setActiveMenuId: (id: string | null) => void
  cycleTaskStatus: (occurrence: TimelineItem) => Promise<void>
  setTaskStatusAction: (occurrence: TimelineItem, date: string, status: 'cleared' | 'done' | 'skipped' | 'postponed', payload?: unknown) => Promise<void>
  deleteActivityLog: (id: string) => Promise<unknown>
  onOpenCreateActivity: () => void
  todayStr: string
  analyzedTemplates: AnalyzedTemplate[]
  isDragOverlay?: boolean
  // Injected by SortableItem via cloneElement
  _dragHandleRef?: (el: HTMLElement | null) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _dragHandleListeners?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _dragHandleAttributes?: Record<string, any>
}

// ── Context Actions Menu ──
const TaskContextMenu: React.FC<{
  occurrence: TimelineItem
  isDone: boolean
  isCanceled: boolean
  isPostponed: boolean
  todayStr: string
  template: AnalyzedTemplate['template'] | undefined
  setTaskStatusAction: (o: TimelineItem, date: string, status: 'cleared' | 'done' | 'skipped' | 'postponed') => Promise<void>
  deleteActivityLog: (id: string) => Promise<unknown>
  onOpenCreateActivity: () => void
}> = ({
  occurrence, isDone, isCanceled, isPostponed, todayStr,
  template, setTaskStatusAction, deleteActivityLog, onOpenCreateActivity
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <IconButton
        icon={<MoreVertical className="w-3.5 h-3.5" />}
        label="More actions"
        variant="ghost"
        size="sm"
        onClick={(e) => e.stopPropagation()}
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {isDone && (
        <DropdownMenuItem onClick={async (e) => { e.stopPropagation(); await setTaskStatusAction(occurrence, todayStr, 'cleared') }}>
          Mark Uncompleted
        </DropdownMenuItem>
      )}
      {isCanceled && (
        <DropdownMenuItem onClick={async (e) => { e.stopPropagation(); await setTaskStatusAction(occurrence, todayStr, 'cleared') }}>
          Restore Task
        </DropdownMenuItem>
      )}
      {isPostponed && (
        <DropdownMenuItem onClick={async (e) => { e.stopPropagation(); await setTaskStatusAction(occurrence, todayStr, 'cleared') }}>
          Restore Task
        </DropdownMenuItem>
      )}
      {!isDone && !isCanceled && !isPostponed && (
        <>
          <DropdownMenuItem onClick={async (e) => { e.stopPropagation(); await setTaskStatusAction(occurrence, todayStr, 'done') }}>
            Mark Completed
          </DropdownMenuItem>
          <DropdownMenuItem variant="danger" onClick={async (e) => { e.stopPropagation(); await setTaskStatusAction(occurrence, todayStr, 'skipped') }}>
            Skip Today
          </DropdownMenuItem>
          {template?.recurrenceType !== 'daily' && (
            <DropdownMenuItem onClick={async (e) => { e.stopPropagation(); await setTaskStatusAction(occurrence, todayStr, 'postponed') }}>
              Postpone to Tomorrow
            </DropdownMenuItem>
          )}
        </>
      )}
      {occurrence.templateId && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenCreateActivity() }}>
            Edit Template
          </DropdownMenuItem>
        </>
      )}
      {occurrence.logId && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger" onClick={(e) => {
            e.stopPropagation()
            deleteActivityLog(occurrence.logId!)
          }}>
            Delete Log
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
)

// ── Task Row ──
export const TaskRow: React.FC<TaskRowProps> = ({
  occurrence, index: _index,
  completingHabitId, activeMenuId: _activeMenuId, setActiveMenuId: _setActiveMenuId,
  cycleTaskStatus, setTaskStatusAction, deleteActivityLog,
  onOpenCreateActivity, todayStr, analyzedTemplates,
  isDragOverlay,
  _dragHandleRef, _dragHandleListeners, _dragHandleAttributes,
}) => {
  const isTimed = !occurrence.isAllDay
  const startTimeLabel = isTimed && occurrence.start
    ? new Date(occurrence.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

  const matched = occurrence.templateId
    ? analyzedTemplates.find(t => t.template.id === occurrence.templateId)
    : null
  const template = matched?.template
  const estimatedDuration = template?.estimatedDuration
  const streak = matched?.analysis.streak ?? 0

  const templateColor = template?.color || 'zinc'
  const colorClasses = getTemplateColorClasses(templateColor)

  const isCanceled = occurrence.status === 'skipped'
  const isPostponed = occurrence.status === 'postponed'
  const isDone = occurrence.completed && !isCanceled && !isPostponed

  // Accent strip — semantic color by status, then template color
  const colorBgMap: Record<string, string> = {
    red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500',
    green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
    pink: 'bg-pink-500', zinc: 'bg-zinc-400',
  }
  let accentColor = colorBgMap[templateColor] || 'bg-zinc-400'
  if (isDone) accentColor = 'bg-[var(--color-completed)]'
  else if (isCanceled) accentColor = 'bg-[var(--color-overdue)]'
  else if (isPostponed) accentColor = 'bg-[var(--color-external)]'

  // Build title node
  const titleNode = occurrence.htmlLink ? (
    <a href={occurrence.htmlLink} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hover:underline inline-flex items-center gap-1">
      <span className="truncate">{occurrence.templateName}</span>
      <ExternalLink className="w-2.5 h-2.5 opacity-40 shrink-0" />
    </a>
  ) : occurrence.templateName

  // Build subtitle / meta line
  const metaParts: React.ReactNode[] = []
  if (isTimed && startTimeLabel) metaParts.push(
    <span key="time" className={`font-mono font-bold text-[9px] px-1 py-0.5 rounded-sm border ${colorClasses.text} ${colorClasses.border} ${colorClasses.bg}`}>
      {startTimeLabel}{estimatedDuration ? ` · ${estimatedDuration}m` : ''}
    </span>
  )
  if (streak > 1 && !isDone && !isCanceled) metaParts.push(
    <span key="streak" className="text-[9px] font-extrabold text-orange-500">🔥 {streak}</span>
  )

  // Right side: status badge + context menu
  const rightSlot = (
    <div className="flex items-center gap-1.5">
      {(isDone || isCanceled || isPostponed) && (
        <StatusBadge
          status={isDone ? 'done' : isCanceled ? 'skipped' : 'postponed'}
          size="xs"
        />
      )}
      <TaskContextMenu
        occurrence={occurrence}
        isDone={isDone}
        isCanceled={isCanceled}
        isPostponed={isPostponed}
        todayStr={todayStr}
        template={template}
        setTaskStatusAction={setTaskStatusAction}
        deleteActivityLog={deleteActivityLog}
        onOpenCreateActivity={onOpenCreateActivity}
      />
    </div>
  )

  return (
    <TaskActivityRow
      id={occurrence.id}
      title={titleNode}
      icon={template ? <Icon name={template.icon || 'CheckSquare'} size={12} /> : undefined}
      isExternal={false}
      status={occurrence.status as 'cleared' | 'done' | 'skipped' | 'postponed' | undefined}
      isCompleted={isDone}
      isSkipped={isCanceled}
      isPostponed={isPostponed}
      isLoading={completingHabitId === occurrence.templateId}
      accentColorClass={accentColor}
      onCheckboxClick={() => cycleTaskStatus(occurrence)}
      meta={metaParts.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {metaParts}
        </div>
      ) : undefined}
      rightActions={rightSlot}
      isDragOverlay={isDragOverlay}
      dragHandle={
        <DragHandle
          dragHandleRef={_dragHandleRef}
          dragHandleListeners={_dragHandleListeners}
          dragHandleAttributes={_dragHandleAttributes}
        />
      }
    />
  )
}

// ── Main TodayTasks ──
export const TodayTasks: React.FC<TodayTasksProps> = ({
  timeline, analyzedTemplates, logs: _logs, todayStr, isTodayHydrated,
  completingHabitId, activeMenuId, setActiveMenuId,
  cycleTaskStatus, setTaskStatusAction, deleteActivityLog,
  createActivityTemplateAction, reorderActivityTemplatesAction,
  onOpenCreateActivity,
}) => {
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [isCreatingQuickTask, setIsCreatingQuickTask] = useState(false)
  const [quickTaskColor, setQuickTaskColor] = useState<string>('blue')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false)
  const [manualOrderIds, setManualOrderIds] = useState<string[] | null>(null)
  const [optimisticTasks, setOptimisticTasks] = useState<TimelineItem[]>([])
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null)
  const [isDeletingLog, setIsDeletingLog] = useState(false)

  const handleCreateFromDialog = async (data: {
    name: string
    category: string
    type: string
    priority: string
    icon: string
    color: string
    targetDate: string
    scheduledTime?: string | null
    estimatedDuration?: number | null
    isAllDay: boolean
    notes?: string | null
    metadata?: Record<string, unknown>
  }) => {
    await createActivityTemplateAction({
      name: data.name,
      category: data.category || 'general',
      type: data.type || 'TASK',
      priority: data.priority || 'NORMAL',
      icon: data.icon || 'CheckSquare',
      color: data.color || 'blue',
      recurrenceType: 'one_time',
      targetDate: data.targetDate,
      scheduledTime: data.scheduledTime,
      estimatedDuration: data.estimatedDuration,
      notes: data.notes,
      metadata: data.metadata || { isQuickTask: true, source: 'today' },
    })
  }

  const handleDeleteLogConfirm = async () => {
    if (!deletingLogId) return
    setIsDeletingLog(true)
    try {
      await deleteActivityLog(deletingLogId)
    } finally {
      setIsDeletingLog(false)
      setDeletingLogId(null)
    }
  }

  // Separate Google Calendar external events from local tasks
  const calendarEvents = useMemo(() => {
    return timeline.filter(item => item.id.startsWith('google_') || (!item.templateId && item.type === 'MEETING'))
  }, [timeline])

  const mergedTasks = useMemo(() => {
    const localTimeline = timeline.filter(item => !item.id.startsWith('google_') && (!!item.templateId || item.type !== 'MEETING'))
    return [...localTimeline, ...optimisticTasks]
  }, [timeline, optimisticTasks])

  // Single unified deterministic stable ordering preserving position on complete/cancel
  const sortedTasks = useMemo(() => {
    const list = [...mergedTasks]
    return list.sort((a, b) => {
      // 1. Manual drag-and-drop order overrides default
      if (manualOrderIds) {
        const ia = manualOrderIds.indexOf(a.templateId || a.id)
        const ib = manualOrderIds.indexOf(b.templateId || b.id)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
      }
      // 2. Timed tasks come before all-day tasks
      if (a.isAllDay !== b.isAllDay) {
        return a.isAllDay ? 1 : -1
      }
      if (!a.isAllDay) {
        const tA = a.start ? new Date(a.start).getTime() : 0
        const tB = b.start ? new Date(b.start).getTime() : 0
        if (tA !== tB) return tA - tB
      }
      // 3. User configured sortOrder from template
      const tA = analyzedTemplates.find(t => t.template.id === a.templateId)?.template
      const tB = analyzedTemplates.find(t => t.template.id === b.templateId)?.template
      return (tA?.sortOrder ?? 0) - (tB?.sortOrder ?? 0)
    })
  }, [mergedTasks, analyzedTemplates, manualOrderIds])

  const handleCreateQuickTask = async () => {
    const title = quickTaskTitle.trim()
    if (!title || isCreatingQuickTask) return
    setIsCreatingQuickTask(true)
    setQuickTaskTitle('')
    const tempId = `temp-quick-${Date.now()}`
    const tempItem: TimelineItem = {
      id: tempId, templateName: title, type: 'TASK', priority: 'NORMAL',
      isAllDay: true, completed: false, start: new Date(), end: new Date(),
    }
    setOptimisticTasks(prev => [...prev, tempItem])
    try {
      await createActivityTemplateAction({
        name: title,
        category: 'general',
        type: 'TASK',
        priority: 'NORMAL',
        icon: 'CheckSquare',
        color: quickTaskColor,
        recurrenceType: 'one_time',
        targetDate: `${todayStr}T00:00:00.000Z`,
        metadata: { isQuickTask: true },
      })
      setOptimisticTasks(prev => prev.filter(t => t.id !== tempId))
    } catch (err) {
      console.error('Failed to create quick task:', err)
      setOptimisticTasks(prev => prev.filter(t => t.id !== tempId))
    } finally {
      setIsCreatingQuickTask(false)
    }
  }

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    setManualOrderIds(orderedIds)
    try { await reorderActivityTemplatesAction(orderedIds) }
    catch (err) { console.error('Failed to persist order:', err) }
  }, [reorderActivityTemplatesAction])

  const renderTask = useCallback((occurrence: TimelineItem, opts: { isDragOverlay?: boolean }) => (
    <TaskRow
      key={occurrence.id}
      occurrence={occurrence}
      index={0}
      completingHabitId={completingHabitId}
      activeMenuId={activeMenuId}
      setActiveMenuId={setActiveMenuId}
      cycleTaskStatus={cycleTaskStatus}
      setTaskStatusAction={setTaskStatusAction}
      deleteActivityLog={async (id) => setDeletingLogId(id)}
      onOpenCreateActivity={onOpenCreateActivity}
      todayStr={todayStr}
      analyzedTemplates={analyzedTemplates}
      isDragOverlay={opts.isDragOverlay}
    />
  ), [completingHabitId, activeMenuId, setActiveMenuId, cycleTaskStatus, setTaskStatusAction, onOpenCreateActivity, todayStr, analyzedTemplates])

  const COLORS = ['blue', 'green', 'amber', 'orange', 'red', 'purple', 'pink', 'zinc'] as const
  const colorToBg: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-green-500', amber: 'bg-amber-500',
    orange: 'bg-orange-500', red: 'bg-red-500', purple: 'bg-purple-500',
    pink: 'bg-pink-500', zinc: 'bg-zinc-500',
  }

  const doneCount = sortedTasks.filter(o => o.completed && o.status !== 'skipped' && o.status !== 'postponed').length

  return (
    <div className="space-y-6">
      {/* ── 1. Tasks & Activities Section (Movable & Reorderable) ── */}
      <Section
        title="Tasks"
        count={sortedTasks.length > 0 ? sortedTasks.length - doneCount : undefined}
        noSeparator={false}
      >
        {!isTodayHydrated ? (
          <div className="space-y-1.5">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : (
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--card-shadow)]">
            {sortedTasks.length === 0 ? (
              <EmptyState title="Day is clear 🎉" description="No activities scheduled for today." />
            ) : (
              <SortableTaskList
                items={sortedTasks}
                onReorder={handleReorder}
                renderItem={renderTask}
              />
            )}

            <ConfirmDialog
              isOpen={!!deletingLogId}
              onClose={() => setDeletingLogId(null)}
              onConfirm={handleDeleteLogConfirm}
              title="Delete Log"
              description="Delete today's log for this activity?"
              confirmText="Delete"
              cancelText="Cancel"
              variant="danger"
              isLoading={isDeletingLog}
            />

            {/* Quick Task Add */}
            <div className="p-2.5 bg-[var(--color-bg-subtle)] border-t border-[var(--color-border)]/60 flex items-center gap-2">
              <div className="flex-1">
                <Input
                  placeholder="+ Add a task for today…"
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateQuickTask() } }}
                  className="text-xs"
                />
              </div>

              {/* Color dot picker */}
              <div className="relative shrink-0">
                <button type="button" onClick={() => setShowColorPicker(!showColorPicker)}
                  title="Pick task color"
                  className={`w-5 h-5 rounded-full border border-[var(--color-border)] transition-transform hover:scale-110 cursor-pointer ${colorToBg[quickTaskColor]}`}
                />
                {showColorPicker && (
                  <div className="absolute bottom-8 right-0 bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-2 rounded-[var(--radius-xl)] shadow-lg flex gap-1.5 z-50">
                    {COLORS.map(c => (
                      <button key={c} type="button"
                        onClick={() => { setQuickTaskColor(c); setShowColorPicker(false) }}
                        className={`w-4 h-4 rounded-full cursor-pointer hover:scale-110 ${colorToBg[c]} ${quickTaskColor === c ? 'ring-2 ring-offset-1 ring-[var(--color-primary)]' : ''}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Full Task Dialog Trigger */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsTaskDialogOpen(true)}
                className="text-xs font-semibold"
              >
                + Details
              </Button>

              {/* Templates picker */}
              <div className="relative shrink-0">
                <Button size="sm" variant="outline"
                  onClick={() => { setShowTemplatesDropdown(!showTemplatesDropdown); setShowColorPicker(false) }}
                  className="text-xs font-semibold">
                  Templates
                </Button>
                {showTemplatesDropdown && (
                  <div className="absolute bottom-10 right-0 bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-2 rounded-[var(--radius-xl)] shadow-lg flex flex-col gap-1 z-50 w-64 max-h-60 overflow-y-auto">
                    <div className="text-[9px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] border-b border-[var(--color-border)]/50 pb-1.5 mb-1.5 px-1">
                      Select Template
                    </div>
                    {analyzedTemplates.filter(at => at.template.recurrenceType !== 'one_time').length === 0
                      ? <div className="text-[10px] text-[var(--color-text-muted)] italic py-3 text-center">No templates</div>
                      : analyzedTemplates.filter(at => at.template.recurrenceType !== 'one_time').map(at => (
                          <button key={at.template.id} type="button"
                            onClick={() => { setShowTemplatesDropdown(false); cycleTaskStatus({ id: `schedule_${at.template.id}_${todayStr}`, templateId: at.template.id, templateName: at.template.name, type: at.template.type, priority: at.template.priority, start: new Date(), end: new Date(), isAllDay: true, completed: false }) }}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-[var(--color-text-main)] hover:bg-[var(--color-accent)] font-medium transition-colors">
                            {at.template.name}
                          </button>
                        ))
                    }
                  </div>
                )}
              </div>
              {isCreatingQuickTask && (
                <span className="text-[10px] text-[var(--color-primary)] animate-pulse font-semibold shrink-0">Saving…</span>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* ── 2. Calendar Events Section (Classified Separately, Matching Calendar Page) ── */}
      {calendarEvents.length > 0 && (
        <Section
          title="Calendar Events"
          count={calendarEvents.length}
          noSeparator={false}
        >
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] divide-y divide-[var(--color-border)]/40 overflow-hidden shadow-[var(--card-shadow)]">
            {calendarEvents.map(event => {
              let timeLabel = 'All Day'
              if (!event.isAllDay && event.start && event.end) {
                const s = new Date(event.start)
                const e = new Date(event.end)
                timeLabel = `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
              }

              return (
                <div
                  key={event.id}
                  onClick={event.htmlLink ? () => window.open(event.htmlLink, '_blank') : undefined}
                  className={`flex items-center justify-between px-3.5 py-2.5 hover:bg-[var(--color-accent)]/20 transition-colors relative ${
                    event.htmlLink ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Semantic accent strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--color-external)]" />

                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-md border border-[var(--color-external)]/30 bg-[var(--color-external)]/10 text-[var(--color-external)] flex items-center justify-center shrink-0">
                      <Icon name="Calendar" size={12} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[var(--color-text-main)] truncate block">
                          {event.templateName}
                        </span>
                        {event.htmlLink && <ExternalLink className="w-2.5 h-2.5 text-[var(--color-text-muted)] opacity-60 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5 font-mono">
                        <Clock size={10} /> {timeLabel}
                        {event.location && (
                          <span className="truncate ml-1 font-sans opacity-85">📍 {event.location}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <TaskCreateDialog
        isOpen={isTaskDialogOpen}
        onClose={() => setIsTaskDialogOpen(false)}
        initialDate={todayStr}
        source="today"
        onSubmitTask={handleCreateFromDialog}
      />
    </div>
  )
}
export default TodayTasks
