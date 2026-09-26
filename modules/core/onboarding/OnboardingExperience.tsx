'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3,
  Compass, Layers3, ListTodo, Rocket, Sparkles, Target, Trophy, Zap,
} from 'lucide-react'
import { Button, Card, Checkbox, Select, Textarea } from '@/design-system'
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

const TOTAL_STEPS = 8

const TASK_SOURCES = [
  ['Google Tasks', 'google-tasks'], ['Todoist', 'todoist'], ['Notion', 'notion'],
  ['Linear', 'linear'], ['GitHub', 'github'], ['Jira', 'jira'],
  ['Trello', 'trello'], ['ClickUp', 'clickup'], ['Outlook', 'outlook'],
]

const FOCUS_AREAS = [
  ['Work', 'work'], ['Learning', 'learning'], ['Personal', 'personal'],
  ['Health & fitness', 'health'], ['Life admin', 'life-admin'], ['Creative work', 'creative'],
]

const PLANNING_STYLES = [
  ['Focused', 'focused', 'A short, intentional list with room to think.'],
  ['Structured', 'structured', 'Plan most of the day before you start.'],
  ['Flexible', 'flexible', 'Keep a direction and adapt as the day changes.'],
]

const CALENDARS = [
  ['Google Calendar', 'google', 'Connect now'],
  ['Outlook Calendar', 'outlook', 'Coming next'],
  ['Apple Calendar', 'apple', 'Coming next'],
]

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  const value = `${String(hour).padStart(2, '0')}:${minute}`
  const displayHour = hour % 12 || 12
  return { value, label: `${displayHour}:${minute} ${hour < 12 ? 'AM' : 'PM'}` }
})

