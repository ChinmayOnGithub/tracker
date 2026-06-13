"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { ActivityTemplate, ActivityLog, Note, Tag, RecurrenceAnalysis } from '@/types'
import { Calendar } from './Calendar'
import { DashboardPanel } from './DashboardPanel'
import { ActivityManager } from './ActivityManager'
import { DayLogsModal } from './DayLogsModal'
import { TemplateModal } from './TemplateModal'
import { Icon } from './Icon'
import { getTodayDateStr } from '@/lib/recurrence'
import { markComplete } from '@/app/actions/log'
import { getTemplateColorClasses } from '@/lib/colors'
import { isPinSetup, registerPin, verifyPinAction } from '@/app/actions/auth'
import { Layers, Sun, Moon, Droplet, ShowerHead, CalendarDays, Lock, Dumbbell } from 'lucide-react'
import { getUpcomingEvents } from '@/lib/marathiCalendar'
import { ExerciseWorkspace } from './ExerciseWorkspace'

interface AnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface DashboardClientProps {
  templates: ActivityTemplate[]
  logs: ActivityLog[]
  notes: Note[]
  tags: Tag[]
  analyzedTemplates: AnalyzedTemplate[]
  recentLogs: ActivityLog[]
}

export const DashboardClient: React.FC<DashboardClientProps> = ({
  templates,
  logs,
  notes,
  tags,
  analyzedTemplates,
  recentLogs,
}) => {
  // Modal states
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getTodayDateStr())
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(false)
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [templateToEdit, setTemplateToEdit] = useState<ActivityTemplate | null>(null)

  const [mounted, setMounted] = useState(false)

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [pinSetup, setPinSetup] = useState<boolean>(false)
  
  const [enteredPin, setEnteredPin] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [setupPinConfirm, setSetupPinConfirm] = useState('')
  const [authError, setAuthError] = useState('')
  const [shake, setShake] = useState(false)

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [showExerciseWorkspace, setShowExerciseWorkspace] = useState(false)

  // Load client-specific states on mount
  useEffect(() => {
    setMounted(true)
    
    const isAuth = sessionStorage.getItem('operations_auth') === 'true'
    setIsAuthenticated(isAuth)
    
    isPinSetup().then(setup => {
      setPinSetup(!setup)
    })
    
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(systemDark ? 'dark' : 'light')
    }
  }, [])

  // Wash Hair quick log loading state
  const [isWashingHair, setIsWashingHair] = useState(false)

  // Sync theme with document class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
  }

  const handleKeyPress = useCallback((num: string) => {
    setAuthError('')
    if (pinSetup) {
      if (setupPin.length < 4) {
        setSetupPin(prev => prev + num)
      } else if (setupPinConfirm.length < 4) {
        setSetupPinConfirm(prev => prev + num)
      }
    } else {
      if (enteredPin.length < 4) {
        const nextPin = enteredPin + num
        setEnteredPin(nextPin)
        
        // Auto submit when length hits 4
        if (nextPin.length === 4) {
          verifyPinAction(nextPin).then(res => {
            if (res.success) {
              sessionStorage.setItem('operations_auth', 'true')
              setIsAuthenticated(true)
            } else {
              // Shake and clear
              setShake(true)
              setAuthError('Incorrect PIN code')
              setTimeout(() => {
                setShake(false)
                setEnteredPin('')
              }, 600)
            }
          })
        }
      }
    }
  }, [pinSetup, setupPin, setupPinConfirm, enteredPin])

  const handleBackspace = useCallback(() => {
    if (pinSetup) {
      if (setupPinConfirm.length > 0) {
        setSetupPinConfirm(prev => prev.slice(0, -1))
      } else if (setupPin.length > 0) {
        setSetupPin(prev => prev.slice(0, -1))
      }
    } else {
      setEnteredPin(prev => prev.slice(0, -1))
    }
  }, [pinSetup, setupPin, setupPinConfirm])

  const handleClear = useCallback(() => {
    if (pinSetup) {
      setSetupPin('')
      setSetupPinConfirm('')
    } else {
      setEnteredPin('')
    }
    setAuthError('')
  }, [pinSetup])

  const handleSetupSubmit = useCallback(() => {
    if (setupPin.length !== 4) {
      setAuthError('PIN must be 4 digits')
      return
    }
    if (setupPin !== setupPinConfirm) {
      setAuthError('PINs do not match')
      setSetupPinConfirm('')
      return
    }
    registerPin(setupPin).then(res => {
      if (res.success) {
        sessionStorage.setItem('operations_auth', 'true')
        setIsAuthenticated(true)
        setPinSetup(false)
      } else {
        setAuthError(res.error || 'Failed to setup PIN')
      }
    })
  }, [setupPin, setupPinConfirm])

  // Keyboard entry hook
  useEffect(() => {
    if (isAuthenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key
      if (key >= '0' && key <= '9') {
        handleKeyPress(key)
      } else if (key === 'Backspace') {
        handleBackspace()
      } else if (key === 'Escape' || key === 'Delete') {
        handleClear()
      } else if (key === 'Enter') {
        if (pinSetup && setupPin.length === 4 && setupPinConfirm.length === 4) {
          handleSetupSubmit()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAuthenticated, pinSetup, setupPin, setupPinConfirm, handleKeyPress, handleBackspace, handleClear, handleSetupSubmit])

  // Handlers
  const handleDayClick = (dateStr: string) => {
    setSelectedDateStr(dateStr)
    setIsDayLogsOpen(true)
  }

  const handleAddTemplate = () => {
    setTemplateToEdit(null)
    setIsTemplateModalOpen(true)
  }

  const handleEditTemplate = (template: ActivityTemplate) => {
    setTemplateToEdit(template)
    setIsTemplateModalOpen(true)
  }

  const handleOpenLoggerForTemplate = () => {
    setSelectedDateStr(getTodayDateStr())
    setIsDayLogsOpen(true)
  }

  // Filter logs and note for selected date
  const selectedDayLogs = logs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = notes.find(note => note.date === selectedDateStr) || null

  const todayStr = getTodayDateStr()

  // Calculate stats for today's briefing
  const totalTasksDue = analyzedTemplates.filter(
    item =>
      item.template.isActive &&
      item.template.recurrenceType !== 'milestone' &&
      item.analysis.nextDueDate &&
      item.analysis.nextDueDate <= todayStr
  ).length

  const activeHabitStreaks = analyzedTemplates.filter(
    item => item.template.isActive && item.analysis.streak > 0
  ).length

  // Todays tasks due OR completed today to show daily progress
  const todaysTasks = analyzedTemplates.filter(
    item =>
      item.template.isActive &&
      item.template.recurrenceType !== 'milestone' &&
      ((item.analysis.nextDueDate && item.analysis.nextDueDate <= todayStr) ||
       (item.analysis.lastCompletedDate === todayStr))
  )

  const todayTotalCount = todaysTasks.length
  const todayCompletedCount = todaysTasks.filter(
    item => item.analysis.lastCompletedDate === todayStr
  ).length

  // Wash Hair tracking details
  const washHairTemplate = templates.find(
    t => t.name.toLowerCase() === 'wash hair' || t.name.toLowerCase() === 'shampoo'
  )

  const washHairItem = washHairTemplate
    ? analyzedTemplates.find(item => item.template.id === washHairTemplate.id)
    : null

  const washHairDaysSince = washHairItem?.analysis.daysSinceLast ?? null
  const washHairOverdue = washHairDaysSince === null || washHairDaysSince >= 3

  let washHairDaysStr = ''
  if (washHairDaysSince === null) {
    washHairDaysStr = 'Never logged hair wash'
  } else if (washHairDaysSince === 0) {
    washHairDaysStr = 'Washed today! Clean & fresh'
  } else if (washHairDaysSince === 1) {
    washHairDaysStr = 'Washed yesterday'
  } else {
    washHairDaysStr = `${washHairDaysSince} days since last wash`
  }

  const handleQuickWashHair = async () => {
    if (!washHairTemplate) return
    setIsWashingHair(true)
    await markComplete(washHairTemplate.id, todayStr)
    setIsWashingHair(false)
  }

  // Priorities list sorting incomplete tasks first
  const prioritiesList = [...todaysTasks].sort((a, b) => {
    const aDone = a.analysis.lastCompletedDate === todayStr ? 1 : 0
    const bDone = b.analysis.lastCompletedDate === todayStr ? 1 : 0
    return aDone - bDone
  })

  const [processingItems, setProcessingItems] = useState<Record<string, boolean>>({})

  const handleQuickLogComplete = async (templateId: string, category: string, amount: number | null) => {
    setProcessingItems(prev => ({ ...prev, [templateId]: true }))
    const status = category === 'finance' ? 'paid' : 'done'
    await markComplete(templateId, todayStr, status, amount, null)
    setProcessingItems(prev => ({ ...prev, [templateId]: false }))
  }

  // Today's completions (valid logged activities)
  const todayCompletions = logs.filter(
    log => log.date === todayStr && log.status !== 'skipped' && log.status !== 'reminder'
  )

  // Today's standalone note
  const todayNote = notes.find(note => note.date === todayStr) || null

  // Remove unnecessary loading view since auth state is initialized lazily
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4 transition-colors duration-200">
        <div className="absolute top-4 right-4">
          <button
            onClick={toggleTheme}
            className="w-8.5 h-8.5 rounded-lg flex items-center justify-center bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-850/60 text-slate-700 dark:text-zinc-300 transition-all cursor-pointer shadow-xs"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className={`w-full max-w-sm bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200 dark:border-zinc-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 flex flex-col items-center transition-all ${shake ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="p-3 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-slate-750 dark:text-zinc-300">
              <Layers size={28} />
            </div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase">
              {pinSetup ? 'Setup Command PIN' : 'Authorization Required'}
            </h1>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-bold max-w-[240px]">
              {pinSetup 
                ? 'Create a secure 4-digit PIN to lock your personal operations control centre.' 
                : 'Enter your 4-digit passcode to unlock dashboard access.'}
            </p>
          </div>

          <div className="flex gap-4 justify-center py-2">
            {Array.from({ length: 4 }).map((_, i) => {
              let active = false
              if (pinSetup) {
                active = setupPinConfirm.length > 0 ? i < setupPinConfirm.length : i < setupPin.length
              } else {
                active = i < enteredPin.length
              }
              return (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                    active
                      ? 'bg-blue-500 border-blue-500 scale-110 shadow-xs shadow-blue-500'
                      : 'bg-slate-200 dark:bg-zinc-950 border-slate-300 dark:border-zinc-850'
                  }`}
                />
              )
            })}
          </div>

          {pinSetup && setupPin.length === 4 && (
            <div className="text-center text-[10px] text-blue-500 dark:text-blue-450 font-bold uppercase tracking-wider animate-pulse">
              Confirm your PIN code below
            </div>
          )}

          {authError && (
            <div className="text-xs font-bold text-red-500 dark:text-red-400 text-center animate-pulse">
              {authError}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3.5 w-full max-w-[280px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-850/60 text-slate-800 dark:text-zinc-200 font-bold text-lg flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer shadow-xs"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="w-16 h-16 rounded-2xl text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-350 font-bold text-xs uppercase flex items-center justify-center transition-all cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={() => handleKeyPress('0')}
              className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-850/60 text-slate-800 dark:text-zinc-200 font-bold text-lg flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer shadow-xs"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="w-16 h-16 rounded-2xl text-slate-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 font-bold text-xs uppercase flex items-center justify-center transition-all cursor-pointer"
            >
              Del
            </button>
          </div>

          {pinSetup && (
            <button
              onClick={handleSetupSubmit}
              disabled={setupPin.length !== 0 ? (setupPin.length !== 4 || setupPinConfirm.length !== 4) : true}
              className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 py-3.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              Save PIN & Unlock
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      
      {/* Today's Overview & Reflection Center */}
      <div className="bg-white dark:bg-zinc-900/60 border border-slate-205 dark:border-zinc-800/80 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row gap-6 md:divide-x md:divide-slate-200/50 dark:md:divide-zinc-800/80 transition-all duration-200">
        
        {/* Left Section: Huge Date Display & Controls */}
        <div className="flex items-center gap-4 shrink-0 pr-6">
          <div suppressHydrationWarning className="text-5xl md:text-6xl font-black tracking-tighter text-slate-800 dark:text-white font-mono leading-none">
            {mounted ? new Date(todayStr + 'T00:00:00').getDate() : ''}
          </div>
          <div className="flex flex-col justify-center select-none">
            <span suppressHydrationWarning className="text-xs uppercase font-extrabold tracking-wider text-blue-500 dark:text-blue-400">
              {mounted ? new Date(todayStr + 'T00:00:00').toLocaleDateString('default', { weekday: 'long' }) : ''}
            </span>
            <span suppressHydrationWarning className="text-xs font-semibold text-slate-400 dark:text-zinc-500 mt-0.5">
              {mounted ? new Date(todayStr + 'T00:00:00').toLocaleDateString('default', { month: 'short', year: 'numeric' }) : ''}
            </span>
            {/* Marathi Calendar Festivals */}
            {getUpcomingEvents(todayStr, 2).map((event, idx) => {
              const isEventToday = event.date === todayStr
              if (!isEventToday) return null
              return (
                <div key={idx} className="mt-1 flex items-center gap-1 text-[9px] font-black text-orange-600 dark:text-orange-400 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  <span>{event.title}</span>
                </div>
              )
            })}
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 ml-auto md:ml-4">
            <button
              onClick={() => setShowExerciseWorkspace(!showExerciseWorkspace)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all cursor-pointer shadow-3xs ${
                showExerciseWorkspace 
                  ? 'bg-blue-500 hover:bg-blue-650 text-white border-blue-400' 
                  : 'bg-slate-50 hover:bg-slate-105 dark:bg-zinc-950 dark:hover:bg-zinc-900 border-slate-205 dark:border-zinc-850 text-slate-550 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'
              }`}
              title="Exercise Workspace & Timers"
            >
              <Dumbbell size={13} className={showExerciseWorkspace ? 'animate-bounce-slow' : ''} />
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('operations_auth')
                setIsAuthenticated(false)
                setEnteredPin('')
              }}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-850 text-slate-550 hover:text-slate-850 dark:text-zinc-400 dark:hover:text-white transition-all cursor-pointer shadow-3xs"
              title="Lock Session"
            >
              <Lock size={12} />
            </button>
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-850 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-all cursor-pointer shadow-3xs"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        </div>

        {/* Middle Section: Completed Today */}
        <div className="flex-1 md:px-6 space-y-2">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-zinc-500 block">Activities Completed Today</span>
          
          <div className="flex flex-wrap gap-1.5 items-center">
            {todayCompletions.length === 0 ? (
              <div className="text-xs text-slate-400 dark:text-zinc-500 italic font-medium py-1">
                No activities logged today yet. Let's make progress!
              </div>
            ) : (
              todayCompletions.map(log => {
                const template = templates.find(t => t.id === log.activityId)
                const name = template?.name || 'Unknown'
                const color = template?.color || 'zinc'
                const icon = template?.icon || 'CheckSquare'
                const colorClasses = getTemplateColorClasses(color)
                
                return (
                  <div
                    key={log.id}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold shadow-3xs transition-all hover:scale-102 ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
                  >
                    <Icon name={icon} size={11} />
                    <span>{name}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Section: Today's Reflection */}
        <div className="flex-1 md:pl-6 space-y-2 max-w-md">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-zinc-500 block">Today's Reflection</span>
          {todayNote ? (
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-850 dark:text-white line-clamp-1">
                {todayNote.title || 'Untitled Reflection'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                {todayNote.content}
              </p>
            </div>
          ) : (
            <div className="text-xs text-slate-400 dark:text-zinc-500 italic font-medium py-1">
              No reflection written for today. Click the note icon on the calendar to write!
            </div>
          )}
        </div>

      </div>

      {/* Core Layout / Exercise Workspace Toggle */}
      {showExerciseWorkspace ? (
        <ExerciseWorkspace
          analyzedTemplates={analyzedTemplates}
          recentLogs={recentLogs}
          todayStr={todayStr}
          onClose={() => setShowExerciseWorkspace(false)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (Calendar & Template List) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-8">
            <Calendar
              logs={logs}
              templates={templates}
              notes={notes}
              onDayClick={handleDayClick}
            />

            <ActivityManager
              analyzedTemplates={analyzedTemplates}
              onAddTemplate={handleAddTemplate}
              onEditTemplate={handleEditTemplate}
            />
          </div>

          {/* Right Column (Due panel and logs feed) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <DashboardPanel
              analyzedTemplates={analyzedTemplates}
              recentLogs={recentLogs}
              allTags={tags}
              onOpenLogger={handleOpenLoggerForTemplate}
            />
          </div>
        </div>
      )}

      {/* Modals Layer */}
      {isDayLogsOpen && (
        <DayLogsModal
          key={`${selectedDateStr}-${selectedDayNote?.id || 'new'}`}
          isOpen={isDayLogsOpen}
          onClose={() => setIsDayLogsOpen(false)}
          dateStr={selectedDateStr}
          templates={templates.filter(t => t.isActive)} // Only log active templates
          logs={selectedDayLogs}
          note={selectedDayNote}
        />
      )}

      {isTemplateModalOpen && (
        <TemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          templateToEdit={templateToEdit}
          allTags={tags}
        />
      )}

    </div>
  )
}

