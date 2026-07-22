"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Note, WorkoutExercise, WorkoutPayload, RunningPayload, MeasurementsPayload, TimelineItem } from '@/types'
import { createLog, updateLog, deleteLog, markComplete, postponeOneTimeTask, unpostponeOneTimeTask } from '@/app/actions/log'
import { Icon } from './Icon'
import { X, Trash2, Edit2, Sparkles, BookOpen, Search, Check, ArrowRightCircle } from 'lucide-react'
import { getTemplateColorClasses } from '@/lib/colors'
import { useRouter } from 'next/navigation'
import { analyzeRecurrence } from '@/lib/recurrence'
import { generateTimeline } from '@/modules/sync/google-calendar/utils/dashboardHelpers'
import { Button, Input, Select } from '@/design-system'

import { MarathiCalendarEvents } from './daylogs/MarathiCalendarEvents'

import { WorkoutLogger } from './daylogs/WorkoutLogger'
import { RunningLogger } from './daylogs/RunningLogger'
import { MeasurementsLogger } from './daylogs/MeasurementsLogger'

interface DayLogsModalProps {
  isOpen: boolean
  onClose: () => void
  dateStr: string // YYYY-MM-DD
  templates: ActivityTemplate[]
  logs: ActivityLog[] // All logs for this specific date
  note: Note | null // Standalone note for this date
  initialTab?: 'activities' | 'notes'
  allLogs: ActivityLog[] // All history logs
}

