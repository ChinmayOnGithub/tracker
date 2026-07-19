"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ActivityTemplate } from '@/types'
import { verifyPinAction, registerUserAction, logoutAction } from '@/app/actions/auth'
import { Layers, Sun, Moon, ShieldAlert } from 'lucide-react'
import { DashboardShell } from '@/modules/core/dashboard'
import { getAgendaAction } from '@/modules/sync/google-calendar/actions'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { CommandPalette } from './CommandPalette'
import { Modal } from '@/design-system'
import { TemplateModal } from './TemplateModal'
import { getTodayDateStr } from '@/lib/recurrence'

export interface CalendarData {
  connected: boolean
  agenda: {
    today: ParsedCalendarEvent[]
    tomorrow: ParsedCalendarEvent[]
    upcoming: ParsedCalendarEvent[]
  } | null
  error: string | null
  loading: boolean
}

export interface CalendarDataContextType {
  calendarData: CalendarData
  fetchCalendar: (force?: boolean) => Promise<void>
  onOpenCreateActivity: () => void
  onEditTemplate: (template: ActivityTemplate) => void
}

export const CalendarDataContext = React.createContext<CalendarDataContextType | undefined>(undefined)

interface DashboardLayoutProps {
  children: React.ReactNode
  currentUser?: { id: string; username: string } | null
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  currentUser = null,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const activeTab = pathname === '/' ? 'today' : pathname.split('/')[1] || 'today'

  // Modal states
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [templateToEdit, setTemplateToEdit] = useState<ActivityTemplate | null>(null)
  
  // Command Palette & Placeholder dialog state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [placeholderDialog, setPlaceholderDialog] = useState<{ isOpen: boolean; title: string; message: string } | null>(null)

