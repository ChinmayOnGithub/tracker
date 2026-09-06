"use client"

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Briefcase, Clock, Play, Square, Pencil, Pause, RotateCcw } from 'lucide-react'
import { Card, CardHeader, CardBody, Button, Input } from '@/design-system'
import { ActivityLog } from '@/types'

interface WorkHoursWidgetProps {
  todayWorkLog: ActivityLog | null
  workTemplateId: string | null
  todayStr: string
  weekDates: string[]
  logs: ActivityLog[]
  weeklyGoal: number
  logWorkPresenceAction: (data: unknown) => Promise<unknown>
  gridW?: number
  gridH?: number
}

export type WorkSessionState = 'idle' | 'running' | 'paused' | 'completed'

interface WorkFormState {
  status: 'office' | 'wfh' | 'cleared'
  mode: 'time' | 'manual'
  sessionState: WorkSessionState
  accumulatedSeconds: number
  currentSegmentStartedAt: string | null
  inTime: string
  outTime: string
  manualHours: number
}

function parseInitialWorkState(todayWorkLog: ActivityLog | null): WorkFormState {
  if (todayWorkLog && todayWorkLog.status !== 'cleared') {
    const payload = todayWorkLog.payload as Record<string, unknown> | null
    const status = todayWorkLog.status === 'wfh' ? 'wfh' : 'office'
    const mode = (payload?.loggingMode as 'time' | 'manual') || (payload?.manualHours ? 'manual' : 'time')
    const inTime = (payload?.inTime as string) || ''
    const outTime = (payload?.outTime as string) || ''
    const manualHours = payload?.manualHours !== undefined ? Number(payload.manualHours) : (todayWorkLog.amount || 8.0)
    
    // Explicit session state resolution
    let sessionState: WorkSessionState = 'idle'
    if (payload?.sessionState) {
      sessionState = payload.sessionState as WorkSessionState
    } else if (outTime) {
      sessionState = 'completed'
    } else if (payload?.currentSegmentStartedAt) {
      sessionState = 'running'
    } else if (todayWorkLog.amount && todayWorkLog.amount > 0) {
      sessionState = 'completed'
    }

    const accumulatedSeconds = typeof payload?.accumulatedSeconds === 'number'
      ? payload.accumulatedSeconds
      : (todayWorkLog.amount ? Math.round(todayWorkLog.amount * 3600) : 0)

    const currentSegmentStartedAt = (payload?.currentSegmentStartedAt as string) || null

    return {
      status,
      mode,
      sessionState,
      accumulatedSeconds,
      currentSegmentStartedAt,
      inTime,
      outTime,
      manualHours,
    }
  }

  return {
    status: 'cleared',
    mode: 'time',
    sessionState: 'idle',
    accumulatedSeconds: 0,
    currentSegmentStartedAt: null,
    inTime: '',
    outTime: '',
    manualHours: 8.0,
  }
}

/**
 * WorkHoursWidget
 * Dashboard widget for tracking daily work hours, in/out timings, live session timers (running/paused),
 * and weekly office vs WFH goals against target work hours.
 */

