"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ActivityTemplate } from '@/types'
import { verifyPinAction, registerUserAction, logoutAction } from '@/app/actions/auth'
import { writeQueue } from '@/lib/store/write-queue'
import { requestDeduplicator } from '@/lib/store/requestDeduplicator'
import { ShieldAlert } from 'lucide-react'
import dynamic from 'next/dynamic'
import { DashboardShell } from '@/modules/core/dashboard'
import { getAgendaAction } from '@/modules/sync/google-calendar/actions'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { Button, Modal } from '@/design-system'
import { getTodayDateStr } from '@/lib/recurrence'
import { CalendarCacheService } from '@/modules/calendar/services/CalendarCacheService'
import { clearDayDtoCache } from './DayLogsModal'
import { EntitlementProvider } from '@/lib/context/EntitlementContext'
import { purgeUserStorage } from '@/lib/storage/userStorage'
import type { UserEntitlements } from '@/lib/billing/types'

// Lazy-load heavy global modals only when opened
const CommandPalette = dynamic(
  () => import('./CommandPalette').then(m => m.CommandPalette),
  { ssr: false }
)
const MobileSearchModal = dynamic(
  () => import('./MobileSearchModal').then(m => m.MobileSearchModal),
  { ssr: false }
)
const TemplateModal = dynamic(
  () => import('./TemplateModal').then(m => m.TemplateModal),
  { ssr: false }
)

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
  initialEntitlements?: UserEntitlements | null
  initialGuestPermissions?: Record<string, boolean> | null
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  currentUser = null,
  initialEntitlements = null,
  initialGuestPermissions = null,
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
  const [guestPerms, setGuestPerms] = useState<Record<string, boolean>>(() => initialGuestPermissions || {
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

  // Synchronize initialGuestPermissions if it changes
  useEffect(() => {
    if (initialGuestPermissions) {
      setGuestPerms(initialGuestPermissions)
    }
  }, [initialGuestPermissions])
  const [usernameInput, setUsernameInput] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [enteredPin, setEnteredPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [robotChecked, setRobotChecked] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Fetch guest permissions for non-owner accounts only if missing or upon settings change
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
    if (!initialGuestPermissions) {
      fetchPerms()
    }
    window.addEventListener('personal_settings_changed', fetchPerms)
    return () => window.removeEventListener('personal_settings_changed', fetchPerms)
  }, [user, isOwner, initialGuestPermissions])

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

  // Reset calendar data and migrate storage when authenticated user identity changes
  useEffect(() => {
    setCalendarData({
      connected: false,
      agenda: null,
      error: null,
      loading: false
    })
    if (user?.id) {
      import('@/lib/storage/userStorage').then(({ migrateLegacyUserStorage }) => {
        migrateLegacyUserStorage(user.id)
      }).catch(() => {})
    }
  }, [user?.id])

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
        window.location.replace(res.onboardingRequired ? '/onboarding' : '/')
      } else {
        setIsAuthLoading(false)
        setAuthError(res.error || 'Registration failed')
        setEnteredPin('')
      }
    } else {
      const res = await verifyPinAction(username, pin)
      if (res.success) {
        setIsAuthenticated(true)
        if (res.user) setUser(res.user)
        window.location.replace(res.onboardingRequired ? '/onboarding' : '/')
      } else {
        setIsAuthLoading(false)
        setAuthError(res.error || 'Incorrect username or password/PIN')
        setEnteredPin('')
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

    const openPlaceholder = (title: string, message: string) => {
      setPlaceholderDialog({ isOpen: true, title, message })
    }

    return (
      <main className="min-h-screen bg-white text-zinc-800 flex items-center justify-center px-5 py-10 sm:px-6 relative overflow-hidden">
        <div className="w-full max-w-[610px]">
          <div className="flex justify-center mb-10">
            <button
              type="button"
              onClick={() => {
                const nextTheme = theme === 'dark' ? 'light' : 'dark'
                setTheme(nextTheme)
                localStorage.setItem('theme', nextTheme)
                document.cookie = `theme=${nextTheme}; path=/; max-age=31536000; SameSite=Lax`
              }}
              className="sr-only"
              aria-label="Toggle theme"
            />
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 rounded-full bg-[#ff7557]">
                <div className="absolute left-1.5 top-1.5 h-5 w-5 rounded-full bg-[#f9a68e]" />
                <div className="absolute -bottom-0.5 right-0 h-3.5 w-3.5 rounded-full bg-white" />
              </div>
              <span className="text-[30px] leading-none tracking-[-1.7px] font-semibold text-zinc-800">
                tracker
              </span>
            </div>
          </div>

          <section className="w-full">
            <div className="grid grid-cols-2 border-b border-zinc-200">
              <button
                type="button"
                disabled={isAuthLoading}
                onClick={() => {
                  setIsRegisterMode(false)
                  setAuthError('')
                  setEnteredPin('')
                }}
                className={`h-14 text-[18px] font-medium transition-colors border-b-2 -mb-px ${
                  !isRegisterMode
                    ? 'text-zinc-800 border-zinc-700'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                disabled={isAuthLoading}
                onClick={() => {
                  setIsRegisterMode(true)
                  setAuthError('')
                  setEnteredPin('')
                }}
                className={`h-14 text-[18px] font-medium transition-colors border-b-2 -mb-px ${
                  isRegisterMode
                    ? 'text-zinc-800 border-zinc-700'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                }`}
              >
                Sign up
              </button>
            </div>

            {searchParams?.get('error') === 'unauthorized-account' && (
              <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-semibold block">Access restricted</span>
                <span>
                  {searchParams.get('account')
                    ? `${searchParams.get('account')} is not authorized for this application.`
                    : 'This application is restricted to authorized accounts.'}
                </span>
              </div>
            )}

            <div className="pt-8 space-y-3">
              <a
                href="/api/auth/google"
                className="h-[58px] w-full border border-zinc-300 rounded-[6px] bg-white hover:bg-zinc-50 text-zinc-700 flex items-center justify-center gap-3 text-[17px] font-normal transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              >
                <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Log in with Google
              </a>

              <button
                type="button"
                onClick={() => openPlaceholder(
                  'Outlook login',
                  'Microsoft / Outlook authentication is reserved for a future identity provider integration. The button is intentionally non-functional for now.'
                )}
                className="h-[58px] w-full border border-zinc-300 rounded-[6px] bg-white hover:bg-zinc-50 text-zinc-700 flex items-center justify-center gap-3 text-[17px] font-normal transition-colors"
              >
                <span className="grid h-[18px] w-[18px] grid-cols-2 gap-[1px]" aria-hidden="true">
                  <span className="bg-[#f25022]" />
                  <span className="bg-[#7fba00]" />
                  <span className="bg-[#00a4ef]" />
                  <span className="bg-[#ffb900]" />
                </span>
                Log in with Outlook
              </button>

              <button
                type="button"
                onClick={() => openPlaceholder(
                  'Company SSO',
                  'Enterprise SSO is planned. This entry point will later support company identity providers such as SAML or OIDC. No SSO connection is made yet.'
                )}
                className="h-[58px] w-full border border-zinc-300 rounded-[6px] bg-white hover:bg-zinc-50 text-zinc-700 flex items-center justify-center gap-3 text-[17px] font-normal transition-colors"
              >
                <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 10h1M15 10h1M8 13h1M15 13h1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Log in with SSO
              </button>
            </div>

            <div className="flex items-center gap-4 py-7 text-[15px] text-zinc-400">
              <div className="h-px flex-1 bg-zinc-200" />
              <span>OR</span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <input
                type="email"
                value={usernameInput}
                disabled={isAuthLoading}
                onChange={(e) => {
                  setUsernameInput(e.target.value)
                  setAuthError('')
                }}
                placeholder="jane@company.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                className="h-[58px] w-full rounded-[6px] border border-zinc-300 bg-white px-5 text-[17px] text-zinc-800 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-300 disabled:bg-zinc-50"
              />

              <div className="relative">
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
                  placeholder="password"
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  className="h-[58px] w-full rounded-[6px] border border-zinc-300 bg-white px-5 pr-20 text-[17px] text-zinc-800 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-300 disabled:bg-zinc-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500 hover:text-zinc-800"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {authError && (
                <p className="text-sm text-red-600" role="alert">{authError}</p>
              )}

              <button
                type="submit"
                disabled={
                  isAuthLoading ||
                  !usernameInput.trim() ||
                  !enteredPin ||
                  !robotChecked
                }
                className="h-[58px] w-full rounded-[6px] bg-[#d3d3d3] text-white text-[17px] font-normal transition-colors disabled:cursor-not-allowed enabled:bg-zinc-700 enabled:hover:bg-zinc-800"
              >
                {isAuthLoading ? (isRegisterMode ? 'Creating account...' : 'Logging in...') : (isRegisterMode ? 'Sign up with email' : 'Log in with email')}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between gap-4 text-[14px] text-zinc-500">
              <button
                type="button"
                onClick={() => openPlaceholder(
                  'Password recovery',
                  'Password recovery is reserved for the account recovery flow. This placeholder keeps the entry point ready without pretending recovery is implemented.'
                )}
                className="text-left hover:text-zinc-800 transition-colors"
              >
                Forgot your password?
              </button>
              <button
                type="button"
                onClick={() => openPlaceholder(
                  'Password recovery',
                  'The recovery flow is planned and will be connected to verified email recovery later.'
                )}
                className="text-[#3aa6d8] hover:underline"
              >
                Recover password.
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRobotChecked(prev => !prev)}
              disabled={isAuthLoading}
              className="mt-12 w-full max-w-[420px] mx-auto border border-zinc-300 bg-zinc-50 rounded-[4px] px-4 py-4 flex items-center justify-between text-left hover:bg-zinc-100 transition-colors"
              aria-pressed={robotChecked}
            >
              <span className="flex items-center gap-3">
                <span className={`h-7 w-7 border border-zinc-400 bg-white rounded-sm flex items-center justify-center transition-colors ${
                  robotChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'text-transparent'
                }`}>
                  ✓
                </span>
                <span>
                  <span className="block text-[15px] text-zinc-700">I&apos;m not a robot</span>
                  <span className="block text-[11px] text-zinc-400 mt-0.5">Security check placeholder</span>
                </span>
              </span>
              <span className="text-[10px] text-zinc-400 font-medium text-right">
                CAPTCHA<br/>PLACEHOLDER
              </span>
            </button>
          </section>
        </div>

        {isAuthLoading && (
          <div className="fixed inset-0 bg-white/75 backdrop-blur-[2px] flex flex-col items-center justify-center z-50">
            <div className="h-9 w-9 border-4 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />
            <p className="mt-4 text-xs font-semibold tracking-wide text-zinc-600">
              {isRegisterMode ? 'Creating account...' : 'Logging in...'}
            </p>
          </div>
        )}

        {placeholderDialog && (
          <Modal
            isOpen={placeholderDialog.isOpen}
            onClose={() => setPlaceholderDialog(null)}
            title={placeholderDialog.title}
            size="sm"
          >
            <div className="space-y-4 text-sm">
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                {placeholderDialog.message}
              </p>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setPlaceholderDialog(null)}
                >
                  Understood
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </main>
    )
  }

  return (
    <EntitlementProvider key={currentUser?.id ?? user?.id ?? 'guest'} initialSnapshot={initialEntitlements}>
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
          guestPermissions={guestPerms}
        >
        {children}

        {isTemplateModalOpen && (
          <TemplateModal
            isOpen={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            templateToEdit={templateToEdit}
          />
        )}

        {isCommandPaletteOpen && (
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
        )}

        {isMobileSearchOpen && (
          <MobileSearchModal
            isOpen={isMobileSearchOpen}
            onClose={() => setIsMobileSearchOpen(false)}
            currentUser={user}
            isOwner={isOwner}
            guestPermissions={guestPerms}
          />
        )}

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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setPlaceholderDialog(null)}
                >
                  Understood
                </Button>
              </div>
            </div>
          </Modal>
        )}
        </DashboardShell>
      </CalendarDataContext.Provider>
    </EntitlementProvider>
  )
}
