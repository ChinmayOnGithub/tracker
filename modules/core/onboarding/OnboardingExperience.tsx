'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3,
  Github, Layers3, ListTodo, LockKeyhole, Rocket, Sparkles, Target,
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

const TOTAL_STEPS = 7

const FOCUS_AREAS = [
  ['Work', 'work', 'Projects, deadlines and career'],
  ['Learning', 'learning', 'Study, skills and growth'],
  ['Personal', 'personal', 'Home, relationships and life'],
  ['Health', 'health', 'Movement, food and wellbeing'],
  ['Life admin', 'life-admin', 'Errands, money and paperwork'],
  ['Creative', 'creative', 'Writing, design and side projects'],
]

const TASK_SOURCES = [
  ['Google Tasks', 'google-tasks'],
  ['Todoist', 'todoist'],
  ['Notion', 'notion'],
  ['Linear', 'linear'],
  ['GitHub', 'github'],
  ['Jira', 'jira'],
  ['Trello', 'trello'],
  ['ClickUp', 'clickup'],
  ['Outlook', 'outlook'],
]

const PLANNING_STYLES = [
  ['Focused', 'focused', 'A short list. Protect deep work.'],
  ['Structured', 'structured', 'Plan the day before you start.'],
  ['Flexible', 'flexible', 'Keep direction and adapt as you go.'],
]

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  const value = `${String(hour).padStart(2, '0')}:${minute}`
  const displayHour = hour % 12 || 12
  return { value, label: `${displayHour}:${minute} ${hour < 12 ? 'AM' : 'PM'}` }
})

const STEPS = [
  ['Start', 'A little context'],
  ['Focus', 'What matters'],
  ['Work', 'Where work lives'],
  ['Calendar', 'Protect your time'],
  ['Rhythm', 'Your workday'],
  ['Planning', 'Your style'],
  ['Mission', 'Your first outcome'],
  ['Ready', 'Your starting day'],
]

