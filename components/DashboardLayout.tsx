"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ActivityTemplate } from '@/types'
import { verifyPinAction, registerUserAction, logoutAction } from '@/app/actions/auth'
import { writeQueue } from '@/lib/store/write-queue'
import { requestDeduplicator } from '@/lib/store/requestDeduplicator'
import { Layers, Sun, Moon, ShieldAlert } from 'lucide-react'
import { DashboardShell } from '@/modules/core/dashboard'
import { getAgendaAction } from '@/modules/sync/google-calendar/actions'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { CommandPalette } from './CommandPalette'
import { MobileSearchModal } from './MobileSearchModal'
import { Card, CardBody, Button, Input, Modal } from '@/design-system'
import { TemplateModal } from './TemplateModal'
import { getTodayDateStr } from '@/lib/recurrence'
import { CalendarCacheService } from '@/modules/calendar/services/CalendarCacheService'
import { clearDayDtoCache } from './DayLogsModal'
import { EntitlementProvider } from '@/lib/context/EntitlementContext'
import { purgeUserStorage } from '@/lib/storage/userStorage'

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
  currentUser?: { id: string; username: string; email?: string | null; isOwner?: boolean } | null
  fetchCalendar: (force?: boolean) => Promise<void>
  onOpenCreateActivity: () => void
  onEditTemplate: (template: ActivityTemplate) => void
  guestPermissions?: Record<string, boolean>
  isOwner?: boolean
}

export const CalendarDataContext = React.createContext<CalendarDataContextType | undefined>(undefined)

interface DashboardLayoutProps {
  children: React.ReactNode
  currentUser?: { id: string; username: string; email?: string | null; isOwner?: boolean } | null
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  currentUser = null,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const dateParam = searchParams?.get('date')
  const activeTab = pathname === '/' ? 'today' : pathname.split('/')[1] || 'today'

  // Modal states
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [templateToEdit, setTemplateToEdit] = useState<ActivityTemplate | null>(null)

  // Command Palette, Mobile Search & Placeholder dialog state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [placeholderDialog, setPlaceholderDialog] = useState<{ isOpen: boolean; title: string; message: string } | null>(null)