const QUESTS = [
  { key: 'work', label: 'Your work', icon: <ListTodo className="h-3.5 w-3.5" /> },
  { key: 'calendar', label: 'Your calendar', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { key: 'rhythm', label: 'Your rhythm', icon: <Clock3 className="h-3.5 w-3.5" /> },
  { key: 'capacity', label: 'Your capacity', icon: <Zap className="h-3.5 w-3.5" /> },
  { key: 'plan', label: 'Your first plan', icon: <Target className="h-3.5 w-3.5" /> },
]

export function OnboardingExperience({ initialState, username }: Props) {
  const [state, setState] = useState<OnboardingState>(initialState)
  const [step, setStep] = useState(Math.min(initialState.currentStep, TOTAL_STEPS))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [calendarDiscovery, setCalendarDiscovery] = useState<CalendarDiscovery | null>(null)

  useEffect(() => {
    let active = true

    const loadCalendarDiscovery = async () => {
      const result = await getOnboardingCalendarDiscoveryAction()
      if (!active || !result.success) return

      setCalendarDiscovery({
        connected: result.connected,
        eventCount: result.eventCount || 0,
        events: result.events || [],
      })

      if (result.connected && state.calendarProvider !== 'google') {
        setState((current) => ({ ...current, calendarProvider: 'google' }))
      }
    }

    void loadCalendarDiscovery()
    return () => {
      active = false
    }
  }, [])

  const questComplete = useMemo(() => {
    const completed = new Set(state.completedSteps)
    return {
      work: completed.has(1),
      calendar: completed.has(2) && (state.calendarProvider !== 'google' || !!calendarDiscovery?.connected),
      rhythm: completed.has(3),
      capacity: completed.has(5),
      plan: !!state.firstPlanActivityId || state.status === 'COMPLETED',
    }
  }, [calendarDiscovery?.connected, state])

  const questCount = Object.values(questComplete).filter(Boolean).length
  const progress = Math.round((Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100)

  const update = <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => {
    setState((current) => ({ ...current, [key]: value }))
    setError('')
  }

  const canContinue = () => {
    if (step === 3) {
      const [startHour, startMinute] = state.workStartTime.split(':').map(Number)
      const [endHour, endMinute] = state.workEndTime.split(':').map(Number)
      const start = startHour * 60 + startMinute
      const end = endHour * 60 + endMinute

      if (end <= start) {
        setError('Your finish time must be later than your start time.')
        return false
      }
      if (end - start < 60) {
        setError('Give yourself at least one hour in the workday window.')
        return false
      }
    }

    if (step === 4 && !state.planningStyle) {
      setError('Choose the planning style that feels most natural.')
      return false
    }

    if (step === 6 && state.focusAreas.length === 0) {
      setError('Choose at least one focus area.')
      return false
    }

    if (step === 7 && !state.firstDayObjective.trim()) {
      setError('Give your first day one clear objective.')
      return false
    }

    return true
  }

  const getClientTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || state.timezone || 'UTC'

  const saveAndContinue = async () => {
    if (!canContinue()) return

    const nextStep = Math.min(step + 1, TOTAL_STEPS)
    const completedSteps = Array.from(new Set([...state.completedSteps, step]))
    const nextState: OnboardingState = {
      ...state,
      timezone: getClientTimezone(),
      status: 'IN_PROGRESS',
      currentStep: nextStep,
      completedSteps,
    }

    setSaving(true)
    setError('')
    const result = await saveOnboardingStateAction(nextState)
    setSaving(false)

    if (!result.success || !result.state) {
      setError(result.error || 'Could not save your progress. Please try again.')
      return
    }

    setState(result.state)
    setStep(nextStep)
  }

  const finish = async () => {
    if (!canContinue()) return

    setSaving(true)
    setError('')
    const result = await completeOnboardingAction({
      ...state,
      timezone: getClientTimezone(),
      currentStep: TOTAL_STEPS,
      completedSteps: Array.from(new Set([...state.completedSteps, TOTAL_STEPS])),
    })
    setSaving(false)

    if (!result.success || !result.state) {
      setError(result.error || 'Could not generate your first-day plan. Please try again.')
      return
    }

    setState(result.state)
    window.location.assign('/')
  }

  const back = () => {
    setError('')
    setStep((current) => Math.max(0, current - 1))
  }

  const toggleTaskSource = (source: string) => {
    update('taskSources', state.taskSources.includes(source)
      ? state.taskSources.filter((item) => item !== source)
      : [...state.taskSources, source])
  }

  const toggleFocus = (focus: string) => {
    const selected = state.focusAreas.includes(focus)
    const next = selected
      ? state.focusAreas.filter((item) => item !== focus)
      : state.focusAreas.length < 3
        ? [...state.focusAreas, focus]
        : state.focusAreas
    update('focusAreas', next)
  }

  const capacityLabel = state.planningStyle === 'flexible'
    ? 'protected focus'
    : state.planningStyle === 'structured'
      ? 'planned work'
      : 'focused work'

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--elevation-raised)]">
              <Layers3 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">tracker</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">Setup quest</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Trophy className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>{questCount}/5 complete</span>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-5 gap-1.5">
          {QUESTS.map((quest) => {
            const complete = questComplete[quest.key as keyof typeof questComplete]
            return (
              <div key={quest.key} className="min-w-0">
                <div className={`h-1 overflow-hidden rounded-full ${complete ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`} />
                <div className="mt-2 hidden items-center gap-1.5 text-[10px] text-[var(--muted-foreground)] sm:flex">
                  <span className={complete ? 'text-[var(--success)]' : ''}>{quest.icon}</span>
                  <span className="truncate">{quest.label}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 h-px overflow-hidden bg-[var(--muted)]">
          <div className="h-full bg-[var(--primary)] transition-all duration-300" style={{ width: `${Math.max(progress, 4)}%` }} />
        </div>

        <section className="flex flex-1 items-center py-8 sm:py-12">
          <div className="w-full">
            {step === 0 && (
              <StepFrame icon={<Sparkles />} eyebrow="WELCOME" title={`Let's make Tracker fit ${username}.`} description="A few quick choices will shape your Today view, calendar and daily planning flow. The setup is saved as you go.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <IntroCard icon={<Compass />} title="Understand" text="Tell Tracker where your work lives." />
                  <IntroCard icon={<Clock3 />} title="Shape" text="Set your hours, capacity and rhythm." />
                  <IntroCard icon={<Rocket />} title="Launch" text="Leave with a real first-day activity." />
                </div>
              </StepFrame>
            )}

            {step === 1 && (
              <StepFrame icon={<ListTodo />} eyebrow="01 · YOUR WORK" title="Where does your work live?" description="Pick the tools you already use. Tracker records the preference now; actual provider connections can happen when each integration is ready.">
                <div className="grid gap-2 sm:grid-cols-3">
                  {TASK_SOURCES.map(([label, value]) => (
                    <Checkbox
                      key={value}
                      checked={state.taskSources.includes(value)}
                      onChange={() => toggleTaskSource(value)}
                      label={label}
                      className={`min-h-16 rounded-md border p-3 transition-colors ${state.taskSources.includes(value) ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)]'}`}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {state.taskSources.length ? `${state.taskSources.length} source${state.taskSources.length === 1 ? '' : 's'} selected` : 'You can skip this and connect tools later.'}
                </p>
              </StepFrame>
            )}

            {step === 2 && (
              <StepFrame icon={<CalendarDays />} eyebrow="02 · YOUR SCHEDULE" title="Where does your schedule live?" description="Tracker plans around your calendar instead of competing with it. Google Calendar can be connected now so your first plan respects your existing commitments.">
                <div className="grid gap-3 sm:grid-cols-3">
                  {CALENDARS.map(([label, value, note]) => {
                    const selected = state.calendarProvider === value
                    const google = value === 'google'
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!google}
                        onClick={() => google && update('calendarProvider', selected ? null : value)}
                        className={`min-h-24 rounded-md border p-4 text-left transition-colors ${selected ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)]'} ${!google ? 'cursor-default opacity-60' : 'hover:bg-[var(--accent)]'}`}
                      >
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{note}</p>
                        {google && (
                          <p className={`mt-3 text-xs font-medium ${calendarDiscovery?.connected ? 'text-[var(--success)]' : 'text-[var(--primary)]'}`}>
                            {calendarDiscovery?.connected ? 'Connected' : selected ? 'Selected' : 'Select'}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>

                {state.calendarProvider === 'google' && (
                  <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    {calendarDiscovery?.connected ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                          <p className="text-sm font-semibold">Google Calendar is connected.</p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {calendarDiscovery.eventCount === 0
                            ? 'Your next seven days are clear in the synced range.'
                            : `We found ${calendarDiscovery.eventCount} upcoming calendar event${calendarDiscovery.eventCount === 1 ? '' : 's'}.`}
                        </p>
                        {calendarDiscovery.events.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {calendarDiscovery.events.slice(0, 3).map((event) => (
                              <div key={event.id} className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                                <span className="truncate text-xs font-medium">{event.title}</span>
                                <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{formatCalendarTime(event.start)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">Connect Google Calendar</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Tracker will import your schedule, store the sync token, and prepare change notifications.</p>
                        </div>
                        <Button size="md" onClick={() => { window.location.href = '/api/integrations/google-calendar?returnTo=/onboarding' }}>
                          Connect
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <p className="mt-3 text-xs text-[var(--muted-foreground)]">You can continue without a calendar. Tracker will use your workday as the planning frame.</p>
              </StepFrame>
            )}

            {step === 3 && (
              <StepFrame icon={<Clock3 />} eyebrow="03 · YOUR RHYTHM" title="When does your workday usually run?" description="Tracker uses this as the planning frame. Your browser time zone is saved automatically so calendar-aware planning can stay local.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Start" value={state.workStartTime} onChange={(e) => update('workStartTime', e.target.value)} options={TIME_OPTIONS} />
                  <Select label="Finish" value={state.workEndTime} onChange={(e) => update('workEndTime', e.target.value)} options={TIME_OPTIONS} />
                </div>
                <Card compact className="mt-4 bg-[var(--surface-muted)]">
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">Planning window</p>
                  <p className="mt-1 text-sm font-semibold">{state.workStartTime} → {state.workEndTime}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{state.timezone}</p>
                </Card>
              </StepFrame>
            )}

            {step === 4 && (
              <StepFrame icon={<Compass />} eyebrow="04 · PLANNING STYLE" title="How do you like to plan?" description="This changes how much structure Tracker uses when creating your first plan.">
                <div className="grid gap-3 sm:grid-cols-3">
                  {PLANNING_STYLES.map(([label, value, description]) => (
                    <Checkbox
                      key={value}
                      checked={state.planningStyle === value}
                      onChange={() => update('planningStyle', value)}
                      label={label}
                      description={description}
                      className={`min-h-32 rounded-md border p-4 transition-colors ${state.planningStyle === value ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)]'}`}
                    />
                  ))}
                </div>
              </StepFrame>
            )}

            {step === 5 && (
              <StepFrame icon={<Zap />} eyebrow="05 · CAPACITY" title={state.planningStyle === 'flexible' ? 'How much time should Tracker protect?' : state.planningStyle === 'structured' ? 'How much of your day can be planned?' : 'How much focused work feels realistic?'} description="This is a capacity guardrail, not a productivity score.">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[2, 3, 4, 5, 6, 7, 8, 10].map((hours) => (
                    <label key={hours} className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-4 text-center transition-colors ${state.dailyCapacity === hours ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)]'}`}>
                      <input type="radio" name="capacity" className="sr-only" checked={state.dailyCapacity === hours} onChange={() => update('dailyCapacity', hours)} />
                      <span><span className="block text-lg font-semibold">{hours}h</span><span className="text-[11px] text-[var(--muted-foreground)]">{capacityLabel}</span></span>
                    </label>
                  ))}
                </div>
              </StepFrame>
            )}

            {step === 6 && (
              <StepFrame icon={<Target />} eyebrow="06 · FOCUS" title="What deserves space in your life?" description="Choose up to three areas. Tracker will use the first selected area to categorize your first generated activity.">
                <div className="grid gap-2 sm:grid-cols-3">
                  {FOCUS_AREAS.map(([label, value]) => (
                    <Checkbox key={value} checked={state.focusAreas.includes(value)} onChange={() => toggleFocus(value)} label={label}
                      className={`min-h-16 rounded-md border p-3 transition-colors ${state.focusAreas.includes(value) ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)]'}`} />
                  ))}
                </div>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">{state.focusAreas.length}/3 selected</p>
              </StepFrame>
            )}

            {step === 7 && (
              <StepFrame icon={<Target />} eyebrow="07 · FIRST MISSION" title="What would make today a good day?" description="Give Tracker one concrete outcome. It will turn this into your first real activity and place it inside your available work window when possible.">
                <Textarea
                  value={state.firstDayObjective}
                  onChange={(e) => update('firstDayObjective', e.target.value)}
                  placeholder="Finish the API integration, study for two hours, ship my portfolio update…"
                  rows={5}
                  maxLength={1000}
                />
                <div className="mt-2 flex justify-between text-[11px] text-[var(--muted-foreground)]">
                  <span>Keep it concrete and achievable.</span><span>{state.firstDayObjective.length}/1000</span>
                </div>
              </StepFrame>
            )}

            {step === 8 && (
              <StepFrame icon={<Trophy />} eyebrow="READY" title="Your first day is ready to be built." description="Tracker will use your objective, workday, capacity, planning style and connected calendar to create the first activity.">
                <Card className="relative overflow-hidden bg-[var(--surface)]">
                  <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[var(--primary)] opacity-10 blur-2xl" />
                  <div className="relative grid gap-4 sm:grid-cols-3">
                    <SummaryItem icon={<ListTodo />} label="Work sources" value={state.taskSources.length ? `${state.taskSources.length} selected` : 'Connect later'} />
                    <SummaryItem icon={<CalendarDays />} label="Calendar" value={calendarDiscovery?.connected ? 'Google connected' : 'Workday only'} />
                    <SummaryItem icon={<Zap />} label="Daily capacity" value={`${state.dailyCapacity}h`} />
                  </div>
                  <div className="mt-6 border-t border-[var(--border)] pt-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" />
                      <div><p className="text-sm font-semibold">First mission</p><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{state.firstDayObjective}</p></div>
                    </div>
                  </div>
                </Card>
                <div className="mt-4 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                  <span className="text-sm font-medium">{questCount}/5 setup milestones complete</span>
                  <span className="ml-auto text-xs text-[var(--muted-foreground)]">No points, no pressure.</span>
                </div>
              </StepFrame>
            )}

            {error && <p className="mt-4 text-sm text-[var(--destructive)]" role="alert">{error}</p>}

            <footer className="mt-8 flex items-center justify-between gap-3">
              <div className="min-w-24">
                {step > 0 && step < TOTAL_STEPS && <Button variant="ghost" size="md" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>}
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">{step + 1} / {TOTAL_STEPS + 1}</span>
                {step < TOTAL_STEPS ? (
                  <Button size="lg" onClick={saveAndContinue} disabled={saving} isLoading={saving} icon={<ArrowRight className="h-4 w-4" />}>
                    {step === 0 ? 'Start setup' : 'Continue'}
                  </Button>
                ) : (
                  <Button size="lg" onClick={finish} disabled={saving} isLoading={saving} icon={<Rocket className="h-4 w-4" />}>Build my first day</Button>
                )}
              </div>
            </footer>
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <Check className="h-3.5 w-3.5 text-[var(--success)]" /> Progress is saved as you go
        </div>
      </div>
    </main>
  )
}

function formatCalendarTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function StepFrame({ icon, eyebrow, title, description, children }: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] shadow-[var(--elevation-surface)]">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--primary)]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function IntroCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="min-h-32 justify-between" compact>
      <div className="mb-6 text-[var(--primary)]">{icon}</div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{text}</p>
      </div>
    </Card>
  )
}

function SummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--accent)] text-[var(--primary)]">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-[var(--muted-foreground)]">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}
