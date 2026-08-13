"use client"

import React, { useState, useMemo } from 'react'
import { Check, ArrowRightCircle, ExternalLink, MoreVertical, GripVertical } from 'lucide-react'
import { TimelineItem, ActivityLog, AnalyzedTemplate } from '@/types'
import { Button, Input, Skeleton, EmptyState } from '@/design-system'
import { getTemplateColorClasses } from '@/lib/colors'

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

// ── Reusable Task Row Component ──
interface TaskRowProps {
  occurrence: TimelineItem
  index: number
  allowDragIndex: number | null
  setAllowDragIndex: (idx: number | null) => void
  expandedTaskId: string | null
  setExpandedTaskId: (id: string | null) => void
  completingHabitId: string | null
  activeMenuId: string | null
  setActiveMenuId: (id: string | null) => void
  cycleTaskStatus: (occurrence: TimelineItem) => Promise<void>
  setTaskStatusAction: (occurrence: TimelineItem, date: string, status: 'cleared' | 'done' | 'skipped' | 'postponed', payload?: unknown) => Promise<void>
  deleteActivityLog: (id: string) => Promise<unknown>
  onOpenCreateActivity: () => void
  todayStr: string
  analyzedTemplates: AnalyzedTemplate[]
  handleDragStart: (e: React.DragEvent, idx: number) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, idx: number) => void
}