  // Listen to Ctrl + K globally
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!currentUser)
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

  const changeTab = useCallback((tabId: string) => {
    router.push(tabId === 'today' ? '/' : `/${tabId}`)
  }, [router])

  // Calendar states lifted for centralized data sharing
  const [calendarData, setCalendarData] = useState<CalendarData>({
    connected: false,
    agenda: null,
    error: null,
    loading: true
  })

  const fetchCalendar = useCallback(async (force = false) => {
    if (!user) {
      setCalendarData({ connected: false, agenda: null, error: null, loading: false })
      return
    }
    setCalendarData(prev => ({ ...prev, loading: !force, error: null }))
    try {
      const todayStr = getTodayDateStr()
      const res = (await getAgendaAction(todayStr, force)) as {
        success: boolean
        connected?: boolean
        agenda?: {
          today: ParsedCalendarEvent[]
          tomorrow: ParsedCalendarEvent[]
          upcoming: ParsedCalendarEvent[]
        }
        error?: string
      }
      if (res.success && res.connected && res.agenda) {
        setCalendarData({
          connected: res.connected,
          agenda: res.agenda,
          error: null,
          loading: false
        })
      } else {
        setCalendarData(prev => ({
          ...prev,
          error: res.error || "Failed to fetch calendar",
          loading: false
        }))
      }
    } catch (err: unknown) {
      setCalendarData(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "An unexpected error occurred",
        loading: false
      }))
    }
  }, [user])

  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendar(false)
    }
  }, [isAuthenticated, fetchCalendar])

  // Load client-specific states on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTimeout(() => setTheme(savedTheme), 0)
    } else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTimeout(() => setTheme(systemDark ? 'dark' : 'light'), 0)
    }
  }, [])

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

  const onOpenCreateActivity = () => {
    setTemplateToEdit(null)
    setIsTemplateModalOpen(true)
  }

  const onEditTemplate = (template: ActivityTemplate) => {
    setTemplateToEdit(template)
    setIsTemplateModalOpen(true)
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4 transition-colors duration-300 relative overflow-hidden">
        {/* Ambient background glowing orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-600/5 blur-3xl pointer-events-none select-none animate-pulse duration-[6000ms]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-500/10 dark:bg-purple-600/5 blur-3xl pointer-events-none select-none animate-pulse duration-[8000ms]" />

        {/* Theme Toggle Button */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/80 hover:bg-slate-50 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-800/80 text-slate-700 dark:text-zinc-300 transition-all duration-200 cursor-pointer shadow-xs"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        {/* Loading Overlay */}
        {isAuthLoading && (
          <div className="absolute inset-0 bg-slate-50/60 dark:bg-zinc-950/70 backdrop-blur-xs flex flex-col items-center justify-center z-50 transition-all duration-300">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black text-slate-700 dark:text-zinc-300 uppercase tracking-widest mt-4 animate-pulse">
              {isRegisterMode ? 'Creating Account...' : 'Logging in...'}
            </p>
          </div>
        )}

        <div className={`w-full max-w-sm backdrop-blur-xl bg-white/80 dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/65 rounded-3xl p-6 md:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)] space-y-6 flex flex-col items-center transition-all duration-300 relative z-10 ${shake ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center text-center space-y-2.5 w-full">
            <div className="relative group mb-1">
              {/* Outer logo glow aura */}
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-2xl blur-md opacity-20 group-hover:opacity-35 transition-opacity duration-300" />
              <div className="relative p-3.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200/60 dark:border-zinc-800/80 rounded-2xl text-blue-500 dark:text-blue-400 shadow-xs flex items-center justify-center">
                <Layers size={24} className="animate-pulse" />
              </div>
            </div>
            <h1 className="text-lg font-black tracking-wider text-slate-900 dark:text-white uppercase">
              Operations Login
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold max-w-[240px] leading-relaxed">
              Access your personal control panel, metrics, activity schedules, and exercise workspace.
            </p>
          </div>

          {/* Primary Google Login Button */}
          <div className="w-full">
            <a
              href="/api/auth/google"
              className="w-full bg-white hover:bg-slate-50 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-100 flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] select-none border border-slate-200/80 dark:border-zinc-750 hover:border-slate-350 dark:hover:border-zinc-700 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign In with Google
            </a>
          </div>

          {/* Passcode Login Divider */}
          <div className="relative w-full flex items-center justify-center my-1 select-none">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-150 dark:border-zinc-800/80" />
            </div>
            <span className="relative px-3 bg-white dark:bg-zinc-900 text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">
              or access via passcode
            </span>
          </div>

          <div className="w-full space-y-4 pt-1">
            {/* Sign In vs Register Toggle */}
            <div className="flex border border-slate-200/60 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/80 p-1 rounded-xl w-full relative shadow-inner">
              <button
                disabled={isAuthLoading}
                onClick={() => { setIsRegisterMode(false); setAuthError(''); setEnteredPin(''); }}
                className={`flex-1 py-1.5 text-center text-[10px] uppercase tracking-wider font-black rounded-lg transition-all duration-200 cursor-pointer ${
                  !isRegisterMode
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200/40 dark:border-zinc-700/60 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-350'
                } disabled:opacity-50`}
              >
                Sign In
              </button>
              <button
                disabled={isAuthLoading}
                onClick={() => { setIsRegisterMode(true); setAuthError(''); setEnteredPin(''); }}
                className={`flex-1 py-1.5 text-center text-[10px] uppercase tracking-wider font-black rounded-lg transition-all duration-200 cursor-pointer ${
                  isRegisterMode
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200/40 dark:border-zinc-700/60 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-350'
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
                placeholder="e.g. amruta"
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value)
                  setAuthError('')
                }}
                className="w-full bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden transition-all duration-200 shadow-xs"
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
              className="w-full space-y-2 cursor-pointer flex flex-col items-center select-none"
            >
              <label className="block text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-center">Passcode PIN (Tap to Type)</label>
              <div className="flex gap-4 justify-center py-2">
                {Array.from({ length: 4 }).map((_, i) => {
                  const isFilled = i < enteredPin.length;
                  return (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${
                        isFilled
                          ? 'bg-blue-500 border-blue-500 scale-115 shadow-[0_0_12px_rgba(59,130,246,0.6)]'
                          : 'bg-slate-50 dark:bg-zinc-950/80 border-slate-300 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-700'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {authError && (
              <div className="text-xs font-bold text-red-500 dark:text-red-400 text-center animate-pulse">
                {authError}
              </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-3 justify-items-center w-full max-w-[240px] mx-auto select-none">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  disabled={isAuthLoading}
                  key={num}
                  onClick={() => handleKeyPress(num)}
                  className="w-11 h-11 rounded-full bg-white/70 hover:bg-slate-50 active:bg-slate-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/60 dark:active:bg-zinc-850/60 border border-slate-200/60 dark:border-zinc-800/80 text-slate-800 dark:text-zinc-200 font-extrabold text-sm flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-xs disabled:opacity-30 disabled:pointer-events-none"
                >
                  {num}
                </button>
              ))}
              <button
                disabled={isAuthLoading}
                onClick={handleClear}
                className="w-11 h-11 rounded-full text-slate-450 hover:text-slate-650 dark:text-zinc-500 dark:hover:text-zinc-350 font-extrabold text-[9px] uppercase flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              >
                Clear
              </button>
              <button
                disabled={isAuthLoading}
                key="0"
                onClick={() => handleKeyPress('0')}
                className="w-11 h-11 rounded-full bg-white/70 hover:bg-slate-50 active:bg-slate-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/60 dark:active:bg-zinc-850/60 border border-slate-200/60 dark:border-zinc-800/80 text-slate-800 dark:text-zinc-200 font-extrabold text-sm flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-xs disabled:opacity-30 disabled:pointer-events-none"
              >
                0
              </button>
              <button
                disabled={isAuthLoading}
                onClick={handleBackspace}
                className="w-11 h-11 rounded-full text-slate-450 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 font-extrabold text-[9px] uppercase flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              >
                Del
              </button>
            </div>

            {/* Registration Submit Button */}
            {isRegisterMode && (
              <button
                onClick={() => handleAuthSubmit(usernameInput, enteredPin)}
                disabled={isAuthLoading || usernameInput.trim().length === 0 || enteredPin.length !== 4}
                className="w-full bg-slate-900 hover:bg-slate-850 dark:bg-white dark:hover:bg-zinc-50 text-white dark:text-zinc-950 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-md border border-slate-800 dark:border-zinc-200"
              >
                Register & Log In
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <CalendarDataContext.Provider value={{
      calendarData,
      fetchCalendar,
      onOpenCreateActivity,
      onEditTemplate
    }}>
      <DashboardShell
        activeTab={activeTab}
        onTabChange={changeTab}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        {children}

        {isTemplateModalOpen && (
          <TemplateModal
            isOpen={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            templateToEdit={templateToEdit}
          />
        )}

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNewActivity={onOpenCreateActivity}
          onNavigate={changeTab}
          onShowPlaceholder={(title, message) => {
            setPlaceholderDialog({ isOpen: true, title, message })
          }}
        />

        {placeholderDialog && (
          <Modal
            isOpen={placeholderDialog.isOpen}
            onClose={() => setPlaceholderDialog(null)}
            title={placeholderDialog.title}
            size="sm"
          >
            <div className="space-y-4 text-xs font-medium">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>Module Decoupled Alert</span>
              </div>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                {placeholderDialog.message}
              </p>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setPlaceholderDialog(null)}
                  className="px-4 py-1.5 bg-[var(--color-text-main)] hover:opacity-90 text-[var(--color-bg-surface)] rounded-lg text-xs font-bold cursor-pointer transition-opacity"
                >
                  Understood
                </button>
              </div>
            </div>
          </Modal>
        )}
      </DashboardShell>
    </CalendarDataContext.Provider>
  )
}