export const DayLogsModal: React.FC<DayLogsModalProps> = ({
  isOpen,
  onClose,
  dateStr,
  templates,
  logs,
  note,
  initialTab,
  allLogs,
}) => {
  const router = useRouter()

  // Re-analyze recurrence for the selected dateStr
  const analyzedTemplatesForDate = React.useMemo(() => {
    return templates.map(template => {
      const templateLogs = allLogs.filter(log => log.activityId === template.id)
      const analysis = analyzeRecurrence(template, templateLogs, dateStr)
      return { template, analysis }
    })
  }, [templates, allLogs, dateStr])

  // Generate timeline occurrences for that dateStr
  const timelineForDate = React.useMemo(() => {
    return generateTimeline(analyzedTemplatesForDate, logs, dateStr, [])
  }, [analyzedTemplatesForDate, logs, dateStr])

  // Sort them: timed first, then anytime
  const orderedItemsForDate = React.useMemo(() => {
    const timed = timelineForDate.filter(o => !o.isAllDay).sort((a, b) => {
      const aTime = a.start ? new Date(a.start).getTime() : 0
      const bTime = b.start ? new Date(b.start).getTime() : 0
      return aTime - bTime
    })
    const anytime = timelineForDate.filter(o => o.isAllDay).sort((a, b) => {
      const tA = templates.find(t => t.id === a.templateId)
      const tB = templates.find(t => t.id === b.templateId)
      return (tA?.sortOrder ?? 0) - (tB?.sortOrder ?? 0)
    })
    return [...timed, ...anytime]
  }, [timelineForDate, templates])

  const handleCycleStatusForDate = async (occurrence: TimelineItem) => {
    if (!occurrence.templateId) return
    const matched = templates.find(t => t.id === occurrence.templateId)
    if (!matched) return

    const isCanceled = occurrence.status === 'skipped'
    const isPostponed = occurrence.status === 'postponed'
    const isDone = occurrence.completed && !isCanceled && !isPostponed

    try {
      if (!occurrence.completed && !isCanceled && !isPostponed) {
        // Cleared -> Done
        const status = matched.category === 'finance' ? 'paid' : 'done'
        const amount = matched.amount
        await markComplete(occurrence.templateId, dateStr, status, amount ?? null, null)
      } else if (isDone) {
        // Done -> Canceled
        if (occurrence.logId) {
          await updateLog(occurrence.logId, { status: 'skipped' })
        } else {
          await markComplete(occurrence.templateId, dateStr, 'skipped')
        }
      } else if (isCanceled) {
        // Canceled -> Postponed (or Cleared if daily)
        const isDaily = matched.recurrenceType === 'daily'
        const isOneTime = matched.recurrenceType === 'one_time'
        if (isDaily) {
          if (occurrence.logId) {
            await deleteLog(occurrence.logId)
          }
        } else if (isOneTime) {
          // For one_time tasks: use dedicated action that updates targetDate
          await postponeOneTimeTask(occurrence.templateId, dateStr, occurrence.logId)
        } else {
          if (occurrence.logId) {
            await updateLog(occurrence.logId, { status: 'postponed' })
          } else {
            await markComplete(occurrence.templateId, dateStr, 'postponed')
          }
        }
      } else if (isPostponed) {
        // Postponed -> Cleared
        const isOneTime = matched.recurrenceType === 'one_time'
        if (isOneTime && occurrence.logId) {
          await unpostponeOneTimeTask(occurrence.templateId, occurrence.logId, dateStr)
        } else if (occurrence.logId) {
          await deleteLog(occurrence.logId)
        }
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to cycle task status:', err)
    }
  }

  const renderTimelineItemCard = (occurrence: TimelineItem) => {
    const isCanceled = occurrence.status === 'skipped'
    const isPostponed = occurrence.status === 'postponed'
    const isDone = occurrence.completed && !isCanceled && !isPostponed

    // Status border color strip
    let statusIndicatorColor = 'bg-slate-200 dark:bg-zinc-800'
    if (isDone) {
      statusIndicatorColor = 'bg-[var(--color-completed)]'
    } else if (isCanceled) {
      statusIndicatorColor = 'bg-[var(--color-overdue)]'
    } else if (isPostponed) {
      statusIndicatorColor = 'bg-[var(--color-external)]'
    }

    const template = templates.find(t => t.id === occurrence.templateId)
    const color = template?.color || 'zinc'
    const icon = template?.icon || 'CheckSquare'
    const name = template?.name || occurrence.templateName || 'Deleted Activity'
    const colorClasses = getTemplateColorClasses(color)

    // Find the associated log
    const log = occurrence.logId ? logs.find(l => l.id === occurrence.logId) : null

    return (
      <div
        key={occurrence.id}
        className="relative flex flex-col gap-1.5 px-3.5 py-2.5 group text-left select-none bg-white dark:bg-zinc-950 animate-in fade-in duration-200"
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusIndicatorColor}`} />

        <div className="flex justify-between items-center pl-1">
          <div className="flex items-center gap-3">
            {/* Custom Cycling Checkbox */}
            <button 
              type="button"
              onClick={() => handleCycleStatusForDate(occurrence)}
              className="shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer transition-all duration-305 hover:scale-110 active:scale-90"
            >
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300 shadow-xs ${
                isDone ? 'bg-[var(--color-completed)] border-[var(--color-completed)] text-white' :
                isCanceled ? 'bg-[var(--color-overdue)] border-[var(--color-overdue)] text-white' :
                isPostponed ? 'bg-[var(--color-external)] border-[var(--color-external)] text-white' :
                'bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-[var(--color-primary)]'
              }`}>
                {isDone ? (
                  <Check className="w-3 h-3 text-white" />
                ) : isCanceled ? (
                  <span className="text-[9px] font-black leading-none">✕</span>
                ) : isPostponed ? (
                  <ArrowRightCircle className="w-3.5 h-3.5" />
                ) : null}
              </div>
            </button>

            {/* Icon */}
            <div
              className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center border ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
            >
              <Icon name={icon} size={16} />
            </div>

            <div>
              <h4 className={`font-semibold text-sm ${
                isDone || isCanceled
                  ? 'line-through text-slate-400 dark:text-zinc-550'
                  : 'text-slate-800 dark:text-white'
              }`}>
                {name}
              </h4>
              <div className="flex flex-wrap gap-2 items-center mt-0.5">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center justify-center leading-none ${getStatusColor(occurrence.status || 'cleared')}`}>
                  {occurrence.status || 'cleared'}
                </span>
                {occurrence.amount !== null && occurrence.amount !== undefined && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold font-mono">
                    ₹{occurrence.amount.toFixed(2)}
                  </span>
                )}
                {log?.amount !== null && log?.amount !== undefined && log?.amount !== occurrence.amount && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold font-mono">
                    ₹{log.amount.toFixed(2)}
                  </span>
                )}
                {log?.note && (
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 italic">
                    &ldquo;{log.note}&rdquo;
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Edit/Delete Actions if logged */}
          {log && (
            <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenLogger(template!, log)}
                className="p-1"
                title="Edit log details"
              >
                <Edit2 size={13} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteLog(log.id)}
                className="p-1 text-red-500 hover:text-red-600"
                title="Delete completion"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          )}
        </div>

        {/* Run summary */}
        {log && (() => {
          const runPayload = log.payload as RunningPayload | null
          const hasRunData = runPayload && (runPayload.distance !== undefined || runPayload.duration !== undefined)
          if (!hasRunData) return null
          return (
            <div className="pl-10 border-l border-blue-400 dark:border-blue-800/80 space-y-1 mt-1 text-xs text-slate-600 dark:text-zinc-350">
              <div className="flex flex-wrap items-center gap-3">
                {runPayload.distance !== undefined && (
                  <span className="font-medium">
                    🏃 Distance: <strong className="text-slate-800 dark:text-white font-mono">{runPayload.distance} km</strong>
                  </span>
                )}
                {runPayload.duration !== undefined && (
                  <span className="font-medium">
                    ⏱ Duration: <strong className="text-slate-800 dark:text-white font-mono">{runPayload.duration} mins</strong>
                  </span>
                )}
                {runPayload.energy && (
                  <span className="font-medium">
                    ⚡ Feeling: <strong className="text-slate-800 dark:text-white">{runPayload.energy}</strong>
                  </span>
                )}
              </div>
            </div>
          )
        })()}

        {/* Measurements summary */}
        {log && (() => {
          const measPayload = log.payload as MeasurementsPayload | null
          const hasMeasData = measPayload && (measPayload.weight !== undefined || measPayload.waist !== undefined)
          if (!hasMeasData) return null
          return (
            <div className="pl-10 border-l border-purple-400 dark:border-purple-800/80 space-y-1 mt-1 text-xs text-slate-600 dark:text-zinc-350">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {measPayload.weight !== undefined && (
                  <span className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1.5 rounded-lg flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Weight</span>
                    <strong className="text-slate-800 dark:text-white font-mono text-xs">{measPayload.weight} kg</strong>
                  </span>
                )}
                {measPayload.waist !== undefined && (
                  <span className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1.5 rounded-lg flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Waist</span>
                    <strong className="text-slate-800 dark:text-white font-mono text-xs">{measPayload.waist} in</strong>
                  </span>
                )}
                {measPayload.chest !== undefined && (
                  <span className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1.5 rounded-lg flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Chest</span>
                    <strong className="text-slate-800 dark:text-white font-mono text-xs">{measPayload.chest} in</strong>
                  </span>
                )}
                {measPayload.arms !== undefined && (
                  <span className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1.5 rounded-lg flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Arms</span>
                    <strong className="text-slate-800 dark:text-white font-mono text-xs">{measPayload.arms} in</strong>
                  </span>
                )}
              </div>
            </div>
          )
        })()}

        {/* Workout summary */}
        {log && (() => {
          const workoutPayload = log.payload as WorkoutPayload | null
          return workoutPayload?.exercises && (
            <div className="pl-10 border-l border-slate-200 dark:border-zinc-800 space-y-1.5 mt-1">
              {workoutPayload.exercises.map((ex, idx) => (
                <div key={idx} className="text-xs">
                  <span className="font-semibold text-slate-600 dark:text-zinc-300">{ex.name}</span>
                  {ex.note && <span className="text-[10px] text-slate-450 dark:text-zinc-500 italic ml-1">({ex.note})</span>}
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {ex.sets.map((set, sIdx) => (
                      <span
                        key={sIdx}
                        className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-1.5 py-0.5 rounded text-[9px] text-slate-600 dark:text-zinc-400 font-mono"
                      >
                        S{sIdx + 1}: {set.reps}r {set.weight ? `@ ${set.weight}kg` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    )
  }

  // Tabs: 'activities' or 'notes'
  const [activeTab, setActiveTab] = useState<'activities' | 'notes'>(initialTab || 'activities')

  // Expanded editor for logging a template
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)

  // Log form state
  const [logStatus, setLogStatus] = useState('done')
  const [logNote, setLogNote] = useState('')
  const [logAmount, setLogAmount] = useState('')
  
  // Workout workout builder state
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([])
  const [isSavingLog, setIsSavingLog] = useState(false)

  // Extra payload details
  const [workoutEnergy, setWorkoutEnergy] = useState('Medium')
  
  const [runDistance, setRunDistance] = useState('')
  const [runDuration, setRunDuration] = useState('')
  const [runEnergy, setRunEnergy] = useState('Medium')

  const [measWeight, setMeasWeight] = useState('')
  const [measWaist, setMeasWaist] = useState('')
  const [measChest, setMeasChest] = useState('')
  const [measArms, setMeasArms] = useState('')

  // Selector search and tab states
  const [activitySearch, setActivitySearch] = useState('')
  const [activityFilterTab, setActivityFilterTab] = useState<'all' | 'daily' | 'weekly' | 'monthly' | 'yearly_other'>('all')

  const filteredTemplates = templates.filter(t => {
    const query = activitySearch.trim().toLowerCase()
    if (query !== '') {
      return t.name.toLowerCase().includes(query) || t.category.toLowerCase().includes(query)
    }
    
    if (activityFilterTab === 'all') return true
    if (activityFilterTab === 'daily') return t.recurrenceType === 'daily'
    if (activityFilterTab === 'weekly') return t.recurrenceType === 'weekly'
    if (activityFilterTab === 'monthly') return t.recurrenceType === 'monthly'
    if (activityFilterTab === 'yearly_other') {
      return ['yearly', 'custom', 'milestone', 'one_time'].includes(t.recurrenceType)
    }
    return true
  })

  if (!isOpen) return null

  // Format date header
  const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('default', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Open Log creation/editing builder
  const handleOpenLogger = (template: ActivityTemplate, existingLog?: ActivityLog) => {
    setEditingTemplateId(template.id)
    
    const isWorkout = template.category === 'fitness' || template.name.toLowerCase().includes('workout') || template.name.toLowerCase().includes('training') || template.icon === 'Dumbbell'
    const isRunningLog = template.name.toLowerCase().includes('run')
    const isMeasurementLog = template.name.toLowerCase().includes('measurement')

    if (existingLog) {
      setEditingLogId(existingLog.id)
      setLogStatus(existingLog.status)
      setLogNote(existingLog.note || '')
      setLogAmount(existingLog.amount !== null ? String(existingLog.amount) : '')
      
      if (isWorkout) {
        const wp = existingLog.payload as WorkoutPayload | null
        setWorkoutExercises(wp?.exercises || [])
        setWorkoutEnergy(wp?.energy || 'Medium')
      } else {
        setWorkoutExercises([])
        setWorkoutEnergy('Medium')
      }

      if (isRunningLog) {
        const rp = existingLog.payload as RunningPayload | null
        setRunDistance(rp?.distance !== undefined && rp?.distance !== null ? String(rp.distance) : '')
        setRunDuration(rp?.duration !== undefined && rp?.duration !== null ? String(rp.duration) : '')
        setRunEnergy(rp?.energy || 'Medium')
      } else {
        setRunDistance('')
        setRunDuration('')
        setRunEnergy('Medium')
      }

      if (isMeasurementLog) {
        const mp = existingLog.payload as MeasurementsPayload | null
        setMeasWeight(mp?.weight !== undefined && mp?.weight !== null ? String(mp.weight) : '')
        setMeasWaist(mp?.waist !== undefined && mp?.waist !== null ? String(mp.waist) : '')
        setMeasChest(mp?.chest !== undefined && mp?.chest !== null ? String(mp.chest) : '')
        setMeasArms(mp?.arms !== undefined && mp?.arms !== null ? String(mp.arms) : '')
      } else {
        setMeasWeight('')
        setMeasWaist('')
        setMeasChest('')
        setMeasArms('')
      }
    } else {
      setEditingLogId(null)
      const defaultStatus = template.category === 'finance' ? 'paid' : 'done'
      setLogStatus(defaultStatus)
      setLogNote('')
      setLogAmount(template.amount !== null ? String(template.amount) : '')
      
      setWorkoutEnergy('Medium')
      setRunDistance('')
      setRunDuration('')
      setRunEnergy('Medium')
      setMeasWeight('')
      setMeasWaist('')
      setMeasChest('')
      setMeasArms('')

      if (isWorkout) {
        setWorkoutExercises([{ name: '', sets: [{ reps: 10 }] }])
      } else {
        setWorkoutExercises([])
      }
    }
  }

  const handleSaveLog = async () => {
    if (!editingTemplateId) return
    setIsSavingLog(true)

    const template = templates.find(t => t.id === editingTemplateId)
    const isWorkout = template ? (template.category === 'fitness' || template.name.toLowerCase().includes('workout') || template.name.toLowerCase().includes('training') || template.icon === 'Dumbbell') : false
    const isRunningLog = template ? template.name.toLowerCase().includes('run') : false
    const isMeasurementLog = template ? template.name.toLowerCase().includes('measurement') : false

    const parsedAmount = logAmount.trim() !== '' ? parseFloat(logAmount) : null
    
    let payload = null
    if (isWorkout) {
      payload = {
        exercises: workoutExercises.filter(ex => ex.name.trim() !== ''),
        energy: workoutEnergy,
      }
    } else if (isRunningLog) {
      payload = {
        distance: runDistance.trim() !== '' ? parseFloat(runDistance) : null,
        duration: runDuration.trim() !== '' ? parseInt(runDuration) : null,
        energy: runEnergy,
      }
    } else if (isMeasurementLog) {
      payload = {
        weight: measWeight.trim() !== '' ? parseFloat(measWeight) : null,
        waist: measWaist.trim() !== '' ? parseFloat(measWaist) : null,
        chest: measChest.trim() !== '' ? parseFloat(measChest) : null,
        arms: measArms.trim() !== '' ? parseFloat(measArms) : null,
      }
    }

    const data = {
      activityId: editingTemplateId,
      date: dateStr,
      status: logStatus,
      note: logNote.trim() || null,
      amount: parsedAmount,
      payload,
    }

    if (editingLogId) {
      await updateLog(editingLogId, data)
    } else {
      await createLog(data)
    }

    setIsSavingLog(false)
    setEditingTemplateId(null)
    setEditingLogId(null)
    router.refresh()
  }

  const handleDeleteLog = async (logId: string) => {
    if (confirm('Delete this completion log?')) {
      await deleteLog(logId)
      if (editingLogId === logId) {
        setEditingTemplateId(null)
        setEditingLogId(null)
      }
      router.refresh()
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800'
      case 'paid':
      case 'renewed':
        return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
      case 'skipped':
        return 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-705'
      case 'reminder':
        return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-350 dark:border-yellow-800'
      default:
        return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
    }
  }

  return (
    <div className="fixed inset-0 z-40 overflow-hidden flex justify-end">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Drawer content panel sliding from right */}
      <div className="relative w-[90vw] max-w-2xl bg-[var(--color-bg-surface)] border-l border-[var(--color-border)] dark:border-zinc-850 h-full flex flex-col shadow-2xl z-50 animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] dark:border-zinc-855 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--color-text-muted)]">Day Planner</h3>
            <p className="text-xs font-bold text-[var(--color-text-main)] mt-0.5">{formattedDate}</p>
          </div>
          <Button 
            variant="ghost"
            size="sm"
            onClick={onClose}
            icon={<X size={16} />}
          />
        </div>

        {/* Tabs */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-955/20 flex justify-center shrink-0">
          <div className="flex bg-slate-100 dark:bg-zinc-900/60 p-0.5 rounded-[9px] shadow-inner w-full max-w-xs">
            <button
              onClick={() => setActiveTab('activities')}
              className={`flex-1 py-1 text-center font-bold rounded-md transition-all duration-205 flex justify-center items-center gap-1.5 text-xs cursor-pointer ${
                activeTab === 'activities'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-extrabold'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
              }`}
            >
              <Sparkles size={14} />
              Activities ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex-1 py-1 text-center font-bold rounded-md transition-all duration-200 flex justify-center items-center gap-1.5 text-xs cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-extrabold'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
              }`}
            >
              <BookOpen size={14} />
              Journal
              {note && <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400" />}
            </button>
          </div>
        </div>

        {/* Scrollable contents container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          
          <MarathiCalendarEvents dateStr={dateStr} />

          {/* Tab Contents */}
          <div className="mt-3">
            {activeTab === 'activities' && (
              <div className="space-y-6">
                {/* If builder is open */}
                {editingTemplateId && (
                  <div className="p-5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <Icon
                          name={templates.find(t => t.id === editingTemplateId)?.icon || 'CheckSquare'}
                          className="text-slate-450 dark:text-zinc-405"
                          size={18}
                        />
                        Log {templates.find(t => t.id === editingTemplateId)?.name}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTemplateId(null)
                          setEditingLogId(null)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>

                    {/* Log Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Select
                          label="Status"
                          value={logStatus}
                          onChange={e => setLogStatus(e.target.value)}
                          options={[
                            { value: 'done', label: 'Done / Completed' },
                            { value: 'paid', label: 'Paid' },
                            { value: 'renewed', label: 'Renewed' },
                            { value: 'skipped', label: 'Skipped' },
                            { value: 'reminder', label: 'Reminder' },
                            { value: 'custom', label: 'Custom' }
                          ]}
                        />
                      </div>

                      <div>
                        <Input
                          label="Amount (Optional)"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={logAmount}
                          onChange={e => setLogAmount(e.target.value)}
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <Input
                          label="Log Note"
                          type="text"
                          placeholder="e.g. Done in morning, feeling fine"
                          value={logNote}
                          onChange={e => setLogNote(e.target.value)}
                          className="sm:col-span-3"
                        />
                      </div>
                    </div>

                    <RunningLogger
                      distance={runDistance}
                      setDistance={setRunDistance}
                      duration={runDuration}
                      setDuration={setRunDuration}
                      energy={runEnergy}
                      setEnergy={setRunEnergy}
                    />

                    <MeasurementsLogger
                      weight={measWeight}
                      setWeight={setMeasWeight}
                      waist={measWaist}
                      setWaist={setMeasWaist}
                      chest={measChest}
                      setChest={setMeasChest}
                      arms={measArms}
                      setArms={setMeasArms}
                    />

                    {workoutExercises.length > 0 && (
                      <WorkoutLogger
                        exercises={workoutExercises}
                        setExercises={setWorkoutExercises}
                        energy={workoutEnergy}
                        setEnergy={setWorkoutEnergy}
                      />
                    )}

                    <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-zinc-800 pt-3">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isSavingLog}
                        onClick={handleSaveLog}
                        loading={isSavingLog}
                      >
                        {editingLogId ? 'Update' : 'Save'} Log
                      </Button>
                    </div>
                  </div>
                )}

                {/* Timeline Tasks List for that day */}
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 dark:text-zinc-550">
                    Timeline Tasks ({orderedItemsForDate.length})
                  </div>

                  {orderedItemsForDate.length === 0 ? (
                    <div className="p-6 bg-slate-50 dark:bg-zinc-950/40 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-center text-slate-400 dark:text-zinc-500 text-xs italic animate-in fade-in duration-200">
                      No tasks scheduled or logged for this day.
                    </div>
                  ) : (
                    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]/40 overflow-hidden shadow-xs">
                      {orderedItemsForDate.map(o => renderTimelineItemCard(o))}
                    </div>
                  )}
                </div>

                {/* Premium Activity Selector */}
                {!editingTemplateId && (
                  <div className="bg-slate-50/50 dark:bg-zinc-955/60 p-4 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                        Log Activity for This Day
                      </div>
                      {/* Search Input */}
                      <div className="relative max-w-xs w-full">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search templates..."
                          value={activitySearch}
                          onChange={e => setActivitySearch(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700"
                        />
                      </div>
                    </div>

                    {/* Tabs */}
                    {activitySearch.trim() === '' && (
                      <div className="flex bg-slate-100 dark:bg-zinc-900/50 p-0.5 rounded-[9px] shadow-inner text-[10px]">
                        {(
                          [
                            { key: 'all', label: 'All' },
                            { key: 'daily', label: 'Daily' },
                            { key: 'weekly', label: 'Weekly' },
                            { key: 'monthly', label: 'Monthly' },
                            { key: 'yearly_other', label: 'Yearly/Other' },
                          ] as const
                        ).map(tab => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActivityFilterTab(tab.key)}
                            className={`flex-1 py-1 text-center font-bold rounded-md transition-all duration-200 cursor-pointer ${
                              activityFilterTab === tab.key
                                ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                                : 'text-slate-500 dark:text-zinc-550 hover:text-slate-700 dark:hover:text-zinc-300'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Activity Grid */}
                    {filteredTemplates.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 dark:text-zinc-650 italic">
                        No activities match your criteria.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                        {filteredTemplates.map(t => {
                          const colorClasses = getTemplateColorClasses(t.color)
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleOpenLogger(t)}
                              className="flex items-center gap-2.5 p-2.5 bg-white hover:bg-slate-100/50 dark:bg-zinc-900 dark:hover:bg-zinc-850/60 border border-slate-200 dark:border-zinc-800 rounded-xl transition-all cursor-pointer text-left hover:-translate-y-0.5 hover:shadow-xs group"
                            >
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center border group-hover:scale-105 transition-all ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
                              >
                                <Icon name={t.icon} size={14} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-slate-850 dark:text-zinc-200 truncate group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
                                  {t.name}
                                </div>
                                <div className="text-[9px] text-slate-400 dark:text-zinc-500 font-medium capitalize truncate">
                                  {t.recurrenceType}
                                </div>
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

            {activeTab === 'notes' && (
              <div className="space-y-4">
                {note ? (
                  <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-5 rounded-xl space-y-3 shadow-xs">
                    <div className="border-b border-slate-200 dark:border-zinc-900 pb-3">
                      <h3 className="font-semibold text-slate-900 dark:text-white text-base">Journal Entry</h3>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Written on this day</p>
                    </div>
                    <div
                      className="text-slate-800 dark:text-zinc-300 text-sm leading-relaxed prose dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: note.content }}
                    />
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-[var(--color-text-muted)] italic">
                    No journal entry for this day.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