export const TaskRow: React.FC<TaskRowProps> = ({
  occurrence,
  index,
  allowDragIndex,
  setAllowDragIndex,
  expandedTaskId,
  setExpandedTaskId,
  completingHabitId,
  activeMenuId,
  setActiveMenuId,
  cycleTaskStatus,
  setTaskStatusAction,
  deleteActivityLog,
  onOpenCreateActivity,
  todayStr,
  analyzedTemplates,
  handleDragStart,
  handleDragOver,
  handleDrop,
}) => {
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

  const isCanceled = occurrence.status === 'skipped'
  const isPostponed = occurrence.status === 'postponed'
  const isDone = occurrence.completed && !isCanceled && !isPostponed

  // Status strip color mapping
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

  const handleRowClick = () => {
    if (!isGoogleCalendar && occurrence.templateId) {
      setExpandedTaskId(expandedTaskId === occurrence.templateId ? null : occurrence.templateId)
    }
  }

  return (
    <div className="flex flex-col border-b border-[var(--color-border)]/40 last:border-b-0">
      <div
        draggable={!isGoogleCalendar && allowDragIndex === index}
        onDragStart={(e) => handleDragStart(e, index)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, index)}
        onClick={handleRowClick}
        className={`flex items-center gap-3 px-3 py-2.5 transition-all duration-150 group relative hover:bg-[var(--color-accent)]/30 ${
          isGoogleCalendar ? '' : 'cursor-pointer'
        } ${isDone ? 'opacity-65' : isCanceled || isPostponed ? 'opacity-40' : ''}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusIndicatorColor}`} />

        {/* Checkbox target area - decoupled from row click */}
        <button
          type="button"
          disabled={completingHabitId === occurrence.templateId}
          onClick={(e) => {
            e.stopPropagation()
            cycleTaskStatus(occurrence)
          }}
          title={`Status: ${isDone ? 'Done' : isCanceled ? 'Canceled' : isPostponed ? 'Postponed' : 'Cleared'}. Click to cycle.`}
          className="shrink-0 w-11 h-11 flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 active:scale-90 disabled:opacity-50 -ml-2.5 -mr-2.5"
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
              <Check className="w-3.5 h-3.5" />
            ) : isCanceled ? (
              <span className="text-[10px] font-black leading-none">✕</span>
            ) : isPostponed ? (
              <ArrowRightCircle className="w-3.5 h-3.5" />
            ) : null}
          </div>
        </button>

        {/* Row Icon */}
        <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
          isGoogleCalendar
            ? 'bg-[var(--color-external)]/10 border-[var(--color-external)]/20 text-[var(--color-external)]'
            : `${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`
        }`}>
          {occurrence.icon ? (
            <span className="text-xs leading-none">✓</span>
          ) : (
            <span className="text-xs leading-none">📋</span>
          )}
        </div>

        {/* Title & Metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold leading-tight truncate ${
              isDone || isCanceled ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-main)]'
            }`}>
              {occurrence.htmlLink ? (
                <a
                  href={occurrence.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline inline-flex items-center gap-1"
                >
                  <span className="truncate">{occurrence.templateName}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-40 shrink-0" />
                </a>
              ) : (
                occurrence.templateName
              )}
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
              <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-extrabold text-orange-500 bg-orange-500/10 px-1 py-0.5 rounded-sm border border-orange-500/25">
                🔥 {streak}
              </span>
            )}
          </div>
        </div>

        {/* Three-Dot Menu */}
        {!isGoogleCalendar && (
          <div className="relative shrink-0 flex items-center ml-auto mr-1">
            <button
              type="button"
              title="More Actions"
              onClick={(e) => {
                e.stopPropagation()
                setActiveMenuId(activeMenuId === occurrence.id ? null : occurrence.id)
              }}
              className="w-11 h-11 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer -mr-3.5"
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

        {/* Drag Handle */}
        {!isGoogleCalendar && (
          <button
            type="button"
            onMouseEnter={() => setAllowDragIndex(index)}
            onMouseLeave={() => setAllowDragIndex(null)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-1 cursor-grab active:cursor-grabbing text-slate-300 dark:text-zinc-650 hover:text-slate-500 transition-colors ml-auto flex items-center"
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main TodayTasks Section Component ──
export const TodayTasks: React.FC<TodayTasksProps> = ({
  timeline,
  analyzedTemplates,
  logs,
  todayStr,
  isTodayHydrated,
  completingHabitId,
  activeMenuId,
  setActiveMenuId,
  cycleTaskStatus,
  setTaskStatusAction,
  deleteActivityLog,
  createActivityTemplateAction,
  reorderActivityTemplatesAction,
  onOpenCreateActivity,
}) => {
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [isCreatingQuickTask, setIsCreatingQuickTask] = useState(false)
  const [quickTaskColor, setQuickTaskColor] = useState<string>('blue')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [allowDragIndex, setAllowDragIndex] = useState<number | null>(null)
  const [manualOrderIds, setManualOrderIds] = useState<string[] | null>(null)

  // Local optimistic task list addition state (to make quick add instant)
  const [optimisticTasks, setOptimisticTasks] = useState<TimelineItem[]>([])

  const mergedTimeline = useMemo(() => {
    return [...timeline, ...optimisticTasks]
  }, [timeline, optimisticTasks])

  const sortedTimeline = useMemo(() => {
    const overdueTemplates = analyzedTemplates.filter(t => t.template.isActive && t.analysis.overdue)
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

    const overdueTemplateIds = new Set(overdueOccurrences.map(o => o.templateId).filter(Boolean))
    const nonOverdueTimeline = mergedTimeline.filter(o => !o.templateId || !overdueTemplateIds.has(o.templateId))

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

    return [...overdueOccurrences, ...sortedTimed, ...sortedAnytime]
  }, [mergedTimeline, analyzedTemplates, logs, todayStr, manualOrderIds])

  const handleCreateQuickTask = async () => {
    const title = quickTaskTitle.trim()
    if (!title || isCreatingQuickTask) return

    setIsCreatingQuickTask(true)
    setQuickTaskTitle('')

    // Create optimistic local UI item
    const tempId = `temp-quick-${Date.now()}`
    const tempItem: TimelineItem = {
      id: tempId,
      templateName: title,
      type: 'TASK',
      priority: 'NORMAL',
      isAllDay: true,
      completed: false,
      start: new Date(),
      end: new Date()
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
        targetDate: `${todayStr}T00:00:00.000Z`
      })
      // Success! Once store triggers refresh, timeline gets populated
      // We can clear the temporary local item
      setOptimisticTasks(prev => prev.filter(t => t.id !== tempId))
    } catch (err) {
      console.error('Failed to create quick task:', err)
      setOptimisticTasks(prev => prev.filter(t => t.id !== tempId))
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

  // Drag & Drop reordering
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

    const reordered = [...sortedTimeline]
    const [movedItem] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, movedItem)

    const localTemplateIds = reordered
      .map(item => item.templateId)
      .filter((id): id is string => !!id)

    setManualOrderIds(localTemplateIds)

    try {
      await reorderActivityTemplatesAction(localTemplateIds)
    } catch (err) {
      console.error('Failed to persist template order:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Timeline Flat list */}
      {!isTodayHydrated ? (
        <div className="space-y-1.5" style={{ minHeight: '200px' }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : (
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]/40 overflow-hidden shadow-xs">
          {sortedTimeline.length === 0 ? (
            <EmptyState title="Your Day is Clear! 🎉" description="No activities scheduled for today." />
          ) : (
            sortedTimeline.map((o, idx) => (
              <TaskRow
                key={o.id}
                occurrence={o}
                index={idx}
                allowDragIndex={allowDragIndex}
                setAllowDragIndex={setAllowDragIndex}
                expandedTaskId={expandedTaskId}
                setExpandedTaskId={setExpandedTaskId}
                completingHabitId={completingHabitId}
                activeMenuId={activeMenuId}
                setActiveMenuId={setActiveMenuId}
                cycleTaskStatus={cycleTaskStatus}
                setTaskStatusAction={setTaskStatusAction}
                deleteActivityLog={deleteActivityLog}
                onOpenCreateActivity={onOpenCreateActivity}
                todayStr={todayStr}
                analyzedTemplates={analyzedTemplates}
                handleDragStart={handleDragStart}
                handleDragOver={handleDragOver}
                handleDrop={handleDrop}
              />
            ))
          )}
          
          {/* Quick Task Add Input */}
          <div className="p-2.5 bg-[var(--color-bg-subtle)]/60 border-t border-[var(--color-border)]/60 flex items-center gap-2 relative">
            <div className="flex-1">
              <Input
                placeholder="+ Type a task for today and press Enter..."
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                onKeyDown={handleQuickTaskKeyDown}
                className="text-xs bg-[var(--color-bg-surface)] placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            
            {/* Color Picker popover */}
            <div className="relative shrink-0 flex items-center">
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className={`w-5 h-5 rounded-full border border-slate-355 dark:border-zinc-700 transition-all hover:scale-110 cursor-pointer ${
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
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setShowTemplatesDropdown(false)
                              const occ: TimelineItem = {
                                id: `schedule_${t.id}_${todayStr}`,
                                templateId: t.id,
                                templateName: t.name,
                                type: t.type,
                                priority: t.priority,
                                start: new Date(),
                                end: new Date(),
                                isAllDay: true,
                                completed: false,
                              }
                              cycleTaskStatus(occ)
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-[var(--color-text-main)] hover:bg-[var(--color-accent)]/10 font-medium transition-colors"
                          >
                            {t.name}
                          </button>
                        )
                      })
                  )}
                </div>
              )}
            </div>
            {isCreatingQuickTask && (
              <span className="text-[10px] text-blue-500 animate-pulse font-medium shrink-0 ml-1">Syncing…</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