export function OnboardingExperience({ initialState, username }: Props) {
  const [state, setState] = useState<OnboardingState>(initialState)
  const [step, setStep] = useState(Math.min(initialState.currentStep, TOTAL_STEPS))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [calendarDiscovery, setCalendarDiscovery] = useState<CalendarDiscovery | null>(null)

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

  const toggleSource = (value: string) => {
    update('taskSources', state.taskSources.includes(value)
      ? state.taskSources.filter((item) => item !== value)
      : [...state.taskSources, value])
  }

  const validate = () => {
    if (step === 1 && state.focusAreas.length === 0) {
      setError('Pick at least one area. This changes the activities Tracker creates for you.')
      return false
    }
    if (step === 4) {
      const start = timeToMinutes(state.workStartTime)
      const end = timeToMinutes(state.workEndTime)
      if (end <= start) {
        setError('Finish time must be later than start time.')
        return false
      }
      if (end - start < 60) {
        setError('Give yourself at least one hour in the workday window.')
        return false
      }
    }
    if (step === 5 && !state.planningStyle) {
      setError('Choose the planning style that feels most natural.')
      return false
    }
    if (step === 6 && !state.firstDayObjective.trim()) {
      setError('Give your first day one clear outcome.')
      return false
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

  const connectCalendar = () => {
    window.location.href = '/api/integrations/google-calendar?returnTo=/onboarding'
  }

  return (
    <main
      className="min-h-screen bg-[#f8f7f8] px-3 py-3 text-slate-950 sm:px-6 sm:py-6"
      style={{
        '--onboarding-rose': '#e11d48',
        '--onboarding-rose-dark': '#be123c',
        '--onboarding-rose-soft': '#fff1f2',
      } as React.CSSProperties}
    >
      <div className="mx-auto min-h-[calc(100vh-1.5rem)] max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_20px_70px_-35px_rgba(15,23,42,0.35)] sm:min-h-[calc(100vh-3rem)]">
        <div className="grid min-h-full lg:grid-cols-[260px_1fr]">
          <aside className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-rose-50 via-white to-white p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-rose-200/30 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white shadow-lg">
                  <Layers3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight">tracker</p>
                  <p className="text-[10px] text-slate-500">Personal operating system</p>
                </div>
              </div>

              <div className="mt-7 hidden lg:block">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">Setup</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight">Let’s make your first day feel like yours.</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Every answer changes what Tracker prepares. Nothing here replaces or deletes your existing data.
                </p>
              </div>

              <div className="mt-5 space-y-1.5">
                {STEPS.map(([label, hint], index) => {
                  const active = index === step
                  const done = index < step
                  return (
                    <div key={label} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${active ? 'bg-white shadow-sm ring-1 ring-slate-200' : ''}`}>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${done ? 'bg-rose-600 text-white' : active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${active ? 'text-slate-950' : 'text-slate-500'}`}>{label}</p>
                        <p className="truncate text-[10px] text-slate-400">{hint}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-auto hidden rounded-2xl border border-rose-100 bg-white/80 p-3.5 lg:block">
                <div className="flex items-center gap-2">
                  <LockKeyhole className="h-3.5 w-3.5 text-rose-600" />
                  <p className="text-[11px] font-semibold">Existing data stays untouched</p>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Onboarding only adds the new starter activities it creates.</p>
              </div>
            </div>
          </aside>

          <section className="flex min-h-[650px] flex-col bg-white">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-8">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">{STEPS[step][0]}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{STEPS[step][1]}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:w-28">
                  <div className="h-full rounded-full bg-rose-600 transition-all duration-300" style={{ width: `${Math.max(progress, 8)}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-slate-400">{step + 1}/{TOTAL_STEPS + 1}</span>
              </div>
            </header>

            <div className="flex flex-1 items-center px-5 py-7 sm:px-10 sm:py-10">
              <div className="mx-auto w-full max-w-2xl">
                {step === 0 && (
                  <Step title={`Hi ${username}. Let’s build your starting day.`} description="A few choices are enough. Tracker will use them to prepare useful activities instead of giving you a generic checklist.">
                    <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-xl sm:p-7">
                      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-rose-500/30 blur-2xl" />
                      <div className="relative">
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold">SETUP QUEST</span>
                          <Sparkles className="h-4 w-4 text-rose-300" />
                        </div>
                        <p className="mt-12 max-w-sm text-2xl font-bold tracking-tight">Turn your answers into a day you can actually use.</p>
                        <div className="mt-5 flex flex-wrap gap-2 text-[10px] text-white/70">
                          <span className="rounded-full bg-white/10 px-2.5 py-1">Focus</span>
                          <span className="rounded-full bg-white/10 px-2.5 py-1">Calendar</span>
                          <span className="rounded-full bg-white/10 px-2.5 py-1">Capacity</span>
                          <span className="rounded-full bg-white/10 px-2.5 py-1">Activities</span>
                        </div>
                      </div>
                    </div>
                  </Step>
                )}

                {step === 1 && (
                  <Step title="What do you want Tracker to help with first?" description="Pick up to three. These choices directly influence the starter activities created at the end.">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FOCUS_AREAS.map(([label, value, hint]) => (
                        <ChoiceRow key={value} selected={state.focusAreas.includes(value)} onClick={() => toggleFocus(value)} icon={<Target className="h-4 w-4" />} title={label} description={hint} />
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Up to 3 areas</span>
                      <span className="font-semibold text-rose-600">{state.focusAreas.length}/3 selected</span>
                    </div>
                  </Step>
                )}

                {step === 2 && (
                  <Step title="Where does your work already live?" description="This helps Tracker create a relevant first action. Connections are not made just by selecting an item.">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {TASK_SOURCES.map(([label, value]) => (
                        <ChoiceTile key={value} selected={state.taskSources.includes(value)} onClick={() => toggleSource(value)} label={label} icon={value === 'github' ? <Github className="h-4 w-4" /> : <ListTodo className="h-4 w-4" />} />
                      ))}
                    </div>
                    <p className="mt-4 text-[11px] text-slate-400">You can skip this. Tracker will not invent an integration connection.</p>
                  </Step>
                )}

                {step === 3 && (
                  <Step title="Should Tracker plan around your calendar?" description="Connect Google Calendar only if you want your first activities placed around real commitments.">
                    <button
                      type="button"
                      onClick={connectCalendar}
                      className={`group w-full rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${calendarDiscovery?.connected ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white shadow-sm'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                          <CalendarDays className="h-5 w-5 text-rose-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">Google Calendar</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {calendarDiscovery?.connected ? `Connected · ${calendarDiscovery.eventCount} upcoming events found` : 'Import commitments and protect those times.'}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${calendarDiscovery?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {calendarDiscovery?.connected ? 'Connected' : 'Connect'}
                        </span>
                      </div>
                    </button>

                    {calendarDiscovery?.connected && calendarDiscovery.events.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-[18px] border border-slate-200">
                        {calendarDiscovery.events.slice(0, 4).map((event) => (
                          <div key={event.id} className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-3 last:border-b-0">
                            <div className="h-7 w-1 rounded-full bg-rose-400" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold">{event.title}</p>
                              <p className="mt-0.5 text-[10px] text-slate-400">{formatCalendarTime(event.start)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button type="button" onClick={() => update('calendarProvider', null)} className="mt-3 text-[11px] font-semibold text-slate-400 hover:text-slate-700">
                      Continue without a calendar
                    </button>
                  </Step>
                )}

                {step === 4 && (
                  <Step title="What does a normal workday look like?" description="Tracker uses this window when it finds room for the starter activities. Your time zone is detected from this device.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TimeSelect label="Start" value={state.workStartTime} onChange={(value) => update('workStartTime', value)} />
                      <TimeSelect label="Finish" value={state.workEndTime} onChange={(value) => update('workEndTime', value)} />
                    </div>
                    <div className="mt-4 rounded-[18px] border border-rose-100 bg-rose-50/60 p-4">
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-rose-600" />
                        <span className="text-xs font-bold">Planning window</span>
                      </div>
                      <p className="mt-2 text-xl font-bold tracking-tight">{formatTime(state.workStartTime)} — {formatTime(state.workEndTime)}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{Intl.DateTimeFormat().resolvedOptions().timeZone || state.timezone}</p>
                    </div>
                  </Step>
                )}

                {step === 5 && (
                  <Step title="How should Tracker shape the day?" description="This changes the duration and number of starter activities. It is a planning preference, not a productivity score.">
                    <div className="space-y-2">
                      {PLANNING_STYLES.map(([label, value, hint]) => (
                        <ChoiceRow key={value} selected={state.planningStyle === value} onClick={() => update('planningStyle', value)} icon={<Sparkles className="h-4 w-4" />} title={label} description={hint} />
                      ))}
                    </div>
                    <div className="mt-5">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-sm font-bold">Daily capacity</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">How much focused work feels realistic?</p>
                        </div>
                        <span className="text-lg font-bold text-rose-600">{state.dailyCapacity}h</span>
                      </div>
                      <input
                        aria-label="Daily capacity"
                        type="range"
                        min="2"
                        max="10"
                        step="1"
                        value={state.dailyCapacity}
                        onChange={(event) => update('dailyCapacity', Number(event.target.value))}
                        className="mt-4 w-full accent-rose-600"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400"><span>2h</span><span>10h</span></div>
                    </div>
                  </Step>
                )}

                {step === 6 && (
                  <Step title="What would make today a good day?" description="Write one concrete outcome. Tracker will keep this as your main activity and add smaller activities around the priorities you selected.">
                    <textarea
                      value={state.firstDayObjective}
                      onChange={(event) => update('firstDayObjective', event.target.value)}
                      maxLength={1000}
                      rows={5}
                      autoFocus
                      placeholder="Ship the API integration, finish my portfolio update, study Java for two hours…"
                      className="w-full resize-none rounded-[20px] border border-slate-200 bg-slate-50/50 p-4 text-sm leading-6 outline-none transition focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
                    />
                    <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                      <span>Concrete beats ambitious.</span><span>{state.firstDayObjective.length}/1000</span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {selectedFocusLabels.map((label) => (
                        <span key={label} className="rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-semibold text-rose-700">{label}</span>
                      ))}
                    </div>
                  </Step>
                )}

                {step === 7 && (
                  <Step title="Here’s what Tracker will add." description="Nothing is replaced. These are new one-time activities generated from this onboarding run.">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-600">YOUR STARTING DAY</p>
                          <p className="mt-1 text-sm font-bold">Built around your choices</p>
                        </div>
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                          <Rocket className="h-4 w-4 text-rose-600" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <PreviewActivity icon={<Target />} title={state.firstDayObjective || 'Your main outcome'} meta={`${state.dailyCapacity}h capacity · ${state.planningStyle || 'focused'} planning`} primary />
                        {state.focusAreas.slice(1, 3).map((focus) => {
                          const item = FOCUS_AREAS.find((entry) => entry[1] === focus)
                          return <PreviewActivity key={focus} icon={<Sparkles />} title={item?.[0] || focus} meta="A supporting activity based on your focus" />
                        })}
                        {state.taskSources[0] && (
                          <PreviewActivity icon={<ListTodo />} title={`Review your ${sourceLabel(state.taskSources[0])} queue`} meta="Added from your selected work source" />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-[16px] bg-emerald-50 px-3.5 py-3 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Existing activities and other Tracker data stay untouched.
                    </div>
                  </Step>
                )}

                {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700" role="alert">{error}</p>}

                <footer className="mt-7 flex items-center justify-between gap-3">
                  <button type="button" onClick={back} disabled={step === 0 || saving} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 disabled:invisible">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>

                  {step < TOTAL_STEPS ? (
                    <button type="button" onClick={continueStep} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-bold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-rose-600 disabled:opacity-60">
                      {saving ? 'Saving…' : step === 0 ? 'Start setup' : 'Continue'}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={finish} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white shadow-lg shadow-rose-600/20 transition hover:-translate-y-0.5 hover:bg-rose-700 disabled:opacity-60">
                      {saving ? 'Building…' : 'Build my day'}
                      <Rocket className="h-4 w-4" />
                    </button>
                  )}
                </footer>

                <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                  <LockKeyhole className="h-3 w-3" /> Progress saves as you go
                </p>
              </div>
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
      <h1 className="max-w-xl text-[28px] font-bold leading-tight tracking-[-0.035em] text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-7">{children}</div>
    </div>
  )
}

function ChoiceRow({ selected, onClick, icon, title, description }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button type="button" onClick={onClick} className={`group flex w-full items-center gap-3 rounded-[18px] border p-3.5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-rose-300 bg-rose-50/70 shadow-sm' : 'border-slate-200 bg-white'}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{selected ? <Check className="h-4 w-4" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{description}</span>
      </span>
      <span className={`h-4 w-4 rounded-full border ${selected ? 'border-rose-600 bg-rose-600' : 'border-slate-300'}`} />
    </button>
  )
}

function ChoiceTile({ selected, onClick, label, icon }: { selected: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-16 items-center gap-2.5 rounded-[16px] border px-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : icon}</span>
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  )
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-sm">
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full bg-transparent text-base font-bold outline-none">
        {TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function PreviewActivity({ icon, title, meta, primary = false }: { icon: React.ReactNode; title: string; meta: string; primary?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-[16px] border bg-white p-3 shadow-sm ${primary ? 'border-rose-200' : 'border-slate-200'}`}>
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${primary ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{title}</p>
        <p className="mt-0.5 truncate text-[10px] text-slate-400">{meta}</p>
      </div>
    </div>
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

function formatCalendarTime(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function sourceLabel(value: string) {
  const labels: Record<string, string> = {
    'google-tasks': 'Google Tasks',
    todoist: 'Todoist',
    notion: 'Notion',
    linear: 'Linear',
    github: 'GitHub',
    jira: 'Jira',
    trello: 'Trello',
    clickup: 'ClickUp',
    outlook: 'Outlook',
  }
  return labels[value] || value
}