export const WorkHoursWidget: React.FC<WorkHoursWidgetProps> = ({
  todayWorkLog,
  workTemplateId,
  todayStr,
  weekDates,
  logs,
  weeklyGoal,
  logWorkPresenceAction,
  gridW: _gridW = 7,
  gridH = 5,
}) => {
  const isCompactHeight = gridH <= 4
  const [prevSyncKey, setPrevSyncKey] = useState<string>(`${todayStr}:${todayWorkLog?.id || 'none'}`)
  const [formState, setFormState] = useState<WorkFormState>(() => parseInitialWorkState(todayWorkLog))
  const [isEditingTimes, setIsEditingTimes] = useState(false)

  // Synchronize when date or todayWorkLog changes externally
  const currentKey = `${todayStr}:${todayWorkLog?.id || 'none'}`
  if (prevSyncKey !== currentKey) {
    setPrevSyncKey(currentKey)
    setFormState(parseInitialWorkState(todayWorkLog))
  }

  const [isLoggingWork, setIsLoggingWork] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())

  // Timer ticking for live display when RUNNING
  useEffect(() => {
    let interval: Timer | null = null
    if (formState.sessionState === 'running') {
      interval = setInterval(() => {
        setNowTimestamp(Date.now())
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [formState.sessionState])

  // Stats calculation
  const weeklyWorkLogs = useMemo(() => {
    return workTemplateId
      ? logs.filter(l => l.activityId === workTemplateId && weekDates.includes(l.date))
      : []
  }, [workTemplateId, logs, weekDates])

  const totalOfficeHours = useMemo(() => {
    return weeklyWorkLogs
      .filter(l => l.status === 'done')
      .reduce((sum, l) => sum + (l.amount ?? 0), 0)
  }, [weeklyWorkLogs])

  const totalWfhHours = useMemo(() => {
    return weeklyWorkLogs
      .filter(l => l.status === 'wfh')
      .reduce((sum, l) => sum + (l.amount ?? 0), 0)
  }, [weeklyWorkLogs])

  const remainingHours = Math.max(0, weeklyGoal - totalOfficeHours)
  const isGoalMet = totalOfficeHours >= weeklyGoal

  const getLocalTimeStr = () => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  // Calculate current elapsed seconds: accumulated duration + elapsed duration in current active segment
  const currentElapsedSeconds = useMemo(() => {
    if (formState.sessionState === 'running' && formState.currentSegmentStartedAt) {
      const segmentStartMs = new Date(formState.currentSegmentStartedAt).getTime()
      const segmentElapsedSec = Math.max(0, Math.floor((nowTimestamp - segmentStartMs) / 1000))
      return formState.accumulatedSeconds + segmentElapsedSec
    }
    return formState.accumulatedSeconds
  }, [formState.sessionState, formState.currentSegmentStartedAt, formState.accumulatedSeconds, nowTimestamp])

  const formatElapsedDisplay = (totalSec: number): string => {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${h}h ${m}m ${s}s`
  }

  const computeManualOrTimeHours = (inT: string, outT: string): number => {
    if (!inT || !outT) return 0
    const [inH, inM] = inT.split(':').map(Number)
    const [outH, outM] = outT.split(':').map(Number)
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (diffMins < 0) diffMins += 24 * 60
    return parseFloat((diffMins / 60).toFixed(1))
  }

  const handleSaveWorkPresence = useCallback(async (stateToSave: WorkFormState) => {
    if (!workTemplateId || isLoggingWork) return
    setValidationError(null)

    if (stateToSave.status !== 'cleared') {
      if (stateToSave.mode === 'manual') {
        if (isNaN(stateToSave.manualHours) || stateToSave.manualHours < 0 || stateToSave.manualHours > 24) {
          setValidationError('Please enter a valid number of hours between 0 and 24.')
          return
        }
      }
    }

    setIsLoggingWork(true)
    try {
      let computedHours = 0
      if (stateToSave.status !== 'cleared') {
        if (stateToSave.mode === 'manual') {
          computedHours = stateToSave.manualHours
        } else if (stateToSave.sessionState === 'completed' && stateToSave.outTime && stateToSave.inTime && !stateToSave.accumulatedSeconds) {
          computedHours = computeManualOrTimeHours(stateToSave.inTime, stateToSave.outTime)
        } else {
          computedHours = parseFloat((stateToSave.accumulatedSeconds / 3600).toFixed(1))
        }
      }

      await logWorkPresenceAction({
        templateId: workTemplateId,
        date: todayStr,
        status: stateToSave.status,
        inTime: stateToSave.status !== 'cleared' && stateToSave.mode === 'time' ? (stateToSave.inTime || null) : null,
        outTime: stateToSave.status !== 'cleared' && stateToSave.mode === 'time' ? (stateToSave.outTime || null) : null,
        hours: computedHours,
        loggingMode: stateToSave.status !== 'cleared' ? stateToSave.mode : null,
        manualHours: stateToSave.status !== 'cleared' && stateToSave.mode === 'manual' ? stateToSave.manualHours : null,
        sessionState: stateToSave.status !== 'cleared' ? stateToSave.sessionState : null,
        accumulatedSeconds: stateToSave.accumulatedSeconds,
        currentSegmentStartedAt: stateToSave.currentSegmentStartedAt,
      })
      setIsEditingTimes(false)
    } catch (err) {
      console.error('Failed to log work presence:', err)
      setValidationError('Failed to save presence records.')
    } finally {
      setIsLoggingWork(false)
    }
  }, [workTemplateId, isLoggingWork, todayStr, logWorkPresenceAction])

  // Explicit Start (Transitions from IDLE to RUNNING)
  const handleStartSession = async (chosenStatus: 'office' | 'wfh') => {
    if (isLoggingWork || formState.sessionState === 'running') return
    const nowTime = getLocalTimeStr()
    const nowIso = new Date().toISOString()
    const updated: WorkFormState = {
      ...formState,
      status: chosenStatus,
      mode: 'time',
      sessionState: 'running',
      inTime: formState.inTime || nowTime,
      outTime: '',
      currentSegmentStartedAt: nowIso,
      // If starting fresh from IDLE, accumulatedSeconds is preserved if restarting same day or 0
      accumulatedSeconds: formState.sessionState === 'completed' ? formState.accumulatedSeconds : 0,
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  // Explicit Pause (Transitions from RUNNING to PAUSED without losing elapsed time)
  const handlePauseSession = async () => {
    if (isLoggingWork || formState.sessionState !== 'running') return
    const nowMs = Date.now()
    const segmentStartMs = formState.currentSegmentStartedAt ? new Date(formState.currentSegmentStartedAt).getTime() : nowMs
    const segmentSec = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000))
    const totalAccumulated = formState.accumulatedSeconds + segmentSec

    const updated: WorkFormState = {
      ...formState,
      sessionState: 'paused',
      accumulatedSeconds: totalAccumulated,
      currentSegmentStartedAt: null,
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  // Explicit Resume (Transitions from PAUSED to RUNNING, continuing from previous accumulated time)
  const handleResumeSession = async () => {
    if (isLoggingWork || formState.sessionState !== 'paused') return
    const nowIso = new Date().toISOString()
    const updated: WorkFormState = {
      ...formState,
      sessionState: 'running',
      currentSegmentStartedAt: nowIso,
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  // Explicit Finish Day (Transitions from RUNNING or PAUSED to COMPLETED)
  const handleFinishSession = async () => {
    if (isLoggingWork) return
    const nowTime = getLocalTimeStr()
    let totalSec = formState.accumulatedSeconds
    if (formState.sessionState === 'running' && formState.currentSegmentStartedAt) {
      const segmentStartMs = new Date(formState.currentSegmentStartedAt).getTime()
      totalSec += Math.max(0, Math.floor((Date.now() - segmentStartMs) / 1000))
    }

    const updated: WorkFormState = {
      ...formState,
      sessionState: 'completed',
      outTime: nowTime,
      accumulatedSeconds: totalSec,
      currentSegmentStartedAt: null,
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  const handleClearPresence = async () => {
    const updated: WorkFormState = {
      status: 'cleared',
      mode: 'time',
      sessionState: 'idle',
      accumulatedSeconds: 0,
      currentSegmentStartedAt: null,
      inTime: '',
      outTime: '',
      manualHours: 8.0,
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  const activeModeLabel = formState.status === 'office' ? 'Office' : 'WFH'

  return (
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className="pb-2 border-b border-[var(--color-border)]/40 mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
          Work Hours Tracker
        </span>
        <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
      </CardHeader>

      <CardBody className={isCompactHeight ? 'space-y-2 py-1' : 'space-y-3'}>
        {/* RUNNING STATE */}
        {formState.sessionState === 'running' && !isEditingTimes && (
          <div className={isCompactHeight ? 'space-y-2' : 'space-y-3'}>
            <div className={`flex ${isCompactHeight ? 'py-1.5 px-3 flex-row justify-between' : 'flex-col justify-center py-4'} items-center bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-lg)]`}>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active ({activeModeLabel})
                </span>
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {formState.inTime ? `Started at ${formState.inTime}` : 'In progress'}
                </span>
              </div>
              <span className={`${isCompactHeight ? 'text-xl' : 'text-2xl'} font-mono font-black text-[var(--color-primary)] tracking-tight`}>
                {formatElapsedDisplay(currentElapsedSeconds)}
              </span>
            </div>

            <div className="flex gap-1.5">
              <Button
                onClick={handlePauseSession}
                isLoading={isLoggingWork}
                variant="outline"
                size="sm"
                className="flex-1 font-bold text-xs"
                icon={<Pause className="w-3.5 h-3.5 text-amber-500" />}
              >
                Pause
              </Button>
              <Button
                onClick={handleFinishSession}
                isLoading={isLoggingWork}
                variant="primary"
                size="sm"
                className="flex-1 font-bold text-xs"
                icon={<Square className="w-3.5 h-3.5" />}
              >
                Finish
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingTimes(true)}
                title="Edit times manually"
                icon={<Pencil className="w-3.5 h-3.5" />}
              />
            </div>
          </div>
        )}

        {/* PAUSED STATE */}
        {formState.sessionState === 'paused' && !isEditingTimes && (
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center py-4 bg-[var(--color-bg-base)] border border-amber-500/30 rounded-[var(--radius-lg)] space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-500 flex items-center gap-1.5">
                <Pause className="w-3 h-3" />
                Session Paused ({activeModeLabel})
              </span>
              <span className="text-2xl font-mono font-black text-[var(--color-text-muted)] tracking-tight">
                {formatElapsedDisplay(formState.accumulatedSeconds)}
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)]">
                Accumulated time preserved
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleResumeSession}
                isLoading={isLoggingWork}
                variant="primary"
                size="sm"
                className="flex-1 font-bold text-xs"
                icon={<Play className="w-3.5 h-3.5" />}
              >
                Resume
              </Button>
              <Button
                onClick={handleFinishSession}
                isLoading={isLoggingWork}
                variant="outline"
                size="sm"
                className="flex-1 font-bold text-xs"
                icon={<Square className="w-3.5 h-3.5" />}
              >
                Finish Day
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingTimes(true)}
                title="Edit times manually"
                icon={<Pencil className="w-3.5 h-3.5" />}
              />
            </div>
          </div>
        )}

        {/* COMPLETED STATE */}
        {formState.sessionState === 'completed' && !isEditingTimes && (
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center py-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-[var(--radius-lg)] space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400">
                Completed Day ({activeModeLabel})
              </span>
              <span className="text-2xl font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {(formState.accumulatedSeconds / 3600).toFixed(1)}h
              </span>
              {formState.inTime && formState.outTime && (
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {formState.inTime} – {formState.outTime}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleStartSession(formState.status === 'wfh' ? 'wfh' : 'office')}
                isLoading={isLoggingWork}
                variant="outline"
                size="sm"
                className="flex-1 font-bold text-xs"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Start New Session
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingTimes(true)}
                title="Edit times manually"
                icon={<Pencil className="w-3.5 h-3.5" />}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearPresence}
                title="Clear today's work record"
                className="text-rose-500 hover:text-rose-600"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* IDLE OR EDITING TIMES STATE */}
        {(formState.sessionState === 'idle' || isEditingTimes) && (
          <div className="space-y-3">
            {/* Status Segmented Control */}
            <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)]">
              {(['cleared', 'office', 'wfh'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    if (status === 'cleared') {
                      handleClearPresence()
                    } else {
                      setFormState(prev => ({ ...prev, status }))
                    }
                  }}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-[var(--radius-md)] capitalize transition-all duration-150 cursor-pointer ${
                    formState.status === status
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                  }`}
                >
                  {status === 'cleared' ? 'Clear' : status}
                </button>
              ))}
            </div>

            {formState.status !== 'cleared' && (
              <div className="space-y-3">
                {/* Mode Segmented Control */}
                <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)]">
                  {(['time', 'manual'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormState(prev => ({ ...prev, mode }))}
                      className={`flex-1 py-1.5 text-[10px] font-bold rounded-[var(--radius-md)] capitalize transition-all duration-150 cursor-pointer ${
                        formState.mode === mode
                          ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                      }`}
                    >
                      {mode === 'time' ? 'Timer' : 'Manual'}
                    </button>
                  ))}
                </div>

                {formState.mode === 'time' ? (
                  <div className="space-y-2">
                    {isEditingTimes ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="time"
                          label="Start Time"
                          value={formState.inTime}
                          onChange={(e) => setFormState(prev => ({ ...prev, inTime: e.target.value }))}
                          className="font-mono text-xs"
                        />
                        <Input
                          type="time"
                          label="End Time"
                          value={formState.outTime}
                          onChange={(e) => setFormState(prev => ({ ...prev, outTime: e.target.value }))}
                          className="font-mono text-xs"
                        />
                      </div>
                    ) : (
                      <div className="py-2 flex flex-col items-center">
                        <Button
                          onClick={() => handleStartSession(formState.status as 'office' | 'wfh')}
                          isLoading={isLoggingWork}
                          variant="primary"
                          size="sm"
                          className="w-full font-bold text-xs"
                          icon={<Play className="w-3.5 h-3.5" />}
                        >
                          Start {formState.status === 'office' ? 'Office' : 'WFH'} Session
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Input
                      type="number"
                      label="Total Hours Worked"
                      min="0"
                      max="24"
                      step="0.5"
                      value={formState.manualHours}
                      onChange={(e) => setFormState(prev => ({ ...prev, manualHours: parseFloat(e.target.value) || 0 }))}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Save / Cancel Footer for Manual or Editing Times */}
            {formState.status !== 'cleared' && (formState.mode === 'manual' || isEditingTimes) && (
              <div className="space-y-2">
                {validationError && (
                  <p className="text-[10px] text-rose-500 font-semibold text-center">{validationError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (isEditingTimes && formState.mode === 'time' && formState.inTime && formState.outTime) {
                        const computedHrs = computeManualOrTimeHours(formState.inTime, formState.outTime)
                        const updated: WorkFormState = {
                          ...formState,
                          sessionState: 'completed',
                          accumulatedSeconds: Math.round(computedHrs * 3600),
                        }
                        setFormState(updated)
                        handleSaveWorkPresence(updated)
                      } else {
                        handleSaveWorkPresence(formState)
                      }
                    }}
                    isLoading={isLoggingWork}
                    variant="primary"
                    size="sm"
                    className="flex-1 font-bold text-xs"
                  >
                    Save Hours
                  </Button>
                  {isEditingTimes && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingTimes(false)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekly Progress Grid */}
        <div className="border-t border-[var(--color-border)]/50 pt-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--color-text-muted)]">
            <span>Weekly Office Presence</span>
            <span className="font-mono text-[var(--color-text-main)]">
              {totalOfficeHours}h / {weeklyGoal}h
            </span>
          </div>
          <div className="w-full h-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${isGoalMet ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (totalOfficeHours / weeklyGoal) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[9px] font-semibold text-[var(--color-text-muted)]">
            <span>
              {isGoalMet ? '🎉 Weekly Goal Met!' : `${remainingHours.toFixed(1)}h remaining`}
            </span>
            {totalWfhHours > 0 && (
              <span>WFH: <span className="font-mono text-[var(--color-text-main)]">{totalWfhHours}h</span></span>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
