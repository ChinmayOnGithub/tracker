"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Briefcase, Clock, Play, Square, Pencil } from 'lucide-react'
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
}

type WorkFormState = {
  status: 'office' | 'wfh' | 'cleared'
  mode: 'time' | 'manual'
  inTime: string
  outTime: string
  manualHours: number
}

export const WorkHoursWidget: React.FC<WorkHoursWidgetProps> = ({
  todayWorkLog,
  workTemplateId,
  todayStr,
  weekDates,
  logs,
  weeklyGoal,
  logWorkPresenceAction,
}) => {
  const [formState, setFormState] = useState<WorkFormState>(() => {
    if (todayWorkLog) {
      const payload = todayWorkLog.payload as Record<string, unknown> | null
      return {
        status: todayWorkLog.status === 'wfh' ? 'wfh' : 'office',
        mode: (payload?.loggingMode as 'time' | 'manual') || (payload?.inTime ? 'time' : 'manual'),
        inTime: (payload?.inTime as string) || '09:00',
        outTime: (payload?.outTime as string) || '',
        manualHours: payload?.manualHours !== undefined ? Number(payload.manualHours) : (todayWorkLog.amount || 8.0),
      }
    }
    return {
      status: 'cleared',
      mode: 'time',
      inTime: '09:00',
      outTime: '',
      manualHours: 8.0,
    }
  })

  const [isEditingTimes, setIsEditingTimes] = useState(false)
  const lastSyncedLogId = useRef<string | null | undefined>(todayWorkLog?.id)

  if (lastSyncedLogId.current !== todayWorkLog?.id) {
    lastSyncedLogId.current = todayWorkLog?.id
    if (todayWorkLog) {
      const payload = todayWorkLog.payload as Record<string, unknown> | null
      setFormState({
        status: todayWorkLog.status === 'wfh' ? 'wfh' : 'office',
        mode: (payload?.loggingMode as 'time' | 'manual') || (payload?.inTime ? 'time' : 'manual'),
        inTime: (payload?.inTime as string) || '09:00',
        outTime: (payload?.outTime as string) || '',
        manualHours: payload?.manualHours !== undefined ? Number(payload.manualHours) : (todayWorkLog.amount || 8.0),
      })
    } else {
      setFormState({
        status: 'cleared',
        mode: 'time',
        inTime: '09:00',
        outTime: '',
        manualHours: 8.0,
      })
    }
  }

  const [isLoggingWork, setIsLoggingWork] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [_tick, setTick] = useState(0)

  useEffect(() => {
    let interval: Timer | null = null
    if (formState.status !== 'cleared' && formState.mode === 'time' && !formState.outTime) {
      interval = setInterval(() => {
        setTick(t => t + 1)
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [formState.status, formState.mode, formState.outTime])

  // Stats calculation
  const weeklyWorkLogs = workTemplateId
    ? logs.filter(l => l.activityId === workTemplateId && weekDates.includes(l.date))
    : []

  const totalOfficeHours = weeklyWorkLogs
    .filter(l => l.status === 'done')
    .reduce((sum, l) => sum + (l.amount ?? 0), 0)

  const totalWfhHours = weeklyWorkLogs
    .filter(l => l.status === 'wfh')
    .reduce((sum, l) => sum + (l.amount ?? 0), 0)

  const remainingHours = Math.max(0, weeklyGoal - totalOfficeHours)
  const isGoalMet = totalOfficeHours >= weeklyGoal

  const getLocalTimeStr = () => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  const computeOfficeHours = (inT: string, outT: string): number => {
    if (!inT || !outT) return 0
    const [inH, inM] = inT.split(':').map(Number)
    const [outH, outM] = outT.split(':').map(Number)
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (diffMins < 0) diffMins += 24 * 60
    return parseFloat((diffMins / 60).toFixed(1))
  }

  const computeElapsedHours = (inT: string): string => {
    if (!inT) return '0h 0m'
    const [inH, inM] = inT.split(':').map(Number)
    const now = new Date()
    const inDate = new Date()
    inDate.setHours(inH, inM, 0, 0)
    
    let diffMs = now.getTime() - inDate.getTime()
    if (diffMs < 0) {
      diffMs += 24 * 60 * 60 * 1000
    }
    const diffMins = Math.floor(diffMs / (60 * 1000))
    const h = Math.floor(diffMins / 60)
    const m = diffMins % 60
    const s = Math.floor((diffMs % (60 * 1000)) / 1000)
    return `${h}h ${m}m ${s}s`
  }

  const handleSaveWorkPresence = async (customState?: WorkFormState) => {
    if (!workTemplateId || isLoggingWork) return
    setValidationError(null)

    const stateToSave = customState || formState

    if (stateToSave.status !== 'cleared') {
      if (stateToSave.mode === 'manual') {
        if (isNaN(stateToSave.manualHours) || stateToSave.manualHours < 0 || stateToSave.manualHours > 24) {
          setValidationError('Please enter a valid number of hours between 0 and 24.')
          return
        }
      } else {
        if (!stateToSave.inTime) {
          setValidationError('Please select a start time.')
          return
        }
      }
    }

    setIsLoggingWork(true)
    try {
      let computedHours = 0
      if (stateToSave.status !== 'cleared') {
        if (stateToSave.mode === 'time') {
          computedHours = stateToSave.outTime ? computeOfficeHours(stateToSave.inTime, stateToSave.outTime) : 0
        } else {
          computedHours = stateToSave.manualHours
        }
      }

      await logWorkPresenceAction({
        templateId: workTemplateId,
        date: todayStr,
        status: stateToSave.status,
        inTime: stateToSave.status !== 'cleared' && stateToSave.mode === 'time' ? stateToSave.inTime : null,
        outTime: stateToSave.status !== 'cleared' && stateToSave.mode === 'time' ? (stateToSave.outTime || null) : null,
        hours: computedHours,
        loggingMode: stateToSave.status !== 'cleared' ? stateToSave.mode : null,
        manualHours: stateToSave.status !== 'cleared' && stateToSave.mode === 'manual' ? stateToSave.manualHours : null
      })
      setIsEditingTimes(false)
    } catch (err) {
      console.error('Failed to log work presence:', err)
      setValidationError('Failed to save presence records.')
    } finally {
      setIsLoggingWork(false)
    }
  }

  const handleStartSession = async (status: 'office' | 'wfh') => {
    const nowTime = getLocalTimeStr()
    const updated: WorkFormState = {
      status,
      mode: 'time',
      inTime: nowTime,
      outTime: '',
      manualHours: 8.0
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  const handleStopSession = async () => {
    const nowTime = getLocalTimeStr()
    const updated: WorkFormState = {
      ...formState,
      outTime: nowTime
    }
    setFormState(updated)
    await handleSaveWorkPresence(updated)
  }

  const isActiveSession = formState.status !== 'cleared' && formState.mode === 'time' && !formState.outTime

  return (
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className="pb-2 border-b border-[var(--color-border)]/40 mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
          Work Hours Tracker
        </span>
        <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
      </CardHeader>

      <CardBody className="space-y-3">
        {isActiveSession && !isEditingTimes ? (
          /* Active Session View */
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center py-5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-lg)] space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-[var(--color-text-muted)]">
                Active Session ({formState.status === 'office' ? 'Office' : 'WFH'})
              </span>
              <span className="text-2xl font-mono font-black text-[var(--color-primary)] tracking-tight">
                {computeElapsedHours(formState.inTime)}
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)]">
                Started at {formState.inTime}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleStopSession}
                isLoading={isLoggingWork}
                variant="primary"
                size="sm"
                className="flex-1 font-bold text-xs"
                icon={<Square className="w-3.5 h-3.5" />}
              >
                Stop Session
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
        ) : (
          /* Set/Edit Session View */
          <div className="space-y-3">
            {/* Status Segmented Control (only when not editing an active timer manually) */}
            <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)]">
              {(['cleared', 'office', 'wfh'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setFormState(prev => ({ ...prev, status }))
                    if (status === 'cleared') {
                      handleSaveWorkPresence({
                        status: 'cleared',
                        mode: 'time',
                        inTime: '',
                        outTime: '',
                        manualHours: 0
                      })
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
                      {mode === 'time' ? 'Time-Based' : 'Manual'}
                    </button>
                  ))}
                </div>

                {formState.mode === 'time' ? (
                  /* Time-Based Inputs */
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
                  /* Manual Hours Input */
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

            {/* Validation / Action Footer (only when input is shown) */}
            {formState.status !== 'cleared' && (formState.mode === 'manual' || isEditingTimes) && (
              <div className="space-y-2">
                {validationError && (
                  <p className="text-[10px] text-rose-500 font-semibold text-center">{validationError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSaveWorkPresence()}
                    isLoading={isLoggingWork}
                    variant="primary"
                    size="sm"
                    className="flex-1 font-bold text-xs"
                  >
                    Save Presence
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

        {/* Progress Grid */}
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