  const handleOpenSearch = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileSearchOpen(true)
    } else {
      setIsCommandPaletteOpen(true)
    }
  }, [])

  // Listen to Ctrl + K globally
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        handleOpenSearch()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleOpenSearch])

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!currentUser)
  const [user, setUser] = useState<{ id: string; username: string; email?: string | null; isOwner?: boolean } | null>(currentUser)
  const [guestPerms, setGuestPerms] = useState<Record<string, boolean>>({
    today: false,
    calendar: false,
    activities: false,
    journal: false,
    leave: false,
    weight: false,
    links: false,
    documents: false,
    settings: true,
  })
  const [usernameInput, setUsernameInput] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [enteredPin, setEnteredPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [shake, setShake] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Fetch guest permissions for non-owner accounts
  const isOwner = user?.username === 'admin' || user?.isOwner === true
  useEffect(() => {
    const fetchPerms = () => {
      if (user && !isOwner) {
        import('@/app/actions/settings').then(mod => {
          mod.getGuestPermissionsAction().then(res => {
            if (res.success && res.permissions) {
              setGuestPerms(res.permissions)
            }
          })
        })
      }
    }
    fetchPerms()
    window.addEventListener('personal_settings_changed', fetchPerms)
    return () => window.removeEventListener('personal_settings_changed', fetchPerms)
  }, [user, isOwner])

  // Synchronize state with incoming currentUser prop to eliminate cross-session stale identity (#57)
  useEffect(() => {
    setUser(currentUser)
    setIsAuthenticated(!!currentUser)
    if (!currentUser) {
      setCalendarData({
        connected: false,
        agenda: null,
        error: null,
        loading: false
      })
    }
  }, [currentUser])

  // Theme state: deterministic server default to ensure initial client render matches SSR (#60)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [isThemeMounted, setIsThemeMounted] = useState(false)

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

    const todayStr = dateParam || getTodayDateStr()

    // 1. Check warm memory / IndexedDB cache first
    const { data: cachedAgenda, isStale } = await CalendarCacheService.getCachedAgenda(user.id, todayStr)
    if (cachedAgenda) {
      setCalendarData(prev => ({
        ...prev,
        connected: true,
        agenda: cachedAgenda,
        error: null,
        loading: false,
      }))
      // If cache is fresh and not forced, DO NOT trigger an unnecessary network request!
      if (!isStale && !force) {
        return
      }
    } else {
      // Only show loading if we don't have any cached events
      setCalendarData(prev => ({ ...prev, loading: !force, error: null }))
    }

    // 2. Fetch fresh data from server in background (or foreground if no cache)
    try {
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
        // 3. Reconcile with existing cached items using stable event IDs
        const reconciled = CalendarCacheService.reconcileAgenda(cachedAgenda, res.agenda)
        await CalendarCacheService.saveCachedAgenda(user.id, todayStr, reconciled)

        setCalendarData({
          connected: res.connected,
          agenda: reconciled,
          error: null,
          loading: false,
        })
      } else if (!cachedAgenda) {
        setCalendarData(prev => ({
          ...prev,
          connected: res.connected ?? false,
          error: res.error || "Failed to fetch calendar",
          loading: false,
        }))
      }
    } catch (err: unknown) {
      if (!cachedAgenda) {
        setCalendarData(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : "An unexpected error occurred",
          loading: false,
        }))
      }
    }
  }, [user, dateParam])

  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendar(false)
    }
  }, [isAuthenticated, fetchCalendar, dateParam])

  // Listen to calendar data changes from Calendar / Today mutations to auto-refresh
  useEffect(() => {
    const handleCalendarChanged = () => {
      fetchCalendar(true)
    }
    window.addEventListener('calendar_data_changed', handleCalendarChanged)
    return () => window.removeEventListener('calendar_data_changed', handleCalendarChanged)
  }, [fetchCalendar])

  // Load client-specific states on mount post-hydration
  useEffect(() => {
    setIsThemeMounted(true)
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
    } else if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light')
    }

    // Apply personal styles on load
    applyPersonalStyles()

    // Hydrate appearance preferences from server user settings only if not already set locally
    // or if the local value is absent. Never blindly overwrite local changes.
    import('@/app/actions/settings').then(({ getUserSettingsAction }) => {
      getUserSettingsAction().then(res => {
        if (res.success && res.settings?.appearance) {
          const app = res.settings.appearance
          let changed = false
          const localAccent = localStorage.getItem('personal_accent_color')
          if (app.accent && !localAccent) {
            localStorage.setItem('personal_accent_color', app.accent)
            changed = true
          }
          const localFontSize = localStorage.getItem('personal_font_size')
          if (app.fontSize && !localFontSize) {
            localStorage.setItem('personal_font_size', app.fontSize)
            changed = true
          }
          const localRounded = localStorage.getItem('personal_rounded_corners')
          if (app.rounded && !localRounded) {
            localStorage.setItem('personal_rounded_corners', app.rounded)
            changed = true
          }
          const localAnimations = localStorage.getItem('personal_animations')
          if (app.animations && !localAnimations) {
            localStorage.setItem('personal_animations', app.animations)
            changed = true
          }
          if (changed) {
            applyPersonalStyles()
          }
        }
      }).catch(console.error)
    })

    // Listen to custom settings update events to refresh layout styles instantly
    window.addEventListener('personal_settings_changed', applyPersonalStyles)
    return () => window.removeEventListener('personal_settings_changed', applyPersonalStyles)
  }, [theme])

  const applyPersonalStyles = () => {
    const accent = localStorage.getItem('personal_accent_color') || 'blue'
    const fontSize = localStorage.getItem('personal_font_size') || 'md'
    const rounded = localStorage.getItem('personal_rounded_corners') || 'md'
    const animations = localStorage.getItem('personal_animations') || 'on'

    const colors: Record<string, { primary: string; hover: string }> = {
      purple: { primary: '#a855f7', hover: '#9333ea' },
      green: { primary: '#22c55e', hover: '#16a34a' },
      blue: { primary: '#007aff', hover: '#0056b3' },
      orange: { primary: '#f97316', hover: '#ea580c' },
      indigo: { primary: '#818cf8', hover: '#6366f1' },
      rose: { primary: '#f43f5e', hover: '#e11d48' },
      emerald: { primary: '#10b981', hover: '#059669' },
      amber: { primary: '#f59e0b', hover: '#d97706' },
      cyan: { primary: '#06b6d4', hover: '#0891b2' },
    }

    const match = colors[accent] || colors.blue
    const fontSizes: Record<string, string> = {
      sm: '13px',
      md: '14px',
      lg: '16px',
    }

    const radiusConfig: Record<string, { xs: string; sm: string; md: string; lg: string; xl: string; '2xl': string; '3xl': string }> = {
      none: { xs: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px', '3xl': '0px' },
      md: { xs: '2px', sm: '2px', md: '4px', lg: '6px', xl: '8px', '2xl': '12px', '3xl': '16px' },
      full: { xs: '4px', sm: '6px', md: '12px', lg: '20px', xl: '24px', '2xl': '32px', '3xl': '40px' },
    }

    const activeRadius = radiusConfig[rounded] || radiusConfig.md

    const styleId = 'custom-personal-styles'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    styleEl.innerHTML = `
      :root {
        --color-primary: ${match.primary} !important;
        --color-primary-hover: ${match.hover} !important;
        --radius-xs: ${activeRadius.xs} !important;
        --radius-sm: ${activeRadius.sm} !important;
        --radius-md: ${activeRadius.md} !important;
        --radius-lg: ${activeRadius.lg} !important;
        --radius-xl: ${activeRadius.xl} !important;
        --radius-2xl: ${activeRadius['2xl']} !important;
        --radius-3xl: ${activeRadius['3xl']} !important;
        --card-radius: ${activeRadius.lg} !important;
        font-size: ${fontSizes[fontSize] || fontSizes.md} !important;
      }
      .dark {
        --color-primary: ${match.primary} !important;
        --color-primary-hover: ${match.hover} !important;
      }
      ${animations === 'off' ? `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
        }
      ` : ''}
    `
  }

  // Sync theme with document class
  useEffect(() => {
    if (!isThemeMounted) return
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme, isThemeMounted])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
    document.cookie = `theme=${nextTheme}; path=/; max-age=31536000; SameSite=Lax`
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleAuthSubmit = useCallback(async (username: string, pin: string) => {
    if (isAuthLoading) return
    if (!username.trim()) {
      setAuthError('Username is required')
      setEnteredPin('')
      return
    }
    if (isRegisterMode && pin.length < 8) {
      setAuthError('Password must be at least 8 characters')
      return
    }
    if (!isRegisterMode && pin.length < 4) {
      setAuthError('Enter a valid password or 4-digit PIN')
      return
    }

    setIsAuthLoading(true)
    setAuthError('')

    if (isRegisterMode) {
      const res = await registerUserAction(username, pin)
      if (res.success) {
        setIsAuthenticated(true)
        if (res.user) setUser(res.user)
        window.location.replace('/')
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
        if (res.user) setUser(res.user)
        window.location.replace('/')
      } else {
        setIsAuthLoading(false)
        setShake(true)
        setAuthError(res.error || 'Incorrect username or password/PIN')
        setEnteredPin('')
        setTimeout(() => setShake(false), 600)
      }
    }
  }, [isRegisterMode, isAuthLoading])

  const handleLogout = async () => {
    if (user?.id) {
      CalendarCacheService.invalidateAll(user.id)
      clearDayDtoCache(user.id)
      purgeUserStorage(user.id)
    } else {
      clearDayDtoCache()
      purgeUserStorage()
    }
    setCalendarData({
      connected: false,
      agenda: null,
      error: null,
      loading: false
    })
    setIsAuthenticated(false) // Immediately hide calendar data
    setUser(null)
    // Drain User A's write queue before session is invalidated so pending writes
    // never execute under User B's session (part of #57 client-state isolation)
    writeQueue.drain()
    // Clear all in-flight deduplicated requests so User A responses cannot
    // populate User B's store after login
    requestDeduplicator.clear()
    await logoutAction()
    window.location.replace('/')
  }

  const onOpenCreateActivity = () => {
    setTemplateToEdit(null)
    setIsTemplateModalOpen(true)
  }

  const onEditTemplate = (template: ActivityTemplate) => {
    setTemplateToEdit(template)
    setIsTemplateModalOpen(true)
  }

  if (!isAuthenticated) {
    const handleSubmitForm = (e: React.FormEvent) => {
      e.preventDefault()
      handleAuthSubmit(usernameInput, enteredPin)
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)] p-4 transition-colors duration-300 relative overflow-hidden">
        {/* Ambient background glowing orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-600/5 blur-3xl pointer-events-none select-none animate-pulse duration-[6000ms]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-500/10 dark:bg-purple-600/5 blur-3xl pointer-events-none select-none animate-pulse duration-[8000ms]" />

        {/* Theme Toggle Button */}
        <div className="absolute top-4 right-4 z-20">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
        </div>

        {/* Loading Overlay */}
        {isAuthLoading && (
          <div className="absolute inset-0 bg-[var(--color-bg-base)]/70 backdrop-blur-xs flex flex-col items-center justify-center z-50 transition-all duration-300">
            <div className="w-10 h-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-widest mt-4 animate-pulse">
              {isRegisterMode ? 'Creating Account...' : 'Logging in...'}
            </p>
          </div>
        )}

        <Card className={`w-full max-w-sm border-[var(--color-border)] bg-[var(--color-bg-surface)] backdrop-blur-xl shadow-xl transition-all duration-300 relative z-10 ${shake ? 'animate-shake' : ''}`}>
          <CardBody className="p-6 md:p-8 space-y-6 flex flex-col items-center">
            <div className="flex flex-col items-center text-center space-y-2.5 w-full">
              <div className="relative group mb-1">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-2xl blur-md opacity-20 group-hover:opacity-35 transition-opacity duration-300" />
                <div className="relative p-3.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-2xl text-[var(--color-primary)] shadow-xs flex items-center justify-center">
                  <Layers size={24} className="animate-pulse" />
                </div>
              </div>
              <h1 className="text-lg font-black tracking-wider text-[var(--color-text-main)] uppercase">
                Operations Login
              </h1>
              <p className="text-[11px] text-[var(--color-text-muted)] font-medium max-w-[240px] leading-relaxed">
                Access your personal control panel, metrics, activity schedules, and exercise workspace.
              </p>
            </div>

            {/* Unauthorized Account Alert */}
            {searchParams?.get('error') === 'unauthorized-account' && (
              <div className="w-full p-3 bg-rose-500/10 border border-rose-500/30 rounded-[var(--radius-md)] flex items-start gap-2.5 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-snug">
                  <span className="font-bold block">Access Restricted</span>
                  <span>
                    {searchParams.get('account') 
                      ? `${searchParams.get('account')} is not authorized. Only chinmaydpatil09@gmail.com can access this application.`
                      : 'This private application is restricted exclusively to authorized accounts.'}
                  </span>
                </div>
              </div>
            )}

            {/* Primary Google Login Button */}
            <div className="w-full">
              <a
                href="/api/auth/google"
                className="w-full bg-[var(--color-bg-base)] hover:bg-[var(--color-accent)] text-[var(--color-text-main)] flex items-center justify-center gap-3 py-3 px-4 rounded-[var(--radius-md)] text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border border-[var(--color-border)] hover:border-[var(--color-primary)] shadow-xs select-none"
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
                <div className="w-full border-t border-[var(--color-border)]" />
              </div>
              <span className="relative px-3 bg-[var(--color-bg-surface)] text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest leading-none">
                or access via passcode
              </span>
            </div>

            <form onSubmit={handleSubmitForm} className="w-full space-y-4 pt-1">
              {/* Sign In vs Register Toggle */}
              <div className="flex border border-[var(--color-border)] bg-[var(--color-bg-base)] p-1 rounded-[var(--radius-md)] w-full relative">
                <button
                  type="button"
                  disabled={isAuthLoading}
                  onClick={() => { setIsRegisterMode(false); setAuthError(''); setEnteredPin(''); }}
                  className={`flex-1 py-1.5 text-center text-[10px] uppercase tracking-wider font-extrabold rounded-[var(--radius-sm)] transition-all duration-200 cursor-pointer ${!isRegisterMode
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] border border-[var(--color-border)] shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                    } disabled:opacity-50`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  disabled={isAuthLoading}
                  onClick={() => { setIsRegisterMode(true); setAuthError(''); setEnteredPin(''); }}
                  className={`flex-1 py-1.5 text-center text-[10px] uppercase tracking-wider font-extrabold rounded-[var(--radius-sm)] transition-all duration-200 cursor-pointer ${isRegisterMode
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] border border-[var(--color-border)] shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                    } disabled:opacity-50`}
                >
                  Register
                </button>
              </div>

              {/* Username Text Input via Design System Component */}
              <Input
                label="Username"
                disabled={isAuthLoading}
                type="text"
                placeholder="e.g. chinmay"
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value)
                  setAuthError('')
                }}
                error={authError ? authError : undefined}
                autoCapitalize="none"
                autoCorrect="off"
              />

              {/* Password / Passcode Input */}
              <div className="w-full space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                    {isRegisterMode ? 'Password (Min 8 Characters)' : 'Password or 4-Digit PIN'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="text-[10px] text-[var(--color-primary)] hover:underline font-semibold cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                <div className="relative w-full">
                  <input
                    ref={pinInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={enteredPin}
                    disabled={isAuthLoading}
                    onChange={(e) => {
                      if (isAuthLoading) return
                      const val = e.target.value
                      setEnteredPin(val)
                      setAuthError('')
                      // For convenience: if exactly 4 numeric digits entered in login mode, auto-submit legacy PIN
                      if (!isRegisterMode && /^\d{4}$/.test(val) && usernameInput.trim().length > 0) {
                        handleAuthSubmit(usernameInput, val)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAuthSubmit(usernameInput, enteredPin)
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] focus:border-[var(--color-primary)] rounded-[var(--radius-md)] text-[var(--color-text-main)] text-sm focus:outline-none transition-colors shadow-xs"
                    placeholder={isRegisterMode ? 'At least 8 characters' : 'Enter password or PIN'}
                    autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  {isRegisterMode 
                    ? 'New accounts require a password with at least 8 characters.'
                    : 'Existing accounts can sign in with their password or legacy 4-digit PIN.'}
                </p>
              </div>

              {/* Submit Action Button using Design System Component */}
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isAuthLoading}
                disabled={
                  isAuthLoading || 
                  usernameInput.trim().length === 0 || 
                  (isRegisterMode ? enteredPin.length < 8 : enteredPin.length === 0)
                }
                className="w-full font-semibold shadow-xs"
              >
                {isRegisterMode ? 'Register Account' : 'Sign In'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <EntitlementProvider>
      <CalendarDataContext.Provider value={{
        calendarData,
        currentUser: user,
        fetchCalendar,
        onOpenCreateActivity,
        onEditTemplate,
        guestPermissions: guestPerms,
        isOwner
      }}>
        <DashboardShell
          activeTab={activeTab}
          onTabChange={changeTab}
          user={user}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={handleOpenSearch}
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
          currentUser={user}
          isOwner={isOwner}
          guestPermissions={guestPerms}
        />

        <MobileSearchModal
          isOpen={isMobileSearchOpen}
          onClose={() => setIsMobileSearchOpen(false)}
          currentUser={user}
          isOwner={isOwner}
          guestPermissions={guestPerms}
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
    </EntitlementProvider>
  )
}
