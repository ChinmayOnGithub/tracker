"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
import { verifyPinAction, registerUserAction, logoutAction } from '@/app/actions/auth'
import { Layers, Sun, Moon, Droplet, ShowerHead, CalendarDays, Lock, Dumbbell, LogOut } from 'lucide-react'
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
  initialAuthenticated?: boolean
  currentUser?: { id: string; username: string } | null
}

export const DashboardClient: React.FC<DashboardClientProps> = ({
  templates,
  logs,
  notes,
  tags,
  analyzedTemplates,
  recentLogs,
  initialAuthenticated = false,
  currentUser = null,
}) => {
  const router = useRouter()
  // Modal states
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getTodayDateStr())
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(false)
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [templateToEdit, setTemplateToEdit] = useState<ActivityTemplate | null>(null)

  const [mounted, setMounted] = useState(false)

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialAuthenticated)
  const [user, setUser] = useState<{ id: string; username: string } | null>(currentUser)
  const [usernameInput, setUsernameInput] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [enteredPin, setEnteredPin] = useState('')
  const [authError, setAuthError] = useState('')
  const [shake, setShake] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [showExerciseWorkspace, setShowExerciseWorkspace] = useState(false)

  // Load client-specific states on mount
  useEffect(() => {
    setMounted(true)
    
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

  const handleAuthSubmit = useCallback(async (username: string, pin: string) => {
    if (isAuthLoading) return
    if (!username.trim()) {
      setAuthError('Username is required')
      setEnteredPin('')
      return
    }
    if (pin.length !== 4) {
      setAuthError('PIN must be 4 digits')
      return
    }

    setIsAuthLoading(true)
    setAuthError('')

    if (isRegisterMode) {
      const res = await registerUserAction(username, pin)
      if (res.success) {
        setIsAuthenticated(true)
        if (res.user) {
          setUser(res.user)
        }
        setIsAuthLoading(false)
        router.refresh()
      } else {
        setIsAuthLoading(false)
        setShake(true)
        setAuthError(res.error || 'Registration failed')
        setEnteredPin('')
        setTimeout(() => setShake(false), 600)
      }
    } else {
      const res = await verifyPinAction(username, pin)
      if (res.success) {
        setIsAuthenticated(true)
        if (res.user) {
          setUser(res.user)
        }
        setIsAuthLoading(false)
        router.refresh()
      } else {
        setIsAuthLoading(false)
        setShake(true)
        setAuthError(res.error || 'Incorrect username or PIN')
        setEnteredPin('')
        setTimeout(() => setShake(false), 600)
      }
    }
  }, [isRegisterMode, isAuthLoading, router])

  const handleKeyPress = useCallback((num: string) => {
    if (isAuthLoading) return
    setAuthError('')
    pinInputRef.current?.focus()
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + num
      setEnteredPin(nextPin)
      
      // Auto submit during login mode
      if (nextPin.length === 4 && !isRegisterMode) {
        handleAuthSubmit(usernameInput, nextPin)
      }
    }
  }, [enteredPin, isRegisterMode, usernameInput, handleAuthSubmit, isAuthLoading])

  const handleBackspace = useCallback(() => {
    if (isAuthLoading) return
    setEnteredPin(prev => prev.slice(0, -1))
  }, [isAuthLoading])

  const handleClear = useCallback(() => {
    if (isAuthLoading) return
    setEnteredPin('')
    setAuthError('')
  }, [isAuthLoading])

  const handleLogout = async () => {
    setIsAuthenticated(false) // Immediately hide calendar data
    setUser(null)
    await logoutAction()
    router.refresh()
  }

  // Keyboard entry hook
  useEffect(() => {
    if (isAuthenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in the username input, don't capture dialpad keys
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Enter' && enteredPin.length === 4) {
          handleAuthSubmit(usernameInput, enteredPin)
        }
        return
      }

      const key = e.key
      if (key >= '0' && key <= '9') {
        handleKeyPress(key)
      } else if (key === 'Backspace') {
        handleBackspace()
      } else if (key === 'Escape' || key === 'Delete') {
        handleClear()
      } else if (key === 'Enter' && enteredPin.length === 4) {
        handleAuthSubmit(usernameInput, enteredPin)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAuthenticated, enteredPin, usernameInput, handleKeyPress, handleBackspace, handleClear, handleAuthSubmit])

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4 transition-colors duration-200 relative">
        <div className="absolute top-4 right-4">
          <button
            onClick={toggleTheme}
            className="w-8.5 h-8.5 rounded-lg flex items-center justify-center bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-850/60 text-slate-700 dark:text-zinc-300 transition-all cursor-pointer shadow-xs"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        {/* Loading Overlay */}
        {isAuthLoading && (
          <div className="absolute inset-0 bg-slate-50/70 dark:bg-zinc-950/70 backdrop-blur-xs flex flex-col items-center justify-center z-50 transition-all duration-300">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black text-slate-700 dark:text-zinc-300 uppercase tracking-widest mt-4 animate-pulse">
              {isRegisterMode ? 'Creating Account...' : 'Logging in...'}
            </p>
          </div>
        )}

        <div className={`w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-lg border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 flex flex-col items-center transition-all duration-300 ${shake ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="p-3.5 bg-slate-50 dark:bg-zinc-950 border border-slate-150 dark:border-zinc-850 rounded-2xl text-blue-500 dark:text-blue-400 shadow-sm">
              <Layers size={26} className="animate-pulse" />
            </div>
            <h1 className="text-lg font-black tracking-wider text-slate-900 dark:text-white uppercase">
              {isRegisterMode ? 'Create Account' : 'Operations Login'}
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold max-w-[240px] leading-relaxed">
              {isRegisterMode
                ? 'Choose a unique username and a secure 4-digit PIN.'
                : 'Enter your credentials to access your control panel.'}
            </p>
          </div>

          {/* Sign In vs Register Toggle */}
          <div className="flex border border-slate-150 dark:border-zinc-850 bg-slate-50 dark:bg-zinc-950 p-1 rounded-xl w-full">
            <button
              disabled={isAuthLoading}
              onClick={() => { setIsRegisterMode(false); setAuthError(''); setEnteredPin(''); }}
              className={`flex-1 py-1.5 text-center text-[10px] uppercase tracking-wider font-black rounded-lg transition-all cursor-pointer ${
                !isRegisterMode
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200/50 dark:border-zinc-700 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-400'
              } disabled:opacity-50`}
            >
              Sign In
            </button>
            <button
              disabled={isAuthLoading}
              onClick={() => { setIsRegisterMode(true); setAuthError(''); setEnteredPin(''); }}
              className={`flex-1 py-1.5 text-center text-[10px] uppercase tracking-wider font-black rounded-lg transition-all cursor-pointer ${
                isRegisterMode
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200/50 dark:border-zinc-700 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-400'
              } disabled:opacity-50`}
            >
              Register
            </button>
          </div>

          {/* Username Text Input */}
          <div className="w-full space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Username</label>
            <input
              disabled={isAuthLoading}
              type="text"
              placeholder="e.g. chinmay"
              value={usernameInput}
              onChange={(e) => {
                setUsernameInput(e.target.value)
                setAuthError('')
              }}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-850 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden transition-all shadow-3xs"
            />
          </div>

          {/* Hidden PIN Input for system keyboard support */}
          <input
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={enteredPin}
            onChange={(e) => {
              if (isAuthLoading) return
              const val = e.target.value.replace(/\D/g, '')
              setEnteredPin(val)
              if (val.length === 4 && !isRegisterMode) {
                handleAuthSubmit(usernameInput, val)
              }
            }}
            className="opacity-0 absolute w-1 h-1 pointer-events-none"
          />

          {/* 4 PIN Dots */}
          <div 
            onClick={() => !isAuthLoading && pinInputRef.current?.focus()}
            className="w-full space-y-2 cursor-pointer flex flex-col items-center"
          >
            <label className="block text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-center">Passcode PIN (Tap to Type)</label>
            <div className="flex gap-4 justify-center py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                    i < enteredPin.length
                      ? 'bg-blue-500 border-blue-500 scale-110 shadow-md shadow-blue-500/50'
                      : 'bg-slate-100 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800'
                  }`}
                />
              ))}
            </div>
          </div>

          {authError && (
            <div className="text-xs font-bold text-red-500 dark:text-red-400 text-center animate-pulse">
              {authError}
            </div>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 justify-items-center w-full max-w-[260px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                disabled={isAuthLoading}
                key={num}
                onClick={() => handleKeyPress(num)}
                className="w-14 h-14 rounded-full bg-slate-50 hover:bg-slate-100/80 active:bg-slate-200/80 dark:bg-zinc-950 dark:hover:bg-zinc-900/80 dark:active:bg-zinc-850/80 border border-slate-200 dark:border-zinc-850/80 text-slate-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer shadow-3xs disabled:opacity-30"
              >
                {num}
              </button>
            ))}
            <button
              disabled={isAuthLoading}
              onClick={handleClear}
              className="w-14 h-14 rounded-full text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-350 font-bold text-[10px] uppercase flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 active:scale-90"
            >
              Clear
            </button>
            <button
              disabled={isAuthLoading}
              key="0"
              onClick={() => handleKeyPress('0')}
              className="w-14 h-14 rounded-full bg-slate-50 hover:bg-slate-100/80 active:bg-slate-200/80 dark:bg-zinc-950 dark:hover:bg-zinc-900/80 dark:active:bg-zinc-850/80 border border-slate-200 dark:border-zinc-850/80 text-slate-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer shadow-3xs disabled:opacity-30"
            >
              0
            </button>
            <button
              disabled={isAuthLoading}
              onClick={handleBackspace}
              className="w-14 h-14 rounded-full text-slate-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 font-bold text-[10px] uppercase flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 active:scale-90"
            >
              Del
            </button>
          </div>

          {/* Registration Submit Button */}
          {isRegisterMode && (
            <button
              onClick={() => handleAuthSubmit(usernameInput, enteredPin)}
              disabled={isAuthLoading || usernameInput.trim().length === 0 || enteredPin.length !== 4}
              className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 py-3.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              Register & Log In
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
            {user && (
              <span className="text-[9px] bg-slate-50 border border-slate-200 dark:bg-zinc-950 dark:border-zinc-850 px-2 py-1.5 rounded-xl text-slate-550 dark:text-zinc-400 font-extrabold uppercase select-none tracking-wider hidden sm:inline-block">
                {user.username}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-850 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-all cursor-pointer shadow-3xs"
              title="Log Out"
            >
              <LogOut size={12} />
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

