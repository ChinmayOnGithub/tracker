"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Note, WorkoutExercise, WorkoutSet, WorkoutPayload, RunningPayload, MeasurementsPayload } from '@/types'
import { createLog, updateLog, deleteLog } from '@/app/actions/log'
import { createNote, updateNote, deleteNote } from '@/app/actions/note'
import { Icon } from './Icon'
import { X, Plus, Trash2, Edit2, Sparkles, BookOpen, Search } from 'lucide-react'
import { getEventsForDate } from '@/lib/marathiCalendar'
import { getTemplateColorClasses } from '@/lib/colors'

interface DayLogsModalProps {
  isOpen: boolean
  onClose: () => void
  dateStr: string // YYYY-MM-DD
  templates: ActivityTemplate[]
  logs: ActivityLog[] // All logs for this specific date
  note: Note | null // Standalone note for this date
}

export const DayLogsModal: React.FC<DayLogsModalProps> = ({
  isOpen,
  onClose,
  dateStr,
  templates,
  logs,
  note,
}) => {
  // Tabs: 'activities' or 'notes'
  const [activeTab, setActiveTab] = useState<'activities' | 'notes'>('activities')
  
  // Note state - initialized directly from props
  const [noteTitle, setNoteTitle] = useState(note?.title || '')
  const [noteContent, setNoteContent] = useState(note?.content || '')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isEditingNote, setIsEditingNote] = useState(!note)

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

  // Group logs by activity template ID
  const logsMap = new Map<string, ActivityLog[]>()
  logs.forEach(log => {
    const list = logsMap.get(log.activityId) || []
    list.push(log)
    logsMap.set(log.activityId, list)
  })

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return
    setIsSavingNote(true)
    if (note) {
      await updateNote(note.id, noteContent.trim(), noteTitle.trim() || null)
      setIsEditingNote(false)
    } else {
      await createNote(dateStr, noteContent.trim(), noteTitle.trim() || null)
      setIsEditingNote(false)
    }
    setIsSavingNote(false)
  }

  const handleDeleteNote = async () => {
    if (!note) return
    if (confirm('Are you sure you want to delete this note?')) {
      setIsSavingNote(true)
      await deleteNote(note.id)
      setNoteTitle('')
      setNoteContent('')
      setIsEditingNote(true)
      setIsSavingNote(false)
    }
  }

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
      // Infer status
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

      // If workout, initialize empty exercise
      if (isWorkout) {
        setWorkoutExercises([{ name: '', sets: [{ reps: 10 }] }])
      } else {
        setWorkoutExercises([])
      }
    }
  }

  const handleAddExercise = () => {
    setWorkoutExercises(prev => [...prev, { name: '', sets: [{ reps: 10 }] }])
  }

  const handleRemoveExercise = (idx: number) => {
    setWorkoutExercises(prev => prev.filter((_, i) => i !== idx))
  }

  const handleExerciseNameChange = (idx: number, name: string) => {
    setWorkoutExercises(prev =>
      prev.map((ex, i) => (i === idx ? { ...ex, name } : ex))
    )
  }

  const handleAddSet = (exerciseIdx: number) => {
    setWorkoutExercises(prev =>
      prev.map((ex, i) => {
        if (i === exerciseIdx) {
          const lastSet = ex.sets[ex.sets.length - 1]
          const newSet = lastSet ? { ...lastSet } : { reps: 10 }
          return { ...ex, sets: [...ex.sets, newSet] }
        }
        return ex
      })
    )
  }

  const handleRemoveSet = (exerciseIdx: number, setIdx: number) => {
    setWorkoutExercises(prev =>
      prev.map((ex, i) => {
        if (i === exerciseIdx) {
          return { ...ex, sets: ex.sets.filter((_, s) => s !== setIdx) }
        }
        return ex
      })
    )
  }

  const handleSetChange = (exerciseIdx: number, setIdx: number, field: keyof WorkoutSet, val: string | number | undefined) => {
    setWorkoutExercises(prev =>
      prev.map((ex, i) => {
        if (i === exerciseIdx) {
          return {
            ...ex,
            sets: ex.sets.map((set, s) => {
              if (s === setIdx) {
                return { ...set, [field]: val }
              }
              return set
            }),
          }
        }
        return ex
      })
    )
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
  }

  const handleDeleteLog = async (logId: string) => {
    if (confirm('Delete this completion log?')) {
      await deleteLog(logId)
      if (editingLogId === logId) {
        setEditingTemplateId(null)
        setEditingLogId(null)
      }
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
        return 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700'
      case 'reminder':
        return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800'
      default:
        return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{formattedDate}</h2>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Edit log history and write standalone notes</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Panchang Alerts banner */}
        {(() => {
          const events = getEventsForDate(dateStr)
          if (events.length === 0) return null
          return (
            <div className="mx-6 mt-4 p-3 bg-orange-500/10 border border-orange-500/30 text-orange-655 dark:text-orange-400 rounded-xl flex items-center gap-2 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span>Marathi Calendar: {events.map(e => e.title).join(', ')}</span>
            </div>
          )
        })()}

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
          <button
            onClick={() => setActiveTab('activities')}
            className={`flex-1 py-3 text-center font-semibold transition-colors flex justify-center items-center gap-1.5 border-b-2 text-sm cursor-pointer ${
              activeTab === 'activities'
                ? 'text-slate-900 dark:text-white border-slate-900 dark:border-white'
                : 'text-slate-400 border-transparent hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'
            }`}
          >
            <Sparkles size={16} />
            Activities ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-3 text-center font-semibold transition-colors flex justify-center items-center gap-1.5 border-b-2 text-sm cursor-pointer ${
              activeTab === 'notes'
                ? 'text-slate-900 dark:text-white border-slate-900 dark:border-white'
                : 'text-slate-400 border-transparent hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'
            }`}
          >
            <BookOpen size={16} />
            Daily Note
            {note && <span className="ml-1.5 w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'activities' && (
            <div className="space-y-6">
              {/* If builder is open */}
              {editingTemplateId && (
                <div className="p-5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <Icon
                        name={templates.find(t => t.id === editingTemplateId)?.icon || 'CheckSquare'}
                        className="text-slate-450 dark:text-zinc-400"
                        size={18}
                      />
                      Log {templates.find(t => t.id === editingTemplateId)?.name}
                    </h3>
                    <button
                      onClick={() => {
                        setEditingTemplateId(null)
                        setEditingLogId(null)
                      }}
                      className="text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Log Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Status</label>
                      <select
                        value={logStatus}
                        onChange={e => setLogStatus(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-350 dark:focus:border-zinc-700 cursor-pointer"
                      >
                        <option value="done">Done / Completed</option>
                        <option value="paid">Paid</option>
                        <option value="renewed">Renewed</option>
                        <option value="skipped">Skipped</option>
                        <option value="reminder">Reminder</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Amount (Optional)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={logAmount}
                        onChange={e => setLogAmount(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Log Note</label>
                      <input
                        type="text"
                        placeholder="e.g. Done in morning, feeling fine"
                        value={logNote}
                        onChange={e => setLogNote(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                      />
                    </div>
                  </div>

                  {/* Running Log Details Form */}
                  {(() => {
                    const template = templates.find(t => t.id === editingTemplateId)
                    const isRunningLog = template ? template.name.toLowerCase().includes('run') : false
                    if (!isRunningLog) return null
                    return (
                      <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
                        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Running Details</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Distance (km)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="e.g. 5.2"
                              value={runDistance}
                              onChange={e => setRunDistance(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Duration (minutes)</label>
                            <input
                              type="number"
                              placeholder="e.g. 30"
                              value={runDuration}
                              onChange={e => setRunDuration(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Energy / Feeling</label>
                            <select
                              value={runEnergy}
                              onChange={e => setRunEnergy(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-350 dark:focus:border-zinc-700 cursor-pointer"
                            >
                              <option value="High">⚡ High</option>
                              <option value="Medium">⚡ Medium</option>
                              <option value="Low">⚡ Low</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Weekly Measurements Details Form */}
                  {(() => {
                    const template = templates.find(t => t.id === editingTemplateId)
                    const isMeasurementLog = template ? template.name.toLowerCase().includes('measurement') : false
                    if (!isMeasurementLog) return null
                    return (
                      <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
                        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Weekly Body Measurements</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Weight (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g. 74.5"
                              value={measWeight}
                              onChange={e => setMeasWeight(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Waist (inches)</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g. 32.5"
                              value={measWaist}
                              onChange={e => setMeasWaist(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Chest (inches)</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g. 40.0"
                              value={measChest}
                              onChange={e => setMeasChest(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Arms (inches)</label>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="e.g. 14.5"
                              value={measArms}
                              onChange={e => setMeasArms(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Workout Exercises Builder */}
                  {workoutExercises.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
                      
                      {/* Energy Selector for Workout */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2">
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Energy / Feeling</label>
                          <select
                            value={workoutEnergy}
                            onChange={e => setWorkoutEnergy(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 cursor-pointer"
                          >
                            <option value="High">⚡ High</option>
                            <option value="Medium">⚡ Medium</option>
                            <option value="Low">⚡ Low</option>
                          </select>
                        </div>
                      </div>

                      {/* Quick Presets Bar */}
                      <div className="space-y-1">
                        <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500">Quick Bodyweight & Cardio Presets</span>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[
                            'Pushups', 'Squats', 'Plank', 'Suryanamaskar', 'Pullups', 'Burpees', 'Dips',
                            'Walking', 'Running', 'Cycling', 'Stretching', 'Mobility', 'Yoga', 'Core Work'
                          ].map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setWorkoutExercises(prev => {
                                  if (prev.length === 1 && prev[0].name.trim() === '') {
                                    return [{ name: preset, sets: [{ reps: 10 }] }]
                                  }
                                  return [...prev, { name: preset, sets: [{ reps: 10 }] }]
                                })
                              }}
                              className="px-2 py-0.5 rounded bg-slate-200/65 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-705 text-slate-705 dark:text-zinc-350 text-[10px] font-semibold transition-all cursor-pointer"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400">Workout Exercises</label>
                        <button
                          type="button"
                          onClick={handleAddExercise}
                          className="text-xs text-slate-650 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <Plus size={12} /> Add Exercise
                        </button>
                      </div>

                      <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                        {workoutExercises.map((ex, exIdx) => (
                          <div key={exIdx} className="bg-slate-100/40 dark:bg-zinc-900/60 p-3 rounded-lg border border-slate-200 dark:border-zinc-800/80 relative space-y-3">
                            <button
                              type="button"
                              onClick={() => handleRemoveExercise(exIdx)}
                              className="absolute top-2 right-2 text-slate-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
                              <div>
                                <input
                                  type="text"
                                  placeholder="Exercise Name (e.g. Bench Press)"
                                  value={ex.name}
                                  onChange={e => handleExerciseNameChange(exIdx, e.target.value)}
                                  className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden"
                                />
                              </div>
                              <div>
                                <input
                                  type="text"
                                  placeholder="Exercise Note (optional)"
                                  value={ex.note || ''}
                                  onChange={e =>
                                    setWorkoutExercises(prev =>
                                      prev.map((item, idx) => (idx === exIdx ? { ...item, note: e.target.value } : item))
                                    )
                                  }
                                  className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden"
                                />
                              </div>
                            </div>

                            {/* Sets list */}
                            <div className="space-y-1.5 pl-2">
                              {ex.sets.map((set, setIdx) => (
                                <div key={setIdx} className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-400 dark:text-zinc-500 font-mono w-10">Set {setIdx + 1}:</span>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      placeholder="Reps"
                                      value={set.reps}
                                      onChange={e =>
                                        handleSetChange(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)
                                      }
                                      className="w-16 bg-white dark:bg-zinc-955 border border-slate-200 dark:border-zinc-800 rounded px-1.5 py-0.5 text-center text-slate-900 dark:text-white"
                                    />
                                    <span className="text-slate-400 dark:text-zinc-650">reps</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      placeholder="Weight"
                                      value={set.weight !== undefined ? set.weight : ''}
                                      onChange={e =>
                                        handleSetChange(
                                          exIdx,
                                          setIdx,
                                          'weight',
                                          e.target.value !== '' ? parseFloat(e.target.value) : undefined
                                        )
                                      }
                                      className="w-16 bg-white dark:bg-zinc-955 border border-slate-200 dark:border-zinc-800 rounded px-1.5 py-0.5 text-center text-slate-900 dark:text-white"
                                    />
                                    <span className="text-slate-400 dark:text-zinc-600 font-semibold">kg</span>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Set Note"
                                    value={set.note || ''}
                                    onChange={e => handleSetChange(exIdx, setIdx, 'note', e.target.value)}
                                    className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded px-2 py-0.5 text-slate-900 dark:text-white placeholder-slate-350 dark:placeholder-zinc-700"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSet(exIdx, setIdx)}
                                    className="text-slate-400 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 cursor-pointer"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => handleAddSet(exIdx)}
                                className="text-[10px] text-slate-500 hover:text-slate-950 dark:text-zinc-400 dark:hover:text-white mt-1 font-semibold cursor-pointer"
                              >
                                + Add Set
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-zinc-800 pt-3">
                    <button
                      type="button"
                      disabled={isSavingLog}
                      onClick={handleSaveLog}
                      className="bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {isSavingLog ? 'Saving...' : 'Save Log'}
                    </button>
                  </div>
                </div>
              )}              {/* Logged Activities List */}
              <div className="space-y-4">
                <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Logged Activities ({logs.length})
                </div>

                {logs.length === 0 ? (
                  <div className="p-6 bg-slate-50 dark:bg-zinc-950/40 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-center text-slate-400 dark:text-zinc-500 text-xs italic">
                    No activities completed on this day.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map(log => {
                      const template = templates.find(t => t.id === log.activityId)
                      const color = template?.color || 'zinc'
                      const icon = template?.icon || 'CheckSquare'
                      const name = template?.name || 'Deleted Template'

                      const colorClasses = getTemplateColorClasses(color)
                      return (
                        <div
                          key={log.id}
                          className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-slate-205 dark:border-zinc-800/60 flex flex-col gap-2 relative shadow-xs"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center border ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
                              >
                                <Icon name={icon} size={16} />
                              </div>
                              <div>
                                <h4 className="font-semibold text-slate-800 dark:text-white text-sm">{name}</h4>
                                <div className="flex flex-wrap gap-2 items-center mt-0.5">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getStatusColor(log.status)}`}>
                                    {log.status}
                                  </span>
                                  {log.amount !== null && (
                                    <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold font-mono">
                                      ₹{log.amount.toFixed(2)}
                                    </span>
                                  )}
                                  {log.note && (
                                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 italic">
                                      &ldquo;{log.note}&rdquo;
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleOpenLogger(template!, log)}
                                className="text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer"
                                title="Edit log details"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteLog(log.id)}
                                className="text-slate-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 cursor-pointer"
                                title="Delete completion"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Run summary */}
                          {(() => {
                            const runPayload = log.payload as RunningPayload | null
                            const hasRunData = runPayload && (runPayload.distance !== undefined || runPayload.duration !== undefined)
                            if (!hasRunData) return null
                            return (
                              <div className="pl-2 border-l border-blue-400 dark:border-blue-800/80 space-y-1 mt-1 text-xs text-slate-600 dark:text-zinc-350">
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
                          {(() => {
                            const measPayload = log.payload as MeasurementsPayload | null
                            const hasMeasData = measPayload && (measPayload.weight !== undefined || measPayload.waist !== undefined)
                            if (!hasMeasData) return null
                            return (
                              <div className="pl-2 border-l border-purple-400 dark:border-purple-800/80 space-y-1 mt-1 text-xs text-slate-600 dark:text-zinc-350">
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
                          {(() => {
                            const workoutPayload = log.payload as WorkoutPayload | null
                            return workoutPayload?.exercises && (
                              <div className="pl-2 border-l border-slate-200 dark:border-zinc-800 space-y-1.5 mt-1">
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
                    })}
                  </div>
                )}
              </div>

              {/* Premium Activity Selector with Search and Tabs */}
              {!editingTemplateId && (
                <div className="bg-slate-50/50 dark:bg-zinc-950/60 p-4 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-4">
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

                  {/* Tabs (Hidden when searching since search searches all) */}
                  {activitySearch.trim() === '' && (
                    <div className="flex flex-wrap gap-1 border-b border-slate-200/60 dark:border-zinc-900/60 pb-1 text-[11px]">
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
                          className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                            activityFilterTab === tab.key
                              ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-xs'
                              : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
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
              {isEditingNote ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Note Title (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Brainstorming session"
                      value={noteTitle}
                      onChange={e => setNoteTitle(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Content *</label>
                    <textarea
                      placeholder="Write your note here..."
                      value={noteContent}
                      onChange={e => setNoteContent(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700 h-48 resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    {note && (
                      <button
                        type="button"
                        onClick={() => setIsEditingNote(false)}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={isSavingNote || !noteContent.trim()}
                      className="bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {isSavingNote ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-5 rounded-xl space-y-4 shadow-xs">
                  <div className="flex justify-between items-start border-b border-slate-200 dark:border-zinc-900 pb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                        {note?.title || 'Daily Freeform Note'}
                      </h3>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Saved standalone note</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsEditingNote(true)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-slate-200 dark:border-zinc-850 rounded text-slate-650 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
                        title="Edit Note"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={handleDeleteNote}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-slate-200 dark:border-zinc-850 rounded text-slate-650 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-450 cursor-pointer"
                        title="Delete Note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-800 dark:text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {note?.content}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
