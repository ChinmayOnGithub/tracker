'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3,
  Layers3, Laptop, Moon, Rocket, Sparkles, Sun, Target,
} from 'lucide-react'
import type { OnboardingState } from '@/lib/services/OnboardingService'
import {
  completeOnboardingAction,
  getOnboardingCalendarDiscoveryAction,
  saveOnboardingStateAction,
} from '@/app/actions/onboarding'

interface Props {
  initialState: OnboardingState
  username: string
}

interface CalendarDiscovery {
  connected: boolean
  eventCount: number
  events: Array<{ id: string; title: string; start: string; end: string }>
}

const TOTAL_STEPS = 3

const FOCUS_AREAS = [
  ['Work & Career', 'work', 'Projects, focus time, and deliverables'],
  ['Learning', 'learning', 'Study, reading, and personal growth'],
  ['Health & Fitness', 'health', 'Workouts, nutrition, and recovery'],
  ['Life Admin', 'life-admin', 'Finances, planning, and errands'],
  ['Personal', 'personal', 'Family, relationships, and downtime'],
  ['Creative', 'creative', 'Writing, design, and side projects'],
]

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  const value = `${String(hour).padStart(2, '0')}:${minute}`
  const displayHour = hour % 12 || 12
  return { value, label: `${displayHour}:${minute} ${hour < 12 ? 'AM' : 'PM'}` }
})

const STEPS = [
  ['Focus', 'What matters right now'],
  ['Schedule', 'Your hours & calendar'],
  ['Priority', 'Your main goal for today'],
  ['Ready', 'Review your day'],
]

