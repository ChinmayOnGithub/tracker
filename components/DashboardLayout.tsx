"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ActivityTemplate } from '@/types'
import { logoutAction } from '@/app/actions/auth'
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
import { purgeUserStorage, getUserStorageItem, setUserStorageItem } from '@/lib/storage/userStorage'
import { useTheme } from '@/lib/theme'
import { AuthView } from '@/components/auth/AuthView'
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
  const { theme, isDark, toggleTheme } = useTheme()

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

    // Apply personal styles on load
    applyPersonalStyles()

    // Hydrate appearance preferences from server user settings only if not already set locally
    // or if the local value is absent. Never blindly overwrite local changes.
    import('@/app/actions/settings').then(({ getUserSettingsAction }) => {
      getUserSettingsAction().then(res => {
        if (res.success && res.settings?.appearance) {
          const app = res.settings.appearance
          let changed = false
          const localAccent = getUserStorageItem(user?.id ?? null, 'personal_accent_color')
          if (app.accent && !localAccent) {
            setUserStorageItem(user?.id ?? null, 'personal_accent_color', app.accent)
            changed = true
          }
          const localFontSize = getUserStorageItem(user?.id ?? null, 'personal_font_size')
          if (app.fontSize && !localFontSize) {
            setUserStorageItem(user?.id ?? null, 'personal_font_size', app.fontSize)
            changed = true
          }
          const localRounded = getUserStorageItem(user?.id ?? null, 'personal_rounded_corners')
          if (app.rounded && !localRounded) {
            setUserStorageItem(user?.id ?? null, 'personal_rounded_corners', app.rounded)
            changed = true
          }
          const localAnimations = getUserStorageItem(user?.id ?? null, 'personal_animations')
          if (app.animations && !localAnimations) {
            setUserStorageItem(user?.id ?? null, 'personal_animations', app.animations)
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
    const accent = getUserStorageItem(user?.id ?? null, 'personal_accent_color') || 'blue'
    const fontSize = getUserStorageItem(user?.id ?? null, 'personal_font_size') || 'md'
    const rounded = getUserStorageItem(user?.id ?? null, 'personal_rounded_corners') || 'md'
    const animations = getUserStorageItem(user?.id ?? null, 'personal_animations') || 'on'

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
    return (
      <AuthView
        onAuthenticated={(authenticatedUser) => {
          setIsAuthenticated(true)
          setUser(authenticatedUser)
        }}
        errorParam={searchParams?.get('error')}
        accountParam={searchParams?.get('account')}
      />
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
          theme={isDark ? 'dark' : 'light'}
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
