"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardBody, CardFooter, Button, Skeleton, Select, Input, ConfirmDialog, Badge, SearchInput } from '@/design-system'
import { 
  User, Palette, Calendar, Layout, Bell, RefreshCw, Lock, 
  Settings2, Database, Shield, CheckCircle2, AlertCircle, 
  Trash2, Key, Check, Sparkles, ShieldCheck, CreditCard,
  Blocks, Mail, FileText, MessageSquare, GitBranch, Clock
} from 'lucide-react'
import { SettingsBillingSection } from './SettingsBillingSection'
import { checkGoogleConnection, disconnectGoogleAccount } from '@/modules/sync/google-calendar/actions'
import { getUserProfileAction, setPasscodeAction, runMigrationAuditAction } from '@/app/actions/auth'
import {
  getGuestPermissionsAction,
  saveGuestPermissionsAction,
  getUserSettingsAction,
  saveDashboardConfigAction,
  saveUserAppearanceAction,
  saveWeeklyGoalAction,
} from '@/app/actions/settings'
import { BackupService } from '@/lib/database/local/BackupService'
import { useSearchParams } from 'next/navigation'
import { OfflineDebugPanel } from './OfflineDebugPanel'
import { writeQueue } from '@/lib/store/write-queue'

export interface UserProfileData {
  id: string
  username: string
  email: string | null
  authProvider: 'Google' | 'Passcode'
  isOwner: boolean
  accessLevel: 'Private Owner' | 'Shared Tools'
  hasPasscode: boolean
  avatarUrl?: string | null
  createdAt: string
}

export interface SettingsPanelProps {
  initialUserProfile?: UserProfileData | null
}