export function OnboardingExperience({ initialState, username }: Props) {
  const [state, setState] = useState<OnboardingState>(initialState)
  const [step, setStep] = useState(Math.min(initialState.currentStep, TOTAL_STEPS))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [calendarDiscovery, setCalendarDiscovery] = useState<CalendarDiscovery | null>(null)
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
    }
    return 'system'
  })

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    setCurrentTheme(theme)
    localStorage.setItem('theme', theme)
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  useEffect(() => {
    let active = true
    void getOnboardingCalendarDiscoveryAction().then((result) => {
      if (!active || !result.success) return
      setCalendarDiscovery({
        connected: result.connected,
        eventCount: result.eventCount || 0,
        events: result.events || [],
      })
      if (result.connected) {
        setState((current) => ({ ...current, calendarProvider: 'google' }))
      }
    })
    return () => { active = false }
  }, [])

  const selectedFocusLabels = useMemo(
    () => state.focusAreas.map((value) => FOCUS_AREAS.find((item) => item[1] === value)?.[0] || value),
    [state.focusAreas],
  )

  const progress = Math.round((step / TOTAL_STEPS) * 100)

  const update = <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => {
    setState((current) => ({ ...current, [key]: value }))
    setError('')
  }

  const toggleFocus = (value: string) => {
    const selected = state.focusAreas.includes(value)
    if (selected) update('focusAreas', state.focusAreas.filter((item) => item !== value))
    else if (state.focusAreas.length < 3) update('focusAreas', [...state.focusAreas, value])
  }

  const validate = () => {
    if (step === 0 && state.focusAreas.length === 0) {
      setError('Choose at least one focus area to tailor your workspace.')
      return false
    }
    if (step === 1) {
      const start = timeToMinutes(state.workStartTime)
      const end = timeToMinutes(state.workEndTime)
      if (end <= start) {
        setError('Finish time must be later than start time.')
        return false
      }
      if (end - start < 60) {
        setError('Workday window should be at least one hour.')
        return false
      }
    }
    return true
  }

  const persist = async (nextStep: number) => {
    const nextState: OnboardingState = {
      ...state,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || state.timezone || 'UTC',
      status: 'IN_PROGRESS',
      currentStep: nextStep,
      completedSteps: Array.from(new Set([...state.completedSteps, step])),
    }

    setSaving(true)
    const result = await saveOnboardingStateAction(nextState)
    setSaving(false)

    if (!result.success || !result.state) {
      setError(result.error || 'Could not save your progress.')
      return false
    }

    setState(result.state)
    setStep(nextStep)
    return true
  }

  const continueStep = async () => {
    if (!validate()) return
    await persist(Math.min(step + 1, TOTAL_STEPS))
  }

  const finish = async () => {
    if (!validate()) return
    setSaving(true)
    setError('')

    const result = await completeOnboardingAction({
      ...state,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || state.timezone || 'UTC',
      currentStep: TOTAL_STEPS,
      completedSteps: Array.from(new Set([...state.completedSteps, TOTAL_STEPS])),
    })

    setSaving(false)

    if (!result.success || !result.state) {
      setError(result.error || 'Could not build your starting day.')
      return
    }

    setState(result.state)
    window.location.assign('/')
  }

  const back = () => {
    setError('')
    setStep((current) => Math.max(0, current - 1))
  }

  // The Skip button strictly advances to the next step without forcing any synthetic data or activities
  const skip = async () => {
    setError('')
    const nextState = { ...state }
    const nextStep = Math.min(step + 1, TOTAL_STEPS)

    setSaving(true)
    const result = await saveOnboardingStateAction({
      ...nextState,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || nextState.timezone || 'UTC',
      status: 'IN_PROGRESS',
      currentStep: nextStep,
      completedSteps: Array.from(new Set([...nextState.completedSteps, step])),
    })
    setSaving(false)

    if (!result.success || !result.state) {
      setError(result.error || 'Could not skip this step.')
      return
    }
    setState(result.state)
    setStep(nextStep)
  }

  const connectCalendar = () => {
    window.location.href = '/api/integrations/google-calendar?returnTo=/onboarding'
  }

  return (
    <main
      className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-3 text-slate-900 dark:text-zinc-100 sm:p-6 flex items-center justify-center transition-colors"
      style={{
        '--onboarding-rose': '#e11d48',
        '--onboarding-rose-soft': '#fff1f2',
      } as React.CSSProperties}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl transition-colors">
        <div className="grid lg:grid-cols-[240px_1fr]">
          {/* Minimalist Sidebar */}
          <aside className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 p-5 lg:border-b-0 lg:border-r lg:p-6 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 dark:bg-zinc-800 text-white shadow-sm">
                <Layers3 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-zinc-100">tracker</p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500">Quick setup</p>
              </div>
            </div>

            <div className="mt-6 hidden lg:block">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Step {step + 1} of {TOTAL_STEPS + 1}</p>
              <h2 className="mt-1 text-base font-bold tracking-tight text-slate-800 dark:text-zinc-200">
                {STEPS[step]?.[0]}
              </h2>
            </div>

            <div className="mt-4 hidden space-y-1 lg:block">
              {STEPS.map(([label, hint], index) => {
                const active = index === step
                const done = index < step
                return (
                  <div key={label} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${active ? 'bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-200 dark:ring-zinc-700' : ''}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-950 dark:bg-zinc-100 dark:text-zinc-900 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${active ? 'text-slate-900 dark:text-zinc-100' : 'text-slate-500 dark:text-zinc-400'}`}>{label}</p>
                      <p className="truncate text-[10px] text-slate-400 dark:text-zinc-500">{hint}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 lg:hidden">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {STEPS.map(([label], index) => (
                  <span key={label} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-rose-600 dark:bg-rose-500' : 'bg-slate-200 dark:bg-zinc-800'}`} />
                ))}
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-slate-400 dark:text-zinc-500">{step + 1}/{STEPS.length}</span>
            </div>
          </aside>

          {/* Main Content Area */}
          <section className="flex flex-col bg-white dark:bg-zinc-900 transition-colors">
            <header className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-6 py-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Welcome, <strong className="text-slate-900 dark:text-zinc-100">{username}</strong>
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-rose-600 dark:bg-rose-500 transition-all duration-300" style={{ width: `${Math.max(progress, 15)}%` }} />
                </div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">{progress}%</span>
              </div>
            </header>

            <div className="flex-1 p-6 sm:p-8">
              {/* Step 0: Focus Areas */}
              {step === 0 && (
                <Step
                  title="What do you want to focus on?"
                  description="Choose up to three priorities. We'll tune your daily templates to match."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {FOCUS_AREAS.map(([label, value, hint]) => (
                      <ChoiceRow
                        key={value}
                        selected={state.focusAreas.includes(value)}
                        onClick={() => toggleFocus(value)}
                        icon={<Target className="h-4 w-4" />}
                        title={label}
                        description={hint}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span>Select 1 to 3 areas</span>
                    <span className="font-semibold text-rose-600">{state.focusAreas.length}/3 selected</span>
                  </div>
                </Step>
              )}

              {/* Step 1: Schedule & Google Calendar */}
              {step === 1 && (
                <Step
                  title="Workday window & Calendar"
                  description="Set your standard schedule and optionally sync Google Calendar."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <TimeSelect label="Workday Starts" value={state.workStartTime} onChange={(v) => update('workStartTime', v)} />
                    <TimeSelect label="Workday Ends" value={state.workEndTime} onChange={(v) => update('workEndTime', v)} />
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-200 dark:ring-zinc-700">
                          <CalendarDays className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">Google Calendar</p>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {calendarDiscovery?.connected
                              ? `Connected (${calendarDiscovery.eventCount} events)`
                              : 'Keep meetings and tasks aligned automatically'}
                          </p>
                        </div>
                      </div>

                      {calendarDiscovery?.connected ? (
                        <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-3 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          Connected
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={connectCalendar}
                          className="rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                </Step>
              )}

              {/* Step 2: Main Objective */}
              {step === 2 && (
                <Step
                  title="What is your main goal for today?"
                  description="One clear priority makes any day productive. (Optional - skip if you prefer an empty slate)"
                >
                  <textarea
                    value={state.firstDayObjective}
                    onChange={(e) => update('firstDayObjective', e.target.value)}
                    maxLength={200}
                    rows={4}
                    placeholder="e.g., Complete project proposal, finish client review..."
                    className="w-full resize-none rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/40 p-4 text-sm text-slate-900 dark:text-zinc-100 outline-none transition focus:border-rose-500 focus:bg-white dark:focus:bg-zinc-800 focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-950/40"
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-slate-400 dark:text-zinc-500">
                    <span>Leave blank to skip</span>
                    <span>{state.firstDayObjective.length}/200</span>
                  </div>
                </Step>
              )}

              {/* Step 3: Ready Screen */}
              {step === 3 && (
                <Step
                  title="You're ready to start"
                  description="Here is your setup summary. You can adjust settings anytime."
                >
                  <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 p-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-zinc-700/60">
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">Work Hours</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">{formatTime(state.workStartTime)} — {formatTime(state.workEndTime)}</p>
                      </div>
                      <Clock3 className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                    </div>

                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-zinc-700/60">
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">Focus Areas</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {selectedFocusLabels.length > 0 ? selectedFocusLabels.join(', ') : 'None selected'}
                        </p>
                      </div>
                      <Target className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                    </div>

                    {state.firstDayObjective.trim() ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">Today&apos;s Priority</p>
                          <p className="text-[11px] text-slate-600 dark:text-zinc-300 truncate max-w-sm">{state.firstDayObjective}</p>
                        </div>
                        <Sparkles className="h-4 w-4 text-rose-500" />
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 italic">No first-day goal set (clean start).</p>
                    )}
                  </div>

                  {/* Theme / Appearance Selection */}
                  <div className="mt-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 p-4">
                    <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">Workspace Appearance</p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mb-3">Choose how tracker looks for your daily sessions.</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleThemeChange('light')}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-semibold transition ${
                          currentTheme === 'light'
                            ? 'border-rose-500 bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm ring-1 ring-rose-200 dark:ring-rose-900/50'
                            : 'border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        <Sun className="h-4 w-4" />
                        <span>Light</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleThemeChange('dark')}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-semibold transition ${
                          currentTheme === 'dark'
                            ? 'border-rose-500 bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm ring-1 ring-rose-200 dark:ring-rose-900/50'
                            : 'border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        <Moon className="h-4 w-4" />
                        <span>Dark</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleThemeChange('system')}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-semibold transition ${
                          currentTheme === 'system'
                            ? 'border-rose-500 bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm ring-1 ring-rose-200 dark:ring-rose-900/50'
                            : 'border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        <Laptop className="h-4 w-4" />
                        <span>System</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Ready to build your workspace.
                  </div>
                </Step>
              )}

              {error && (
                <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700" role="alert">
                  {error}
                </p>
              )}

              {/* Navigation Footer */}
              <footer className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={back}
                  disabled={step === 0 || saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:invisible"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>

                <div className="flex items-center gap-2">
                  {step < TOTAL_STEPS && (
                    <button
                      type="button"
                      onClick={skip}
                      disabled={saving}
                      className="inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  )}

                  {step < TOTAL_STEPS ? (
                    <button
                      type="button"
                      onClick={continueStep}
                      disabled={saving}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-sm hover:bg-rose-600 disabled:opacity-50 transition"
                    >
                      {saving ? 'Saving…' : 'Continue'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={finish}
                      disabled={saving}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition"
                    >
                      {saving ? 'Finishing…' : 'Get Started'}
                      <Rocket className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </footer>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function Step({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-zinc-50 sm:text-2xl">{title}</h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  )
}

function ChoiceRow({ selected, onClick, icon, title, description }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
        selected
          ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 shadow-xs'
          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 hover:border-slate-300 dark:hover:border-zinc-700'
      }`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${selected ? 'bg-rose-600 dark:bg-rose-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>
        {selected ? <Check className="h-4 w-4" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-900 dark:text-zinc-100">{title}</span>
        <span className="block text-[10px] text-slate-400 dark:text-zinc-500 truncate">{description}</span>
      </span>
      <span className={`h-4 w-4 rounded-full border ${selected ? 'border-rose-600 bg-rose-600 dark:border-rose-500 dark:bg-rose-500' : 'border-slate-300 dark:border-zinc-700'}`} />
    </button>
  )
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 p-3 shadow-xs">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-bold text-slate-800 dark:text-zinc-200 outline-none"
      >
        {TIME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function formatTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}
