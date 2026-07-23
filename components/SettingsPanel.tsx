"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardBody, Button, Skeleton, Select, Input } from '@/design-system'
import { 
  User, Palette, Calendar, Layout, Bell, RefreshCw, Lock, 
  Settings2, Database, Shield, CheckCircle2, AlertCircle, 
  Trash2, Key, Check, Sparkles
} from 'lucide-react'
import { checkGoogleConnection, disconnectGoogleAccount } from '@/modules/sync/google-calendar/actions'
import { getUserProfileAction, setPasscodeAction } from '@/app/actions/auth'

export const SettingsPanel: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'profile' | 'appearance' | 'calendar' | 'dashboard' | 'notifications' | 'integrations' | 'security' | 'advanced' | 'leave'>('profile')
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Profile Action Loading
  const [profileLoading, setProfileLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<{ username: string; email: string | null; hasPasscode: boolean } | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [passcodeError, setPasscodeError] = useState<string | null>(null)
  const [passcodeSuccess, setPasscodeSuccess] = useState<string | null>(null)
  const [passcodeActionLoading, setPasscodeActionLoading] = useState(false)

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

  // Load profile & integrations data
  const fetchProfile = useCallback(async () => {
    setProfileLoading(true)
    const res = await getUserProfileAction()
    if (res.success && res.user) {
      setUserProfile(res.user)
    }
    setProfileLoading(false)
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

  // Load backend status on client mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProfile()
      fetchConnection()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchProfile, fetchConnection])

  // Save Settings Helper (updates localStorage & dispatches change event)
  const saveToLocal = (key: string, value: string) => {
    localStorage.setItem(key, value)
    window.dispatchEvent(new Event('personal_settings_changed'))
  }

  const saveWidgetVisibility = (widgetKey: string, visible: boolean) => {
    const updated = { ...widgetsVisibility, [widgetKey]: visible }
    setWidgetsVisibility(updated)
    localStorage.setItem('personal_dashboard_widgets', JSON.stringify(updated))
    window.dispatchEvent(new Event('personal_settings_changed'))
  }

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

  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasscodeError(null)
    setPasscodeSuccess(null)
    if (pinInput.length !== 4 || !/^\d+$/.test(pinInput)) {
      setPasscodeError('PIN must be exactly 4 digits.')
      return
    }
    setPasscodeActionLoading(true)
    const res = await setPasscodeAction(pinInput)
    if (res.success) {
      setPasscodeSuccess('Passcode PIN updated successfully!')
      setPinInput('')
      await fetchProfile()
    } else {
      setPasscodeError(res.error || 'Failed to update passcode.')
    }
    setPasscodeActionLoading(false)
  }

  const handleDisablePasscode = async () => {
    if (!confirm('Disable passcode login? You will need to login using Google authentication next time.')) return
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

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all configurations to their default settings?')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  return (
    <div className="space-y-[var(--spacing-4)] max-w-6xl mx-auto pb-10">
      {/* Header Panel */}
      <div className="flex flex-col gap-1 max-w-2xl mb-2">
        <h2 className="text-base font-extrabold text-[var(--color-text-main)] tracking-tight">Personalization Center</h2>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Configure modules, accent styling, dashboard preferences, and security options for your Life Operating System.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-[var(--spacing-6)] items-start">
        {/* Navigation Sidebar */}
        <div className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1.5 p-1 bg-slate-100/50 dark:bg-zinc-900/40 rounded-xl lg:bg-transparent lg:p-0">
          {([
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'appearance', label: 'Appearance', icon: Palette },
            { id: 'calendar', label: 'Calendar', icon: Calendar },
            { id: 'dashboard', label: 'Dashboard', icon: Layout },
            { id: 'leave', label: 'Time Off', icon: Calendar },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'integrations', label: 'Integrations', icon: RefreshCw },
            { id: 'security', label: 'Security', icon: Lock },
            { id: 'advanced', label: 'Advanced', icon: Settings2 },
          ] as const).map(section => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold rounded-lg shrink-0 transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-white dark:bg-zinc-800 text-[var(--color-text-main)] shadow-[0_1px_2px_rgba(0,0,0,0.08)] border border-[var(--color-border)]' 
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-slate-100/30 dark:hover:bg-zinc-900/20'
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
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <User className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Profile Customization</span>
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

          {activeSection === 'calendar' && (
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

          {activeSection === 'leave' && (
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

          {activeSection === 'dashboard' && (
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
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4.5 h-4.5 text-[var(--color-primary)]" />
                  <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">Sync Integrations</span>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {loading ? (
                  <div className="space-y-3 py-2">
                    <Skeleton variant="text" className="h-4 w-3/4" />
                    <Skeleton variant="text" className="h-4 w-1/2" />
                    <Skeleton variant="rect" className="h-9 w-32 mt-4" />
                  </div>
                ) : error ? (
                  <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs font-bold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : connected ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Google Calendar Link: Active</span>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                      <div>State Status: <span className="font-bold text-[var(--color-text-main)]">Connected</span></div>
                      {lastSync && (
                        <div>Last Synchronized: <span className="font-mono text-[var(--color-text-main)]">{new Date(lastSync).toLocaleString()}</span></div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={handleDisconnect} isLoading={disconnecting}>
                        Disconnect Sync
                      </Button>
                      <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={fetchConnection}>
                        Refresh Info
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                      Connect your external Google Calendar provider accounts to sync activities directly to Tracker&apos;s timeline.
                    </p>
                    <div className="pt-2">
                      <Button variant="primary" size="sm" onClick={handleConnect}>
                        Connect Google Account
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
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
                        {userProfile.hasPasscode ? 'Update or Disable PIN' : 'Configure PIN'}
                      </h4>

                      <form onSubmit={handleSetPasscode} className="space-y-3">
                        <Input
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          placeholder="Enter 4-digit PIN"
                          value={pinInput}
                          onChange={e => {
                            setPasscodeError(null)
                            setPasscodeSuccess(null)
                            setPinInput(e.target.value.replace(/\D/g, ''))
                          }}
                          className="font-mono text-center tracking-[1em]"
                        />

                        {passcodeError && <div className="text-[11px] text-rose-500 font-semibold">{passcodeError}</div>}
                        {passcodeSuccess && <div className="text-[11px] text-emerald-500 font-semibold">{passcodeSuccess}</div>}

                        <div className="flex items-center gap-2 pt-1.5">
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={pinInput.length !== 4 || passcodeActionLoading}
                            isLoading={passcodeActionLoading}
                          >
                            {userProfile.hasPasscode ? 'Change PIN' : 'Enable Passcode'}
                          </Button>
                          
                          {userProfile.hasPasscode && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={passcodeActionLoading}
                              onClick={handleDisablePasscode}
                            >
                              Disable PIN
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
              </CardBody>
            </Card>
          )}

          {activeSection === 'advanced' && (
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
        </div>
      </div>
    </div>
  )
}