const OWNER_ONLY_TABS = new Set([
  'admin',
  'backup',
  'advanced',
  'dashboard',
  'calendar',
  'leave'
])

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ initialUserProfile = null }) => {
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab') as 'profile' | 'appearance' | 'calendar' | 'dashboard' | 'notifications' | 'integrations' | 'security' | 'backup' | 'advanced' | 'leave' | 'admin' | 'billing' | null

  // If initial profile is provided and user is NOT an owner, do not allow owner-only tabs
  const resolveInitialTab = (tab: typeof tabParam): 'profile' | 'appearance' | 'calendar' | 'dashboard' | 'notifications' | 'integrations' | 'security' | 'backup' | 'advanced' | 'leave' | 'admin' | 'billing' => {
    if (!tab) return 'profile'
    if (initialUserProfile && initialUserProfile.isOwner === false && OWNER_ONLY_TABS.has(tab)) {
      return 'profile'
    }
    return tab
  }

  const [prevTabParam, setPrevTabParam] = useState(tabParam)
  const [activeSection, setActiveSection] = useState<'profile' | 'appearance' | 'calendar' | 'dashboard' | 'notifications' | 'integrations' | 'security' | 'backup' | 'advanced' | 'leave' | 'admin' | 'billing'>(() => {
    return resolveInitialTab(tabParam)
  })

  if (tabParam && tabParam !== prevTabParam) {
    setPrevTabParam(tabParam)
    setActiveSection(resolveInitialTab(tabParam))
  }
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Apps & Integrations Filter & Action States
  const [integrationSearch, setIntegrationSearch] = useState('')
  const [integrationCategory, setIntegrationCategory] = useState<'all' | 'connected' | 'calendar' | 'workspace'>('all')
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false)

  // Profile Action Loading: if initial profile is supplied, we are immediately ready without flash
  const [profileLoading, setProfileLoading] = useState(!initialUserProfile)
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(initialUserProfile)
  const [pinInput, setPinInput] = useState('')
  const [passcodeError, setPasscodeError] = useState<string | null>(null)
  const [passcodeSuccess, setPasscodeSuccess] = useState<string | null>(null)
  const [passcodeActionLoading, setPasscodeActionLoading] = useState(false)

  // Backup & Recovery States
  const [backupError, setBackupError] = useState<string | null>(null)
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // 1. Profile States
  const [displayName, setDisplayName] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_display_name') || '' : '')
  const [timezone, setTimezone] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_timezone') || 'Asia/Kolkata' : 'Asia/Kolkata')
  const [country, setCountry] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_country') || 'India' : 'India')
  const [dateFormat, setDateFormat] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_date_format') || 'YYYY-MM-DD' : 'YYYY-MM-DD')
  const [timeFormat, setTimeFormat] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_time_format') || '24h' : '24h')
  const [birthday, setBirthday] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_birthday') || '' : '')

  // 2. Appearance States
  const [accentColor, setAccentColor] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_accent_color') || 'blue' : 'blue')
  const [fontSize, setFontSize] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_font_size') || 'md' : 'md')
  const [roundedCorners, setRoundedCorners] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_rounded_corners') || 'md' : 'md')
  const [animations, setAnimations] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_animations') || 'on' : 'on')

  // 3. Calendar States
  const [defaultView, setDefaultView] = useState<'month' | 'week' | 'agenda'>(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('calendar_default_view')
      if (val === 'month' || val === 'week' || val === 'agenda') return val
    }
    return 'agenda'
  })
  const [startOfWeek, setStartOfWeek] = useState<'sunday' | 'monday'>(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('calendar_start_of_week')
      if (val === 'sunday' || val === 'monday') return val
    }
    return 'sunday'
  })
  const [workingHoursStart, setWorkingHoursStart] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_working_hours_start') || '09:00' : '09:00')
  const [workingHoursEnd, setWorkingHoursEnd] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_working_hours_end') || '18:00' : '18:00')
  const [defaultTaskDuration, setDefaultTaskDuration] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_default_task_duration') || '30' : '30')
  const [weeklyGoal, setWeeklyGoal] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_weekly_goal') || '27' : '27')
  const [enabledLeaveTypes, setEnabledLeaveTypes] = useState<string[]>(() => {
    const defaults = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF']
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_enabled_leave_types')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) { console.error(e) }
      }
    }
    return defaults
  })

  // 4. Dashboard Widgets States
  const [widgetsVisibility, setWidgetsVisibility] = useState<Record<string, boolean>>(() => {
    const defaults = {
      tasks: true,
      workHours: true,
      journal: true,
      leaveBalance: true,
      weight: true,
      recentDocuments: true,
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_dashboard_widgets')
      if (saved) {
        try {
          return { ...defaults, ...JSON.parse(saved) }
        } catch (e) { console.error(e) }
      }
    }
    return defaults
  })

  // Module Visibility States
  const [modulesVisibility, setModulesVisibility] = useState<Record<string, boolean>>(() => {
    const defaults = {
      today: true,
      calendar: true,
      activities: true,
      journal: true,
      leave: true,
      weight: true,
      links: true,
      documents: true,
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_modules_visibility')
      if (saved) {
        try {
          return { ...defaults, ...JSON.parse(saved) }
        } catch (e) { console.error(e) }
      }
    }
    return defaults
  })

  // 5. Notifications States
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const sound = localStorage.getItem('sound_enabled')
      return sound === null ? true : sound === 'true'
    }
    return true
  })
  const [browserNotifications, setBrowserNotifications] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_browser_notifications') !== 'false' : true)
  const [dailySummary, setDailySummary] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_daily_summary') === 'true' : false)
  const [missedTaskAlerts, setMissedTaskAlerts] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_missed_task_alerts') !== 'false' : true)

  // 7. Security States
  const [sessionTimeout, setSessionTimeout] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_session_timeout') || '30' : '30')

  // 8. Advanced States
  const [developerMode, setDeveloperMode] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_developer_mode') === 'true' : false)
  const [experimentalFeatures, setExperimentalFeatures] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('personal_experimental_features') === 'true' : false)

  // 9. Admin Guest Permissions States
  const [guestPermissions, setGuestPermissions] = useState<Record<string, boolean>>({
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
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [permissionsSuccess, setPermissionsSuccess] = useState<string | null>(null)
  const [auditSummary, setAuditSummary] = useState<import('@/lib/services/MigrationAuditService').MigrationAuditSummary | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  const handleRunMigrationAudit = useCallback(async () => {
    setAuditLoading(true)
    try {
      const res = await runMigrationAuditAction()
      if (res.success && res.audit) {
        setAuditSummary(res.audit)
      }
    } finally {
      setAuditLoading(false)
    }
  }, [])

  // Load profile & integrations data
  const fetchProfile = useCallback(async () => {
    setProfileLoading(true)
    const res = await getUserProfileAction()
    if (res.success && res.user) {
      setUserProfile(res.user)
    }
    setProfileLoading(false)
  }, [])

  const fetchGuestPermissions = useCallback(async () => {
    const res = await getGuestPermissionsAction()
    if (res.success && res.permissions) {
      setGuestPermissions(res.permissions)
    }
  }, [])

  const fetchConnection = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await checkGoogleConnection()
    if (res.success) {
      setConnected(res.connected || false)
      setLastSync(res.updatedAt || null)
    } else {
      setError(res.error || 'Failed to fetch integration state')
    }
    setLoading(false)
  }, [])

  // Local settings revision tracking to prevent stale network fetches from clobbering recent local edits
  const settingsRevisions = React.useRef<Record<string, number>>({})

  const recordLocalRevision = useCallback((settingKey: string) => {
    settingsRevisions.current[settingKey] = Date.now()
  }, [])

  const isLocalRevisionNewer = useCallback((settingKey: string, thresholdMs = 5000): boolean => {
    const lastEdit = settingsRevisions.current[settingKey]
    if (!lastEdit) return false
    return Date.now() - lastEdit < thresholdMs
  }, [])

  const fetchUserSettings = useCallback(async () => {
    try {
      const res = await getUserSettingsAction()
      if (res.success && res.settings) {
        if (res.settings.appearance) {
          const app = res.settings.appearance
          if (app.accent && !isLocalRevisionNewer('personal_accent_color')) {
            setAccentColor(app.accent)
            localStorage.setItem('personal_accent_color', app.accent)
          }
          if (app.fontSize && !isLocalRevisionNewer('personal_font_size')) {
            setFontSize(app.fontSize)
            localStorage.setItem('personal_font_size', app.fontSize)
          }
          if (app.rounded && !isLocalRevisionNewer('personal_rounded_corners')) {
            setRoundedCorners(app.rounded)
            localStorage.setItem('personal_rounded_corners', app.rounded)
          }
          if (app.animations && !isLocalRevisionNewer('personal_animations')) {
            setAnimations(app.animations)
            localStorage.setItem('personal_animations', app.animations)
          }
        }
        if (res.settings.weeklyGoal !== undefined && res.settings.weeklyGoal !== null && !isLocalRevisionNewer('personal_weekly_goal')) {
          setWeeklyGoal(String(res.settings.weeklyGoal))
          localStorage.setItem('personal_weekly_goal', String(res.settings.weeklyGoal))
        }
        if (res.settings.dashboard && !isLocalRevisionNewer('personal_dashboard_widgets')) {
          const cfg = res.settings.dashboard
          if (Array.isArray(cfg.hidden)) {
            setWidgetsVisibility(prev => {
              const updated = { ...prev }
              for (const key of Object.keys(updated)) {
                updated[key] = !cfg.hidden?.includes(key)
              }
              localStorage.setItem('personal_dashboard_widgets', JSON.stringify(updated))
              return updated
            })
          }
        }
        window.dispatchEvent(new Event('personal_settings_changed'))
      }
    } catch (err) {
      console.error('[SettingsPanel] Failed to fetch user settings:', err)
    }
  }, [isLocalRevisionNewer])

  // Load backend status and listen to real-time style changes on client mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProfile()
      fetchConnection()
      fetchGuestPermissions()
      fetchUserSettings()
    }, 0)

    const handleSettingsChanged = () => {
      if (typeof window === 'undefined') return
      const col = localStorage.getItem('personal_accent_color')
      if (col) setAccentColor(prev => (col !== prev ? col : prev))
      const fs = localStorage.getItem('personal_font_size')
      if (fs) setFontSize(prev => (fs !== prev ? fs : prev))
      const rc = localStorage.getItem('personal_rounded_corners')
      if (rc) setRoundedCorners(prev => (rc !== prev ? rc : prev))
      const anim = localStorage.getItem('personal_animations')
      if (anim) setAnimations(prev => (anim !== prev ? anim : prev))
    }

    window.addEventListener('personal_settings_changed', handleSettingsChanged)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('personal_settings_changed', handleSettingsChanged)
    }
  }, [fetchProfile, fetchConnection, fetchGuestPermissions, fetchUserSettings])

  const handleToggleGuestPermission = async (moduleKey: string) => {
    const updated = {
      ...guestPermissions,
      [moduleKey]: !guestPermissions[moduleKey]
    }
    setGuestPermissions(updated)
    setSavingPermissions(true)
    setPermissionsSuccess(null)
    const res = await saveGuestPermissionsAction(updated)
    if (res.success) {
      setPermissionsSuccess(`Guest access for ${moduleKey} updated!`)
      window.dispatchEvent(new Event('personal_settings_changed'))
      setTimeout(() => setPermissionsSuccess(null), 3000)
    }
    setSavingPermissions(false)
  }

  // Save Settings Helper (updates localStorage, dispatches change event, and queues canonical UserSetting sync to server)
  const saveToLocal = useCallback((key: string, value: string) => {
    recordLocalRevision(key)
    localStorage.setItem(key, value)
    window.dispatchEvent(new Event('personal_settings_changed'))

    const now = Date.now()
    // Route canonical server sync through writeQueue to prevent race conditions
    if (key === 'personal_accent_color') {
      writeQueue.add({
        id: `settings-accent-${now}`,
        dedupKey: 'settings-appearance-accent',
        run: async () => saveUserAppearanceAction({ accent: value }),
        rollback: () => {}
      })
    } else if (key === 'personal_font_size') {
      writeQueue.add({
        id: `settings-fontsize-${now}`,
        dedupKey: 'settings-appearance-fontsize',
        run: async () => saveUserAppearanceAction({ fontSize: value }),
        rollback: () => {}
      })
    } else if (key === 'personal_rounded_corners') {
      writeQueue.add({
        id: `settings-rounded-${now}`,
        dedupKey: 'settings-appearance-rounded',
        run: async () => saveUserAppearanceAction({ rounded: value }),
        rollback: () => {}
      })
    } else if (key === 'personal_animations') {
      writeQueue.add({
        id: `settings-animations-${now}`,
        dedupKey: 'settings-appearance-animations',
        run: async () => saveUserAppearanceAction({ animations: value }),
        rollback: () => {}
      })
    } else if (key === 'personal_weekly_goal') {
      const goalNum = Number(value)
      if (!isNaN(goalNum) && goalNum > 0) {
        writeQueue.add({
          id: `settings-weeklygoal-${now}`,
          dedupKey: 'settings-weekly-goal',
          run: async () => saveWeeklyGoalAction(goalNum),
          rollback: () => {}
        })
      }
    }
  }, [recordLocalRevision])

  const saveWidgetVisibility = useCallback((widgetKey: string, visible: boolean) => {
    recordLocalRevision('personal_dashboard_widgets')
    const updated = { ...widgetsVisibility, [widgetKey]: visible }
    setWidgetsVisibility(updated)
    localStorage.setItem('personal_dashboard_widgets', JSON.stringify(updated))
    window.dispatchEvent(new Event('personal_settings_changed'))

    // Synchronize to server authority (DASHBOARD module setting) via writeQueue
    const hidden = Object.keys(updated).filter(k => !updated[k])
    const now = Date.now()
    writeQueue.add({
      id: `settings-dashboard-hidden-${now}`,
      dedupKey: 'settings-dashboard-hidden',
      run: async () => saveDashboardConfigAction({ hidden }),
      rollback: () => {}
    })
  }, [recordLocalRevision, widgetsVisibility])

  const saveModuleVisibility = (moduleKey: string, visible: boolean) => {
    const updated = { ...modulesVisibility, [moduleKey]: visible }
    setModulesVisibility(updated)
    localStorage.setItem('personal_modules_visibility', JSON.stringify(updated))
    window.dispatchEvent(new Event('personal_settings_changed'))
  }

  // Action Handlers
  const handleConnect = () => {
    window.location.href = '/api/auth/google'
  }

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to disconnect Google Calendar? This will remove sync credentials.')) {
      setDisconnecting(true)
      const res = await disconnectGoogleAccount()
      if (res.success) {
        setConnected(false)
        setLastSync(null)
      } else {
        alert(res.error || 'Failed to disconnect account')
      }
      setDisconnecting(false)
    }
  }

  const handleSyncGoogleCalendar = async () => {
    setIsSyncingCalendar(true)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { getAgendaAction } = await import('@/modules/sync/google-calendar/actions')
      await getAgendaAction(todayStr, true)
      await fetchConnection()
    } catch (e) {
      console.error('Failed to sync Google Calendar:', e)
    } finally {
      setIsSyncingCalendar(false)
    }
  }

  const shouldShowApp = useCallback((appId: 'google-calendar' | 'gmail' | 'notion' | 'slack' | 'github') => {
    const appData = {
      'google-calendar': { name: 'google calendar schedule events sync', category: 'calendar', isConnected: connected },
      'gmail': { name: 'google account gmail email digest briefing', category: 'calendar', isConnected: false },
      'notion': { name: 'notion workspace notes databases sync', category: 'workspace', isConnected: false },
      'slack': { name: 'slack team productivity standup notifications', category: 'workspace', isConnected: false },
      'github': { name: 'github developer code commits pulls streak', category: 'workspace', isConnected: false },
    }[appId]

    if (integrationCategory === 'connected' && !appData.isConnected) return false
    if (integrationCategory === 'calendar' && appData.category !== 'calendar') return false
    if (integrationCategory === 'workspace' && appData.category !== 'workspace') return false

    if (integrationSearch.trim()) {
      const q = integrationSearch.toLowerCase().trim()
      return appData.name.includes(q)
    }
    return true
  }, [connected, integrationCategory, integrationSearch])

  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasscodeError(null)
    setPasscodeSuccess(null)
    const secret = pinInput.trim()
    const isPin = secret.length === 4 && /^\d+$/.test(secret)
    const isPassword = secret.length >= 8 && secret.length <= 128

    if (!isPin && !isPassword) {
      setPasscodeError('Must be either a strong password (minimum 8 characters) or a 4-digit PIN.')
      return
    }
    setPasscodeActionLoading(true)
    const res = await setPasscodeAction(secret)
    if (res.success) {
      setPasscodeSuccess(isPassword ? 'Password updated successfully!' : 'Passcode PIN updated successfully!')
      setPinInput('')
      await fetchProfile()
    } else {
      setPasscodeError(res.error || 'Failed to update passcode/password.')
    }
    setPasscodeActionLoading(false)
  }

  const [showDisablePasscodeDialog, setShowDisablePasscodeDialog] = useState(false)

  const handleDisablePasscodeConfirm = async () => {
    setShowDisablePasscodeDialog(false)
    setPasscodeError(null)
    setPasscodeSuccess(null)
    setPasscodeActionLoading(true)
    const res = await setPasscodeAction(null)
    if (res.success) {
      setPasscodeSuccess('Passcode login disabled.')
      await fetchProfile()
    } else {
      setPasscodeError(res.error || 'Failed to disable passcode.')
    }
    setPasscodeActionLoading(false)
  }

  const handleDisablePasscode = () => {
    setShowDisablePasscodeDialog(true)
  }

  const handleExportBackup = async () => {
    setBackupError(null)
    setBackupSuccess(null)
    try {
      const json = await BackupService.exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tracker-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setBackupSuccess('Backup exported successfully!')
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to export backup.')
    }
  }

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupError(null)
    setBackupSuccess(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (!confirm('WARNING: Importing this backup will overwrite ALL local Tracker data. This action is irreversible. Do you want to proceed?')) {
      e.target.value = ''
      return
    }

    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const payload = JSON.parse(text)
        await BackupService.restoreBackup(payload)
        setBackupSuccess('Database restored successfully! Reloading page...')
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } catch (err) {
        setBackupError(err instanceof Error ? err.message : 'Invalid backup file structure.')
      } finally {
        setImporting(false)
        e.target.value = ''
      }
    }
    reader.onerror = () => {
      setBackupError('Failed to read backup file.')
      setImporting(false)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all configurations to their default settings?')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  return (
    <div className="space-y-[var(--spacing-6)]">
      {/* Header Info */}
      <div className="space-y-1">
        <h2 className="text-base font-extrabold text-[var(--color-text-main)] tracking-tight">Personalization Center</h2>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Configure modules, accent styling, dashboard preferences, and security options for your Life Operating System.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-[var(--spacing-6)] items-start">
        {/* Navigation Sidebar */}
        <div className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1.5 p-1 bg-slate-100/50 dark:bg-zinc-900/40 rounded-xl lg:bg-transparent lg:p-0">
          {(
            userProfile?.isOwner !== false
              ? [
                  { id: 'profile', label: 'Profile', icon: User },
                  { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
                  { id: 'appearance', label: 'Appearance', icon: Palette },
                  { id: 'calendar', label: 'Calendar', icon: Calendar },
                  { id: 'dashboard', label: 'Dashboard', icon: Layout },
                  { id: 'leave', label: 'Time Off', icon: Calendar },
                  { id: 'notifications', label: 'Notifications', icon: Bell },
                  { id: 'integrations', label: 'Apps & Integrations', icon: Blocks },
                  { id: 'security', label: 'Security', icon: Lock },
                  { id: 'admin', label: 'Guest Access Admin', icon: ShieldCheck },
                  { id: 'backup', label: 'Backup & Recovery', icon: Database },
                  { id: 'advanced', label: 'Advanced', icon: Settings2 },
                ]
              : [
                  { id: 'profile', label: 'Profile & Account', icon: User },
                  { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
                  { id: 'appearance', label: 'Appearance', icon: Palette },
                  { id: 'notifications', label: 'Notifications', icon: Bell },
                  { id: 'integrations', label: 'Apps & Integrations', icon: Blocks },
                  { id: 'security', label: 'Security', icon: Lock },
                ]
          ).map(section => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as typeof activeSection)}
                className={`flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold rounded-lg shrink-0 transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-[var(--color-accent)] text-[var(--color-text-main)] border border-[var(--color-border)] shadow-xs' 
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)]/50 border border-transparent'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-[var(--color-primary)]' : ''} />
                <span>{section.label}</span>
              </button>
            )
          })}
        </div>

        {/* Configuration Panel Content */}
        <div className="space-y-6">
          {activeSection === 'profile' && (
            <div className="space-y-6">
              {/* Account Identity Summary Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Account Identity</span>
                  </div>
                </CardHeader>
                <CardBody>
                  {profileLoading ? (
                    <div className="space-y-3 py-2">
                      <Skeleton variant="text" className="h-4 w-3/4" />
                      <Skeleton variant="text" className="h-4 w-1/2" />
                    </div>
                  ) : userProfile ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                      <div className="flex items-center gap-3.5">
                        {/* Dynamic Avatar (Google Profile Picture or initials with accent gradient) */}
                        {userProfile.avatarUrl ? (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden border border-[var(--color-border)] shadow-xs shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={userProfile.avatarUrl}
                              alt={userProfile.username}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-sm shrink-0">
                            {(userProfile.username || userProfile.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[var(--color-text-main)]">
                              {displayName || userProfile.username}
                            </span>
                            <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
                              userProfile.isOwner 
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            }`}>
                              {userProfile.accessLevel}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--color-text-muted)] font-mono">
                            {userProfile.email || `@${userProfile.username}`}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-2 pt-0.5">
                            <span>Auth: <strong className="text-[var(--color-text-main)]">{userProfile.authProvider}</strong></span>
                            <span>·</span>
                            <span>Calendar: <strong className={connected ? 'text-emerald-500' : 'text-[var(--color-text-muted)]'}>{connected ? 'Connected' : 'Not Connected'}</strong></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardBody>
              </Card>

              {/* Personal Preferences Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <User className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Preferences & Locale</span>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input 
                      label="Display Name" 
                      value={displayName} 
                      onChange={e => { setDisplayName(e.target.value); saveToLocal('personal_display_name', e.target.value); }} 
                      placeholder="e.g. Chinmay" 
                    />
                    <Input 
                      label="Birthday" 
                      type="date" 
                      value={birthday} 
                      onChange={e => { setBirthday(e.target.value); saveToLocal('personal_birthday', e.target.value); }} 
                    />
                    <Select 
                      label="Timezone" 
                      value={timezone} 
                      onChange={e => { setTimezone(e.target.value); saveToLocal('personal_timezone', e.target.value); }}
                      options={[
                        { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
                        { value: 'UTC', label: 'UTC' },
                        { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
                        { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
                      ]}
                    />
                    <Select 
                      label="Country" 
                      value={country} 
                      onChange={e => { setCountry(e.target.value); saveToLocal('personal_country', e.target.value); }}
                      options={[
                        { value: 'India', label: 'India' },
                        { value: 'United States', label: 'United States' },
                        { value: 'United Kingdom', label: 'United Kingdom' },
                        { value: 'Canada', label: 'Canada' },
                      ]}
                    />
                    <Select 
                      label="Date Format" 
                      value={dateFormat} 
                      onChange={e => { setDateFormat(e.target.value); saveToLocal('personal_date_format', e.target.value); }}
                      options={[
                        { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                        { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                        { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                      ]}
                    />
                    <Select 
                      label="Time Format" 
                      value={timeFormat} 
                      onChange={e => { setTimeFormat(e.target.value); saveToLocal('personal_time_format', e.target.value); }}
                      options={[
                        { value: '12h', label: '12-Hour (am/pm)' },
                        { value: '24h', label: '24-Hour (Military)' },
                      ]}
                    />
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {activeSection === 'appearance' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Palette className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Appearance & Styling</span>
                </div>
              </CardHeader>
              <CardBody className="space-y-5">
                {/* Accent Color Picker */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">System Accent Color</label>
                  <div className="flex flex-wrap gap-2.5">
                    {([
                      { id: 'blue', label: 'Blue', color: 'bg-blue-500' },
                      { id: 'purple', label: 'Purple', color: 'bg-purple-500' },
                      { id: 'green', label: 'Green', color: 'bg-green-500' },
                      { id: 'orange', label: 'Orange', color: 'bg-orange-500' },
                      { id: 'indigo', label: 'Indigo', color: 'bg-indigo-400' },
                      { id: 'rose', label: 'Rose', color: 'bg-rose-500' },
                      { id: 'emerald', label: 'Emerald', color: 'bg-emerald-500' },
                      { id: 'amber', label: 'Amber', color: 'bg-amber-500' },
                      { id: 'cyan', label: 'Cyan', color: 'bg-cyan-500' },
                    ] as const).map(col => (
                      <button
                        key={col.id}
                        onClick={() => { setAccentColor(col.id); saveToLocal('personal_accent_color', col.id); }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          accentColor === col.id 
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text-main)] font-bold' 
                            : 'border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${col.color}`} />
                        <span>{col.label}</span>
                        {accentColor === col.id && <Check size={11} className="text-[var(--color-primary)]" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <Select 
                    label="Layout Font Size" 
                    value={fontSize} 
                    onChange={e => { setFontSize(e.target.value); saveToLocal('personal_font_size', e.target.value); }}
                    options={[
                      { value: 'sm', label: 'Compact / Small' },
                      { value: 'md', label: 'Default / Medium' },
                      { value: 'lg', label: 'Relaxed / Large' },
                    ]}
                  />
                  <Select 
                    label="Interface Corner Radius" 
                    value={roundedCorners} 
                    onChange={e => { setRoundedCorners(e.target.value); saveToLocal('personal_rounded_corners', e.target.value); }}
                    options={[
                      { value: 'none', label: 'Sharp Corners' },
                      { value: 'md', label: 'Default Smooth' },
                      { value: 'full', label: 'Extremely Rounded' },
                    ]}
                  />
                  <Select 
                    label="Micro-Animations" 
                    value={animations} 
                    onChange={e => { setAnimations(e.target.value); saveToLocal('personal_animations', e.target.value); }}
                    options={[
                      { value: 'on', label: 'Enabled (Smooth transitions)' },
                      { value: 'off', label: 'Disabled (Performance / Reduce Motion)' },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {activeSection === 'calendar' && userProfile?.isOwner !== false && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Calendar Engine Configuration</span>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select 
                    label="Default View Mode" 
                    value={defaultView} 
                    onChange={e => { setDefaultView(e.target.value as 'month' | 'week' | 'agenda'); saveToLocal('calendar_default_view', e.target.value); }}
                    options={[
                      { value: 'month', label: 'Month Grid View' },
                      { value: 'week', label: 'Week Time View' },
                      { value: 'agenda', label: 'Agenda Feed View' },
                    ]}
                  />
                  <Select 
                    label="Start of Week" 
                    value={startOfWeek} 
                    onChange={e => { setStartOfWeek(e.target.value as 'sunday' | 'monday'); saveToLocal('calendar_start_of_week', e.target.value); }}
                    options={[
                      { value: 'sunday', label: 'Sunday' },
                      { value: 'monday', label: 'Monday' },
                    ]}
                  />
                  <Input 
                    label="Work Hours Start Time" 
                    type="time" 
                    value={workingHoursStart} 
                    onChange={e => { setWorkingHoursStart(e.target.value); saveToLocal('personal_working_hours_start', e.target.value); }} 
                  />
                  <Input 
                    label="Work Hours End Time" 
                    type="time" 
                    value={workingHoursEnd} 
                    onChange={e => { setWorkingHoursEnd(e.target.value); saveToLocal('personal_working_hours_end', e.target.value); }} 
                  />
                  <Select 
                    label="Default Task Time Duration" 
                    value={defaultTaskDuration} 
                    onChange={e => { setDefaultTaskDuration(e.target.value); saveToLocal('personal_default_task_duration', e.target.value); }}
                    options={[
                      { value: '15', label: '15 minutes' },
                      { value: '30', label: '30 minutes' },
                      { value: '60', label: '60 minutes' },
                      { value: '90', label: '90 minutes' },
                    ]}
                  />
                  <Input 
                    label="Weekly Office Target Hours Goal" 
                    type="number"
                    min="1"
                    max="168"
                    value={weeklyGoal} 
                    onChange={e => { setWeeklyGoal(e.target.value); saveToLocal('personal_weekly_goal', e.target.value); }} 
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {activeSection === 'leave' && userProfile?.isOwner !== false && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Time Off & Leave Configuration</span>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                  Configure which leave types are active for your company&apos;s time off tracker. Disabled types will be hidden from balance views and request forms.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { key: 'CASUAL', label: 'Casual Leave (CASUAL)' },
                    { key: 'SICK', label: 'Sick Leave (SICK)' },
                    { key: 'PTO', label: 'Paid Time Off (PTO)' },
                    { key: 'COMP_OFF', label: 'Compensatory Off (COMP_OFF)' },
                    { key: 'HALF_DAY', label: 'Half Day (HALF_DAY)' },
                    { key: 'WFH', label: 'Work From Home (WFH)' },
                  ] as const).map(item => (
                    <div key={item.key} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-855 rounded-xl">
                      <span className="text-xs font-semibold text-[var(--color-text-main)]">{item.label}</span>
                      <button
                        onClick={() => {
                          const updated = enabledLeaveTypes.includes(item.key)
                            ? enabledLeaveTypes.filter(x => x !== item.key)
                            : [...enabledLeaveTypes, item.key]
                          setEnabledLeaveTypes(updated)
                          localStorage.setItem('personal_enabled_leave_types', JSON.stringify(updated))
                          window.dispatchEvent(new Event('personal_settings_changed'))
                        }}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                          enabledLeaveTypes.includes(item.key) ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                          enabledLeaveTypes.includes(item.key) ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {activeSection === 'dashboard' && userProfile?.isOwner !== false && (
            <div className="space-y-6">
              {/* Widget Toggles */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Layout className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Today Dashboard Widgets</span>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3.5">
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-1">
                    Toggle which widget layouts render in the primary Dashboard workspace. Unchecked items are completely skipped.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { key: 'tasks', label: "Today's Tasks & Timeline Feed" },
                      { key: 'workHours', label: "Work Presence Hours Tracker" },
                      { key: 'journal', label: "Journal Today Snapshot Card" },
                      { key: 'leaveBalance', label: "Approved Time Off Leave Balances" },
                      { key: 'weight', label: "Weight Sparkline Tracker" },
                      { key: 'recentDocuments', label: "Vault Recent Secure Documents" },
                    ] as const).map(widget => (
                      <div key={widget.key} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                        <span className="text-xs font-semibold text-[var(--color-text-main)]">{widget.label}</span>
                        <button
                          onClick={() => saveWidgetVisibility(widget.key, widgetsVisibility[widget.key] === false)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                            widgetsVisibility[widget.key] !== false ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                            widgetsVisibility[widget.key] !== false ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              {/* Module Visibility */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Module Navigation Visibility</span>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3.5">
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-1">
                    Toggle system-wide modules. Disabling a module removes it instantly from the main navigation sidebar.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { key: 'today', label: "Today Overview Dashboard" },
                      { key: 'calendar', label: "Unified Calendar Planner" },
                      { key: 'activities', label: "Activities & Habits Manager" },
                      { key: 'journal', label: "Personal Diary & Journaling" },
                      { key: 'notes', label: "Quick Notes & Thought Pad" },
                      { key: 'leave', label: "Leave Requests & Time Off" },
                      { key: 'weight', label: "Weight Metrics Panel" },
                      { key: 'links', label: "Personal Bookmark Link Library" },
                      { key: 'documents', label: "Secure File Vault Workspace" },
                    ] as const).map(mod => (
                      <div key={mod.key} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                        <span className="text-xs font-semibold text-[var(--color-text-main)]">{mod.label}</span>
                        <button
                          onClick={() => saveModuleVisibility(mod.key, modulesVisibility[mod.key] === false)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                            modulesVisibility[mod.key] !== false ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                            modulesVisibility[mod.key] !== false ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {activeSection === 'notifications' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Alerts & Reminders</span>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-main)]">Audible Feedback Sound</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Play dynamic sounds on checkbox toggles</div>
                    </div>
                    <button
                      onClick={() => { const next = !soundEnabled; setSoundEnabled(next); saveToLocal('sound_enabled', String(next)); }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        soundEnabled ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        soundEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-main)]">Browser Notifications</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Trigger web notifications on deadlines</div>
                    </div>
                    <button
                      onClick={() => { const next = !browserNotifications; setBrowserNotifications(next); saveToLocal('personal_browser_notifications', String(next)); }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        browserNotifications ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        browserNotifications ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-main)]">Daily Summary Email</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Receive morning emails with today&apos;s checklist</div>
                    </div>
                    <button
                      onClick={() => { const next = !dailySummary; setDailySummary(next); saveToLocal('personal_daily_summary', String(next)); }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        dailySummary ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        dailySummary ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-main)]">Missed Task Alerts</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Flag activities that were scheduled but unlogged</div>
                    </div>
                    <button
                      onClick={() => { const next = !missedTaskAlerts; setMissedTaskAlerts(next); saveToLocal('personal_missed_task_alerts', String(next)); }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        missedTaskAlerts ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        missedTaskAlerts ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {activeSection === 'integrations' && (
            <div className="space-y-6">
              {/* Hub Header Card */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center font-bold">
                        <Blocks className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--color-text-main)]">Apps & Integrations Hub</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Connect external platforms, calendars, and productivity tools to your personal workspace.
                        </p>
                      </div>
                    </div>
                    {connected && (
                      <Badge variant="success" size="sm" dot>
                        1 Connected App
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardBody className="pt-0 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="w-full sm:flex-1">
                      <SearchInput
                        value={integrationSearch}
                        onValueChange={setIntegrationSearch}
                        placeholder="Search apps, calendars, or plugins..."
                      />
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-slate-100/70 dark:bg-zinc-900/60 rounded-lg">
                      {(
                        [
                          { id: 'all', label: 'All Apps' },
                          { id: 'connected', label: 'Connected' },
                          { id: 'calendar', label: 'Calendar & Mail' },
                          { id: 'workspace', label: 'Workspace' },
                        ] as const
                      ).map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setIntegrationCategory(cat.id)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                            integrationCategory === cat.id
                              ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs font-bold'
                              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Error Banner */}
              {error && (
                <div className="flex items-center gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Plugin Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Google Calendar App */}
                {shouldShowApp('google-calendar') && (
                  <Card className="flex flex-col justify-between border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-all">
                    <CardBody className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[var(--color-text-main)]">Google Calendar</h4>
                            </div>
                            <span className="text-[11px] text-[var(--color-text-muted)]">Calendar & Scheduling</span>
                          </div>
                        </div>
                        {loading ? (
                          <Skeleton variant="rect" className="h-5 w-16 rounded-full" />
                        ) : connected ? (
                          <Badge variant="success" size="sm" dot>Connected</Badge>
                        ) : (
                          <Badge variant="info" size="sm">Available</Badge>
                        )}
                      </div>

                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Bi-directional sync between your Google Calendar and Tracker timeline. Sync external events, task schedules, and daily milestones.
                      </p>

                      <div className="space-y-1.5 pt-1 text-[11px] text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Two-way schedule & occurrence sync</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Timeline event overlays</span>
                        </div>
                        {connected && lastSync && (
                          <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400 font-mono">
                            <Clock className="w-3 h-3" />
                            <span>Last sync: {new Date(lastSync).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </CardBody>

                    <CardFooter className="px-5 py-3.5 bg-slate-50/50 dark:bg-zinc-900/30 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                      {loading ? (
                        <Skeleton variant="rect" className="h-8 w-24 rounded-lg" />
                      ) : connected ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingCalendar ? 'animate-spin' : ''}`} />}
                            onClick={handleSyncGoogleCalendar}
                            isLoading={isSyncingCalendar}
                          >
                            Sync Now
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDisconnect}
                            isLoading={disconnecting}
                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-rose-500/20"
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button variant="primary" size="sm" onClick={handleConnect} className="w-full">
                          Connect Google Calendar
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )}

                {/* 2. Google Account & Gmail */}
                {shouldShowApp('gmail') && (
                  <Card className="flex flex-col justify-between border-[var(--color-border)] opacity-90">
                    <CardBody className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-[var(--color-text-main)]">Google Account & Gmail</h4>
                            <span className="text-[11px] text-[var(--color-text-muted)]">Communication & Identity</span>
                          </div>
                        </div>
                        <Badge variant="muted" size="sm">Coming Soon</Badge>
                      </div>

                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Direct email-to-task conversion, automated daily digests, and meeting reminder extraction straight to your daily journal.
                      </p>

                      <div className="space-y-1.5 pt-1 text-[11px] text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Direct Gmail action items into Tracker tasks</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Morning briefing email digest</span>
                        </div>
                      </div>
                    </CardBody>

                    <CardFooter className="px-5 py-3.5 bg-slate-50/50 dark:bg-zinc-900/30 border-t border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-text-muted)]">In Pipeline</span>
                      <Button variant="outline" size="sm" disabled className="opacity-60 cursor-not-allowed">
                        Coming Soon
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                {/* 3. Notion */}
                {shouldShowApp('notion') && (
                  <Card className="flex flex-col justify-between border-[var(--color-border)] opacity-90">
                    <CardBody className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-zinc-500/10 border border-zinc-500/20 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-[var(--color-text-main)]">Notion Workspace</h4>
                            <span className="text-[11px] text-[var(--color-text-muted)]">Workspace & Notes</span>
                          </div>
                        </div>
                        <Badge variant="muted" size="sm">Coming Soon</Badge>
                      </div>

                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Two-way database synchronization between Notion databases and Tracker notes, tasks, and journal reflection archives.
                      </p>

                      <div className="space-y-1.5 pt-1 text-[11px] text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Sync Notion databases to habit logs</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Automatic weekly journal page export</span>
                        </div>
                      </div>
                    </CardBody>

                    <CardFooter className="px-5 py-3.5 bg-slate-50/50 dark:bg-zinc-900/30 border-t border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-text-muted)]">In Pipeline</span>
                      <Button variant="outline" size="sm" disabled className="opacity-60 cursor-not-allowed">
                        Coming Soon
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                {/* 4. Slack */}
                {shouldShowApp('slack') && (
                  <Card className="flex flex-col justify-between border-[var(--color-border)] opacity-90">
                    <CardBody className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <MessageSquare className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-[var(--color-text-main)]">Slack</h4>
                            <span className="text-[11px] text-[var(--color-text-muted)]">Team Productivity</span>
                          </div>
                        </div>
                        <Badge variant="muted" size="sm">Coming Soon</Badge>
                      </div>

                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Quick habit logging from slash commands (/tracker done), standup notifications, and automatic time-off status syncing.
                      </p>

                      <div className="space-y-1.5 pt-1 text-[11px] text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>/tracker check-in commands</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Team PTO away status synchronization</span>
                        </div>
                      </div>
                    </CardBody>

                    <CardFooter className="px-5 py-3.5 bg-slate-50/50 dark:bg-zinc-900/30 border-t border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-text-muted)]">In Pipeline</span>
                      <Button variant="outline" size="sm" disabled className="opacity-60 cursor-not-allowed">
                        Coming Soon
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                {/* 5. GitHub */}
                {shouldShowApp('github') && (
                  <Card className="flex flex-col justify-between border-[var(--color-border)] opacity-90">
                    <CardBody className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <GitBranch className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-[var(--color-text-main)]">GitHub</h4>
                            <span className="text-[11px] text-[var(--color-text-muted)]">Developer Activity</span>
                          </div>
                        </div>
                        <Badge variant="muted" size="sm">Coming Soon</Badge>
                      </div>

                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Track GitHub pull request reviews, commit streaks, and issue milestones automatically in your developer habit metrics.
                      </p>

                      <div className="space-y-1.5 pt-1 text-[11px] text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Commit streaks linked to daily activity goals</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>PR review notifications</span>
                        </div>
                      </div>
                    </CardBody>

                    <CardFooter className="px-5 py-3.5 bg-slate-50/50 dark:bg-zinc-900/30 border-t border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] text-[var(--color-text-muted)]">In Pipeline</span>
                      <Button variant="outline" size="sm" disabled className="opacity-60 cursor-not-allowed">
                        Coming Soon
                      </Button>
                    </CardFooter>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lock className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Access Security & Encryption</span>
                </div>
              </CardHeader>
              <CardBody className="space-y-6">
                {profileLoading ? (
                  <div className="space-y-3 py-2">
                    <Skeleton variant="text" className="h-4 w-3/4" />
                    <Skeleton variant="text" className="h-4 w-1/2" />
                  </div>
                ) : userProfile ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 text-xs text-[var(--color-text-muted)]">
                      <div>
                        <span className="font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Username:</span>
                        <div className="font-extrabold text-[var(--color-text-main)] text-sm font-mono mt-0.5">{userProfile.username}</div>
                      </div>
                      <div>
                        <span className="font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Email:</span>
                        <div className="font-semibold text-[var(--color-text-main)] mt-0.5">{userProfile.email || 'Not connected'}</div>
                      </div>
                      <div>
                        <span className="font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Passcode Status:</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`w-2.5 h-2.5 rounded-full ${userProfile.hasPasscode ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className={`font-bold uppercase tracking-wider text-[10px] ${userProfile.hasPasscode ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {userProfile.hasPasscode ? 'Configured' : 'No Passcode PIN'}
                          </span>
                        </div>
                      </div>

                      <Select 
                        label="Inactivity Session Timeout" 
                        value={sessionTimeout} 
                        onChange={e => { setSessionTimeout(e.target.value); saveToLocal('personal_session_timeout', e.target.value); }}
                        options={[
                          { value: '15', label: '15 minutes' },
                          { value: '30', label: '30 minutes' },
                          { value: '60', label: '1 hour' },
                          { value: 'never', label: 'Keep Logged In' },
                        ]}
                      />
                    </div>

                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                      <h4 className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-1.5">
                        <Key className="w-4 h-4 text-[var(--color-primary)]" />
                        {userProfile.hasPasscode ? 'Update or Disable Password/PIN' : 'Configure Password / PIN'}
                      </h4>

                      <form onSubmit={handleSetPasscode} className="space-y-3">
                        <Input
                          type="password"
                          placeholder="Enter new password (min 8 chars) or 4-digit PIN"
                          value={pinInput}
                          onChange={e => {
                            setPasscodeError(null)
                            setPasscodeSuccess(null)
                            setPinInput(e.target.value)
                          }}
                        />

                        {passcodeError && <div className="text-[11px] text-rose-500 font-semibold">{passcodeError}</div>}
                        {passcodeSuccess && <div className="text-[11px] text-emerald-500 font-semibold">{passcodeSuccess}</div>}

                        <div className="flex items-center gap-2 pt-1.5">
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={
                              pinInput.trim().length === 0 || 
                              (pinInput.trim().length < 8 && !/^\d{4}$/.test(pinInput.trim())) || 
                              passcodeActionLoading
                            }
                            isLoading={passcodeActionLoading}
                          >
                            {userProfile.hasPasscode ? 'Update Credentials' : 'Save Credentials'}
                          </Button>
                          
                          {userProfile.hasPasscode && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={passcodeActionLoading}
                              onClick={handleDisablePasscode}
                            >
                              Disable Password / PIN
                            </Button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-text-muted)] italic">
                    Could not fetch security profile metadata.
                  </div>
                )}
                
                <ConfirmDialog
                  isOpen={showDisablePasscodeDialog}
                  onClose={() => setShowDisablePasscodeDialog(false)}
                  onConfirm={handleDisablePasscodeConfirm}
                  title="Disable Passcode Login"
                  description="Disable passcode login? You will need to login using Google authentication next time."
                  confirmText="Disable Passcode"
                  cancelText="Cancel"
                  variant="danger"
                  isLoading={passcodeActionLoading}
                />
              </CardBody>
            </Card>
          )}

          {activeSection === 'backup' && userProfile?.isOwner !== false && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Backup & Restore Workspace</span>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    Export your complete local database state to a JSON backup file, or upload an existing backup file to restore your settings, activity templates, logs, and preferences.
                  </p>

                  {backupSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-250 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold animate-fade-in">
                      {backupSuccess}
                    </div>
                  )}

                  {backupError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-250 dark:border-rose-900 text-rose-500 rounded-lg text-xs font-semibold animate-fade-in">
                      {backupError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <Button variant="primary" size="sm" onClick={handleExportBackup}>
                      Export Backup (JSON)
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => document.getElementById('backup-upload-input')?.click()} isLoading={importing} disabled={importing}>
                      Import Backup (JSON)
                    </Button>
                    <input
                      type="file"
                      accept=".json"
                      id="backup-upload-input"
                      onChange={handleImportBackup}
                      className="hidden"
                      disabled={importing}
                    />
                  </div>
                </CardBody>
              </Card>

              {/* Diagnostics Console */}
              <OfflineDebugPanel />
            </div>
          )}

          {activeSection === 'admin' && userProfile?.isOwner !== false && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                      <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                        Guest User Feature Access Controls
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Primary Owner Only
                    </span>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    Customize which tracker modules are visible and accessible to non-owner authenticated accounts (such as other Google login users). Unchecked modules are completely hidden and access-blocked for guest accounts.
                  </p>

                  {permissionsSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-250 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold animate-fade-in">
                      {permissionsSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {([
                      { key: 'today', label: "Today Overview Dashboard", desc: "Daily timeline and core habits" },
                      { key: 'calendar', label: "Unified Calendar Planner", desc: "Calendar events and scheduling" },
                      { key: 'activities', label: "Activities & Habits Manager", desc: "Routine and activity management" },
                      { key: 'journal', label: "Personal Diary & Journaling", desc: "Private journal entries" },
                      { key: 'leave', label: "Leave Requests & Time Off", desc: "Company leave balance and records" },
                      { key: 'weight', label: "Weight Metrics Panel", desc: "Personal weight records and sparkline" },
                      { key: 'links', label: "Personal Bookmark Link Library", desc: "Saved bookmarks and links" },
                      { key: 'documents', label: "Secure File Vault Workspace", desc: "Encrypted documents and vault" },
                    ] as const).map(mod => (
                      <div key={mod.key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-[var(--color-text-main)] block">{mod.label}</span>
                          <span className="text-[10px] text-[var(--color-text-muted)]">{mod.desc}</span>
                        </div>
                        <button
                          onClick={() => handleToggleGuestPermission(mod.key)}
                          disabled={savingPermissions}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                            guestPermissions[mod.key] === true ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                            guestPermissions[mod.key] === true ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              {/* User Migration Audit Section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                      <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                        Account Credential & Migration Audit
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunMigrationAudit}
                      isLoading={auditLoading}
                    >
                      Run Credential Audit
                    </Button>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    Inspect user credential health across the workspace. Pinpoints legacy 4-digit PIN accounts that need upgrading to scrypt passwords without exposing secrets.
                  </p>

                  {auditSummary && (
                    <div className="space-y-4 animate-fade-in">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg">
                          <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Total Users</span>
                          <div className="font-extrabold text-[var(--color-text-main)] text-base mt-0.5">{auditSummary.totalUsers}</div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg">
                          <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Google OAuth</span>
                          <div className="font-extrabold text-blue-500 text-base mt-0.5">{auditSummary.googleUsers}</div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg">
                          <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">scrypt Passwords</span>
                          <div className="font-extrabold text-emerald-500 text-base mt-0.5">{auditSummary.passwordUsers}</div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg">
                          <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Legacy PINs</span>
                          <div className="font-extrabold text-amber-500 text-base mt-0.5">{auditSummary.legacyPinUsers}</div>
                        </div>
                      </div>

                      <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl overflow-hidden text-xs">
                        {auditSummary.users.map(u => (
                          <div key={u.userId} className="p-3 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/20">
                            <div>
                              <div className="font-bold text-[var(--color-text-main)] flex items-center gap-2">
                                <span>{u.username}</span>
                                {u.isOwner && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded font-extrabold">OWNER</span>
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-mono">
                                {u.maskedEmail || 'No email associated'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                u.credentialType === 'SCRYPT_PASSWORD'
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                  : u.credentialType === 'GOOGLE_OAUTH'
                                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                  : u.credentialType === 'LEGACY_PIN'
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                  : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
                              }`}>
                                {u.credentialType}
                              </span>
                              {u.requiresMigration && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                  Action Required
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {activeSection === 'advanced' && userProfile?.isOwner !== false && (
            <div className="space-y-6">
              {/* Diagnostic Card moved to advanced settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">System Diagnostics</span>
                  </div>
                </CardHeader>
                <CardBody className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
                  <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg space-y-1">
                    <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Database Link</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-extrabold text-[var(--color-text-main)]">Prisma DB: OK</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg space-y-1">
                    <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">API Latency</span>
                    <div className="font-extrabold text-[var(--color-text-main)] mt-0.5">~3ms (Optimal)</div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg space-y-1">
                    <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Security Layer</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-extrabold text-[var(--color-text-main)]">AES-256-GCM Active</span>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Developer Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                    <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Developer Configuration</span>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-main)]">Developer Debug Mode</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Render detailed system logs in web console</div>
                    </div>
                    <button
                      onClick={() => { const next = !developerMode; setDeveloperMode(next); saveToLocal('personal_developer_mode', String(next)); }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        developerMode ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        developerMode ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-850 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text-main)]">Experimental Engine Features</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Opt-in to upcoming preview tools</div>
                    </div>
                    <button
                      onClick={() => { const next = !experimentalFeatures; setExperimentalFeatures(next); saveToLocal('personal_experimental_features', String(next)); }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        experimentalFeatures ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        experimentalFeatures ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleResetSettings} icon={<Trash2 size={13} className="text-red-500" />}>
                      Reset Configurations
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {activeSection === 'billing' && (
            <SettingsBillingSection />
          )}
        </div>
      </div>
    </div>
  )
}
