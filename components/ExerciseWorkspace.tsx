"use client"

import React, { useState, useEffect, useRef } from 'react'
import { ActivityTemplate, ActivityLog, RecurrenceAnalysis } from '@/types'
import { markComplete } from '@/app/actions/log'
import { Icon } from './Icon'
import { getTemplateColorClasses } from '@/lib/colors'
import {
  Dumbbell,
  Play,
  Pause,
  RotateCcw,
  Flag,
  History,
  ChevronLeft,
  Volume2,
  VolumeX,
  Check,
  CheckSquare
} from 'lucide-react'

interface AnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface ExerciseWorkspaceProps {
  analyzedTemplates: AnalyzedTemplate[]
  recentLogs: ActivityLog[]
  todayStr: string
  onClose: () => void
}

export const ExerciseWorkspace: React.FC<ExerciseWorkspaceProps> = ({
  analyzedTemplates,
  recentLogs,
  todayStr,
  onClose,
}) => {
  // ----------------------------------------------------
  // Audio Web Buzzer (No asset download needed)
  // ----------------------------------------------------
  const [soundEnabled, setSoundEnabled] = useState(true)
  const playBeep = (type: 'tick' | 'alarm') => {
    if (!soundEnabled) return
    try {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      
      if (type === 'tick') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(800, ctx.currentTime)
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
      } else if (type === 'alarm') {
        // Double pulse alarm
        [0, 0.2, 0.4].forEach((delay) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(600, ctx.currentTime + delay)
          gain.gain.setValueAtTime(0.2, ctx.currentTime + delay)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15)
          osc.start(ctx.currentTime + delay)
          osc.stop(ctx.currentTime + delay + 0.18)
        })
      }
    } catch (e) {
      console.warn('AudioContext failed:', e)
    }
  }

  // ----------------------------------------------------
  // 1. Stopwatch State
  // ----------------------------------------------------
  const [swRunning, setSwRunning] = useState(false)
  const [swTime, setSwTime] = useState(0) // in centiseconds (10ms)
  const [swLaps, setSwLaps] = useState<number[]>([])
  const swIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (swRunning) {
      const startTime = Date.now() - swTime * 10
      swIntervalRef.current = setInterval(() => {
        setSwTime(Math.floor((Date.now() - startTime) / 10))
      }, 10)
    } else {
      if (swIntervalRef.current) {
        clearInterval(swIntervalRef.current)
      }
    }
    return () => {
      if (swIntervalRef.current) clearInterval(swIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swRunning])

  const formatStopwatch = (cs: number) => {
    const min = Math.floor(cs / 6000)
    const sec = Math.floor((cs % 6000) / 100)
    const cent = cs % 100
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(min)}:${pad(sec)}.${pad(cent)}`
  }

  const handleSwStartPause = () => {
    setSwRunning(!swRunning)
  }

  const handleSwReset = () => {
    setSwRunning(false)
    setSwTime(0)
    setSwLaps([])
  }

  const handleSwLap = () => {
    setSwLaps(prev => [swTime, ...prev])
  }

  // ----------------------------------------------------
  // 2. Rest Timer State
  // ----------------------------------------------------
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerDuration, setTimerDuration] = useState(60) // initial total time in seconds
  const [timerLeft, setTimerLeft] = useState(60) // remaining seconds
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (timerRunning && timerLeft > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerLeft((prev) => {
          if (prev <= 1) {
            setTimerRunning(false)
            playBeep('alarm')
            return 0
          }
          // Tick sound at 3s, 2s, 1s
          if (prev <= 4) {
            playBeep('tick')
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, timerLeft])

  const startTimer = (seconds: number) => {
    setTimerDuration(seconds)
    setTimerLeft(seconds)
    setTimerRunning(true)
  }

  const handleTimerStartPause = () => {
    setTimerRunning(!timerRunning)
  }

  const handleTimerReset = () => {
    setTimerRunning(false)
    setTimerLeft(timerDuration)
  }

  const add30Seconds = () => {
    setTimerLeft(prev => prev + 30)
    setTimerDuration(prev => prev + 30)
  }

  // ----------------------------------------------------
  // 3. Calendar & Logging Integration
  // ----------------------------------------------------
  // Filter for templates that are related to exercise/fitness
  const fitnessTemplates = analyzedTemplates.filter(
    ({ template }) =>
      template.category === 'fitness' ||
      template.name.toLowerCase().includes('workout') ||
      template.name.toLowerCase().includes('gym') ||
      template.name.toLowerCase().includes('exercise') ||
      template.name.toLowerCase().includes('run') ||
      template.icon === 'Dumbbell'
  )

  // Track weight/reps/sets form state for each template
  const [sets, setSets] = useState<Record<string, string>>({})
  const [reps, setReps] = useState<Record<string, string>>({})
  const [weight, setWeight] = useState<Record<string, string>>({})
  const [customNote, setCustomNote] = useState<Record<string, string>>({})
  const [loggingId, setLoggingId] = useState<string | null>(null)

  const handleLogExercise = async (templateId: string) => {
    setLoggingId(templateId)
    
    // Construct custom workout note from form
    const tSets = sets[templateId] || ''
    const tReps = reps[templateId] || ''
    const tWeight = weight[templateId] || ''
    const tNote = customNote[templateId] || ''

    let finalNote = ''
    if (tSets || tReps || tWeight) {
      const parts = []
      if (tSets) parts.push(`${tSets} sets`)
      if (tReps) parts.push(`${tReps} reps`)
      if (tWeight) parts.push(`${tWeight}kg`)
      finalNote = `[${parts.join(' x ')}]`
    }
    if (tNote) {
      finalNote = finalNote ? `${finalNote} ${tNote}` : tNote
    }

    try {
      await markComplete(templateId, todayStr, 'done', null, finalNote || null)
      // Reset form
      setSets(prev => ({ ...prev, [templateId]: '' }))
      setReps(prev => ({ ...prev, [templateId]: '' }))
      setWeight(prev => ({ ...prev, [templateId]: '' }))
      setCustomNote(prev => ({ ...prev, [templateId]: '' }))
    } catch (e) {
      console.error(e)
    } finally {
      setLoggingId(null)
    }
  }

  // Filter logs for fitness activities today
  const fitnessLogsToday = recentLogs.filter(
    log => log.date === todayStr && fitnessTemplates.some(t => t.template.id === log.activityId)
  )

  // Math for circular progress bar
  const progressPercent = timerDuration > 0 ? (timerLeft / timerDuration) * 100 : 0
  const strokeDashoffset = 345.5 - (345.5 * progressPercent) / 100

  return (
    <div className="space-y-6">
      
      {/* Premium Header bar */}
      <div className="flex items-center justify-between bg-white/95 dark:bg-zinc-900/70 backdrop-blur-lg border border-slate-200/80 dark:border-zinc-800/80 p-4 rounded-3xl shadow-lg">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-all cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-zinc-750"
            title="Back to Dashboard"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 flex items-center justify-center">
              <Dumbbell className="animate-bounce-slow" size={16} />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">Exercise Workspace</h1>
              <p className="text-[9px] text-slate-400 dark:text-zinc-500 font-extrabold uppercase tracking-widest mt-0.5">Control Center & Quick Logging</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
            soundEnabled 
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400 shadow-3xs' 
              : 'bg-slate-100/50 dark:bg-zinc-900/40 text-slate-400 border-slate-200 dark:border-zinc-800'
          }`}
          title={soundEnabled ? 'Mute alarm beep' : 'Enable alarm beep'}
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      </div>

      {/* Grid of Stopwatch and Rest Timer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* SECTION 1: STOPWATCH */}
        <div className="bg-white/95 dark:bg-zinc-900/65 backdrop-blur-lg border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h2 className="text-[10px] font-black text-slate-450 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              High-Precision Stopwatch
            </h2>
            <div className="text-center py-6 bg-slate-50 dark:bg-zinc-950/60 border border-slate-150 dark:border-zinc-850 rounded-2xl shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 bg-radial-gradient from-blue-500/5 to-transparent pointer-events-none" />
              <div className="text-5xl md:text-6xl font-black font-mono tracking-tight text-slate-800 dark:text-white select-all">
                {formatStopwatch(swTime)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Stopwatch controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSwStartPause}
                className={`flex-1 py-3 px-4 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                  swRunning
                    ? 'bg-red-500 hover:bg-red-650 text-white'
                    : 'bg-blue-500 hover:bg-blue-650 text-white'
                }`}
              >
                {swRunning ? <Pause size={13} /> : <Play size={13} />}
                {swRunning ? 'Pause' : 'Start'}
              </button>

              {swRunning && (
                <button
                  onClick={handleSwLap}
                  className="py-3 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-850 text-slate-700 dark:text-zinc-350 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Flag size={13} /> Lap
                </button>
              )}

              <button
                onClick={handleSwReset}
                disabled={swTime === 0}
                className="p-3.5 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-850 text-slate-500 dark:text-zinc-400 rounded-xl transition-all disabled:opacity-30 cursor-pointer shadow-3xs"
                title="Reset stopwatch"
              >
                <RotateCcw size={14} />
              </button>
            </div>

            {/* Laps list */}
            {swLaps.length > 0 && (
              <div className="border border-slate-150 dark:border-zinc-850 rounded-2xl p-4 max-h-40 overflow-y-auto space-y-2 divide-y divide-slate-100/50 dark:divide-zinc-850/50">
                {swLaps.map((lapTime, idx) => {
                  const currentLap = swLaps[idx]
                  const nextLap = swLaps[idx + 1] || 0
                  const diff = currentLap - nextLap
                  return (
                    <div key={idx} className="flex justify-between items-center text-xs font-mono py-2 first:pt-0">
                      <span className="text-slate-400 dark:text-zinc-500 font-bold">Lap {swLaps.length - idx}</span>
                      <span className="text-slate-800 dark:text-zinc-200 font-semibold">{formatStopwatch(lapTime)}</span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">+{formatStopwatch(diff)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: REST TIMER */}
        <div className="bg-white/95 dark:bg-zinc-900/65 backdrop-blur-lg border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h2 className="text-[10px] font-black text-slate-450 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Active Rest Timer
            </h2>
            
            <div className="flex flex-col items-center py-2">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="absolute w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="55"
                    className="stroke-slate-100 dark:stroke-zinc-850/60"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="55"
                    className="stroke-blue-500 dark:stroke-blue-450 transition-all duration-300"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray="345.5"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>
                
                <div className="text-center z-10">
                  <div className="text-3xl font-black font-mono tracking-tight text-slate-800 dark:text-white">
                    {Math.floor(timerLeft / 60)}:{(timerLeft % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="text-[9px] text-slate-450 dark:text-zinc-500 uppercase font-black tracking-widest mt-1">
                    Resting
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Quick Preset Buttons */}
            <div className="grid grid-cols-5 gap-2">
              {[30, 45, 60, 90, 120].map((sec) => (
                <button
                  key={sec}
                  onClick={() => startTimer(sec)}
                  className={`py-2 rounded-xl border text-[10px] font-black font-mono transition-all cursor-pointer text-center ${
                    timerDuration === sec && timerRunning
                      ? 'bg-indigo-550 border-indigo-405 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-slate-200 dark:border-zinc-850 text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleTimerStartPause}
                disabled={timerLeft <= 0}
                className={`flex-1 py-3 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
                  timerRunning
                    ? 'bg-yellow-500 hover:bg-yellow-650 text-white'
                    : 'bg-indigo-550 hover:bg-indigo-650 text-white'
                } disabled:opacity-40`}
              >
                {timerRunning ? <Pause size={13} /> : <Play size={13} />}
                {timerRunning ? 'Pause' : 'Resume'}
              </button>

              <button
                onClick={add30Seconds}
                className="py-3 px-4 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-850 text-slate-700 dark:text-zinc-300 rounded-xl font-extrabold text-[10px] transition-all cursor-pointer shadow-3xs"
              >
                +30s
              </button>

              <button
                onClick={handleTimerReset}
                className="p-3.5 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-850 text-slate-500 dark:text-zinc-400 rounded-xl transition-all cursor-pointer shadow-3xs"
                title="Reset timer"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 3: EXERCISE LOGGING & INTEGRATION */}
      <div className="bg-white/95 dark:bg-zinc-900/65 backdrop-blur-lg border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-105 dark:border-zinc-800/80 pb-3">
          <h2 className="text-xs font-black text-slate-450 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-2">
            <CheckSquare className="text-blue-500 dark:text-blue-400" size={14} /> Daily Fitness Tracker
          </h2>
          <span className="text-[9px] text-slate-450 dark:text-zinc-550 font-mono font-bold bg-slate-50 dark:bg-zinc-950 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-zinc-850 uppercase tracking-wider">
            {todayStr}
          </span>
        </div>

        {fitnessTemplates.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500 italic">
            No active fitness templates found. Mark templates with the &quot;fitness&quot; category to view them here.
          </div>
        ) : (
          <div className="space-y-4">
            {fitnessTemplates.map(({ template, analysis }) => {
              const colorClasses = getTemplateColorClasses(template.color)
              const isCompletedToday = analysis.lastCompletedDate === todayStr
              
              return (
                <div 
                  key={template.id} 
                  className={`p-4 rounded-2xl border transition-all duration-200 ${
                    isCompletedToday 
                      ? 'bg-slate-55/40 dark:bg-zinc-900/20 border-slate-150 dark:border-zinc-850 opacity-60' 
                      : 'bg-slate-50/20 dark:bg-zinc-950/40 border-slate-200/70 dark:border-zinc-850 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-3xs ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}>
                        <Icon name={template.icon} size={15} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 dark:text-zinc-200 text-xs sm:text-sm">
                          {template.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-extrabold text-slate-400 dark:text-zinc-550 mt-0.5 uppercase tracking-wider">
                          <span>{template.recurrenceType}</span>
                          {analysis.streak > 0 && (
                            <span className="text-orange-500 font-mono flex items-center gap-0.5">
                              • Streak: {analysis.streak}🔥
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isCompletedToday ? (
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-green-500 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
                        <Check size={11} /> Completed
                      </span>
                    ) : (
                      <button
                        onClick={() => handleLogExercise(template.id)}
                        disabled={loggingId !== null}
                        className="py-2 px-4 bg-blue-500 hover:bg-blue-650 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-55 shadow-sm transition-all"
                      >
                        {loggingId === template.id ? 'Saving...' : 'Log Exercise'}
                      </button>
                    )}
                  </div>

                  {/* Workout set inputs (Only if not logged today) */}
                  {!isCompletedToday && (
                    <div className="mt-4 pt-4 border-t border-dashed border-slate-200 dark:border-zinc-800 grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Sets</label>
                        <input
                          type="number"
                          placeholder="e.g. 3"
                          value={sets[template.id] || ''}
                          onChange={(e) => setSets(prev => ({ ...prev, [template.id]: e.target.value }))}
                          className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold transition-all text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Reps</label>
                        <input
                          type="number"
                          placeholder="e.g. 12"
                          value={reps[template.id] || ''}
                          onChange={(e) => setReps(prev => ({ ...prev, [template.id]: e.target.value }))}
                          className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold transition-all text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Weight (kg)</label>
                        <input
                          type="number"
                          placeholder="e.g. 60"
                          value={weight[template.id] || ''}
                          onChange={(e) => setWeight(prev => ({ ...prev, [template.id]: e.target.value }))}
                          className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold transition-all text-center"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <label className="block text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Custom Note</label>
                        <input
                          type="text"
                          placeholder="Warmup, notes..."
                          value={customNote[template.id] || ''}
                          onChange={(e) => setCustomNote(prev => ({ ...prev, [template.id]: e.target.value }))}
                          className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-semibold transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* TODAY'S EXERCISE LOG HISTORY */}
      <div className="bg-white/95 dark:bg-zinc-900/65 backdrop-blur-lg border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-xs font-black text-slate-450 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-2">
          <History size={14} className="text-slate-400" /> Completed Exercise Logs Today
        </h3>

        {fitnessLogsToday.length === 0 ? (
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 italic py-1">
            No exercises logged today yet.
          </p>
        ) : (
          <div className="space-y-2">
            {fitnessLogsToday.map((log) => {
              const template = fitnessTemplates.find(t => t.template.id === log.activityId)?.template
              return (
                <div key={log.id} className="flex justify-between items-center p-3.5 bg-slate-50/50 dark:bg-zinc-950/40 border border-slate-150 dark:border-zinc-850 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-800 dark:text-zinc-200">
                      {template?.name || 'Workout'}
                    </span>
                    {log.note && (
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-semibold bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded-md">
                        {log.note}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono font-extrabold uppercase tracking-wide">
                    {log.date}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

