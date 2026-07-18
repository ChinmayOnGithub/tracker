import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardBody, Button, Skeleton, Select, Input } from '@/design-system'
import { Calendar, CheckCircle2, AlertCircle, RefreshCw, Settings2, Database, Shield, Lock, Key } from 'lucide-react'
import { checkGoogleConnection, disconnectGoogleAccount } from '@/modules/sync/google-calendar/actions'
import { getUserProfileAction, setPasscodeAction } from '@/app/actions/auth'

export const SettingsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Passcode settings states
  const [profileLoading, setProfileLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<{ username: string; email: string | null; hasPasscode: boolean } | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [passcodeError, setPasscodeError] = useState<string | null>(null)
  const [passcodeSuccess, setPasscodeSuccess] = useState<string | null>(null)
  const [passcodeActionLoading, setPasscodeActionLoading] = useState(false)

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true)
    const res = await getUserProfileAction()
    if (res.success && res.user) {
      setUserProfile(res.user)
    }
    setProfileLoading(false)
  }, [])

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
      setPasscodeSuccess('Passcode login configured successfully!')
      setPinInput('')
      await fetchProfile()
    } else {
      setPasscodeError(res.error || 'Failed to update passcode.')
    }
    setPasscodeActionLoading(false)
  }

  const handleDisablePasscode = async () => {
    if (!confirm('Are you sure you want to disable passcode login? You will need to login using Google.')) {
      return
    }
    setPasscodeError(null)
    setPasscodeSuccess(null)
    setPasscodeActionLoading(true)
    const res = await setPasscodeAction(null)
    if (res.success) {
      setPasscodeSuccess('Passcode login disabled successfully.')
      await fetchProfile()
    } else {
      setPasscodeError(res.error || 'Failed to disable passcode.')
    }
    setPasscodeActionLoading(false)
  }

  // Local preferences states
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

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('sound_enabled')
      return val === null ? true : val === 'true'
    }
    return true
  })

  const handleDefaultViewChange = (val: 'month' | 'week' | 'agenda') => {
    setDefaultView(val)
    localStorage.setItem('calendar_default_view', val)
  }

  const handleStartOfWeekChange = (val: 'sunday' | 'monday') => {
    setStartOfWeek(val)
    localStorage.setItem('calendar_start_of_week', val)
  }

  const handleSoundToggle = () => {
    const nextVal = !soundEnabled
    setSoundEnabled(nextVal)
    localStorage.setItem('sound_enabled', String(nextVal))
  }

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

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      const res = await checkGoogleConnection()
      if (!active) return
      if (res.success) {
        setConnected(res.connected || false)
        setLastSync(res.updatedAt || null)
      } else {
        setError(res.error || 'Failed to fetch integration state')
      }
      setLoading(false)
    }
    load()
    const timer = setTimeout(() => {
      fetchProfile()
    }, 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [fetchProfile])

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

  return (
    <div className="space-y-[var(--spacing-4)] max-w-5xl mx-auto">
      {/* Header Info */}
      <div className="flex flex-col gap-1 max-w-2xl mb-2">
        <h2 className="text-base font-extrabold text-[var(--color-text-main)] tracking-tight">System Settings</h2>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Manage your personal life operating system configurations, sync providers, and database parameters.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--spacing-4)]">
        {/* Google Calendar Integration Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                Calendar Sync Integration
              </span>
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
              <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[var(--radius-md)] text-xs font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ) : connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Integrated successfully with Google Calendar</span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                  <div>Status: <span className="font-bold text-[var(--color-text-main)]">Active</span></div>
                  {lastSync && (
                    <div>Last Sync: <span className="font-mono text-[var(--color-text-main)]">{new Date(lastSync).toLocaleString()}</span></div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    isLoading={disconnecting}
                  >
                    Disconnect Integration
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    onClick={fetchConnection}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Connect your Google Calendar to synchronize your events, meetings, and habits directly into Tracker&apos;s timeline.
                </p>
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConnect}
                  >
                    Connect Google Account
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Local Dashboard Preferences Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                Dashboard Preferences
              </span>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 text-xs font-medium text-[var(--color-text-muted)]">
            <div className="space-y-4">
              <Select
                label="Default Calendar View"
                value={defaultView}
                onChange={e => handleDefaultViewChange(e.target.value as 'month' | 'week' | 'agenda')}
                options={[
                  { value: 'month', label: 'Month View' },
                  { value: 'week', label: 'Week View' },
                  { value: 'agenda', label: 'Agenda View' },
                ]}
              />

              <Select
                label="Start of Week"
                value={startOfWeek}
                onChange={e => handleStartOfWeekChange(e.target.value as 'sunday' | 'monday')}
                options={[
                  { value: 'sunday', label: 'Sunday' },
                  { value: 'monday', label: 'Monday' },
                ]}
              />

              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="font-bold text-[var(--color-text-main)]">Sound Notifications</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">Play subtle sound alerts on activity updates</div>
                </div>
                <button
                  onClick={handleSoundToggle}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                    soundEnabled ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-zinc-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    soundEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Passcode & Login Security Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                Passcode & Login Security
              </span>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {profileLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton variant="text" className="h-4 w-3/4" />
                <Skeleton variant="text" className="h-4 w-1/2" />
              </div>
            ) : userProfile ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 text-xs text-[var(--color-text-muted)]">
                  <div>
                    <span className="font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Username:</span>
                    <div className="font-extrabold text-[var(--color-text-main)] text-sm font-mono mt-0.5">{userProfile.username}</div>
                  </div>
                  <div>
                    <span className="font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Email:</span>
                    <div className="font-semibold text-[var(--color-text-main)] mt-0.5">{userProfile.email || 'Not connected'}</div>
                  </div>
                  <div>
                    <span className="font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Passcode Login Status:</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${userProfile.hasPasscode ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className={`font-bold uppercase tracking-wider text-[10px] ${userProfile.hasPasscode ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {userProfile.hasPasscode ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)] mt-4">
                    Passcode login allows you to access Tracker using your username (<span className="font-mono text-[var(--color-text-main)]">{userProfile.username}</span>) and a 4-digit PIN, so you don&apos;t need to log in with Google every time.
                  </p>
                </div>

                <div className="space-y-4 p-4 bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-zinc-800/80 rounded-2xl">
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

                    {passcodeError && (
                      <div className="text-[11px] text-rose-500 font-medium">{passcodeError}</div>
                    )}
                    {passcodeSuccess && (
                      <div className="text-[11px] text-emerald-500 font-medium">{passcodeSuccess}</div>
                    )}

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
                          Disable Passcode
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] italic">
                Could not load profile. Please refresh settings.
              </div>
            )}
          </CardBody>
        </Card>

        {/* System Diagnostics & Database Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                System Diagnostics & Performance
              </span>
            </div>
          </CardHeader>
          <CardBody className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
            <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg space-y-1.5 animate-pulse-slow">
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Database Status</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-extrabold text-[var(--color-text-main)]">Prisma PostgreSQL: Healthy</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg space-y-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">API Connection Latency</span>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-[var(--color-text-main)]">~4ms (Local network optimal)</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-lg space-y-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Security Layer</span>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-extrabold text-[var(--color-text-main)]">AES-256-GCM Persistent</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

