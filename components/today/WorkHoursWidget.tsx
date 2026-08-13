"use client"

import React, { useState } from 'react'
import { Briefcase, Clock } from 'lucide-react'
import { Card, Button } from '@/design-system'
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
      mode: 'manual',
      inTime: '09:00',
      outTime: '',
      manualHours: 8.0,
    }
  })
  const [isLoggingWork, setIsLoggingWork] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

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

  const computeOfficeHours = (inT: string, outT: string): number => {
    if (!inT || !outT) return 0
    const [inH, inM] = inT.split(':').map(Number)
    const [outH, outM] = outT.split(':').map(Number)
    let diffMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (diffMins < 0) diffMins += 24 * 60
    return parseFloat((diffMins / 60).toFixed(1))
  }

  const handleSaveWorkPresence = async () => {
    if (!workTemplateId || isLoggingWork) return
    setValidationError(null)

    // Validation
    if (formState.status !== 'cleared') {
      if (formState.mode === 'manual') {
        if (isNaN(formState.manualHours) || formState.manualHours < 0 || formState.manualHours > 24) {
          setValidationError('Please enter a valid number of hours between 0 and 24.')
          return
        }
      } else {
        if (!formState.inTime) {
          setValidationError('Please select a start time.')
          return
        }
      }
    }

    setIsLoggingWork(true)
    try {
      let computedHours = 0
      if (formState.status !== 'cleared') {
        if (formState.mode === 'time') {
          computedHours = formState.outTime ? computeOfficeHours(formState.inTime, formState.outTime) : 0
        } else {
          computedHours = formState.manualHours
        }
      }

      await logWorkPresenceAction({
        templateId: workTemplateId,
        date: todayStr,
        status: formState.status,
        inTime: formState.status !== 'cleared' && formState.mode === 'time' ? formState.inTime : null,
        outTime: formState.status !== 'cleared' && formState.mode === 'time' ? (formState.outTime || null) : null,
        hours: computedHours,
        loggingMode: formState.status !== 'cleared' ? formState.mode : null,
        manualHours: formState.status !== 'cleared' && formState.mode === 'manual' ? formState.manualHours : null
      })
    } catch (err) {
      console.error('Failed to log work presence:', err)
      setValidationError('Failed to save presence records.')
    } finally {
      setIsLoggingWork(false)
    }
  }

  return (
    <Card className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
        <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
          Work Hours Tracker
        </span>
        <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
      </div>

      <div className="space-y-3">
        {/* Status Segmented Control */}
        <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[9px] border border-[var(--color-border)]">
          {(['cleared', 'office', 'wfh'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFormState(prev => ({ ...prev, status }))}
              className={`flex-1 py-2.5 md:py-1 text-[10px] font-bold rounded-md capitalize transition-all duration-150 cursor-pointer ${
                formState.status === status
                  ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
              }`}
            >
              {status === 'cleared' ? 'Clear' : status}
            </button>
          ))}
        </div>

        {/* Inputs depending on status */}
        {formState.status !== 'cleared' && (
          <div className="space-y-3">
            {/* Mode Segmented Control */}
            <div className="flex bg-[var(--color-bg-base)] p-0.5 rounded-[9px] border border-[var(--color-border)]">
              {(['time', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode === 'manual' && formState.inTime && formState.outTime) {
                      setFormState(prev => ({
                        ...prev,
                        mode,
                        manualHours: computeOfficeHours(formState.inTime, formState.outTime),
                      }))
                    } else {
                      setFormState(prev => ({ ...prev, mode }))
                    }
                  }}
                  className={`flex-1 py-2.5 md:py-1 text-[10px] font-bold rounded-md capitalize transition-all duration-150 cursor-pointer ${
                    formState.mode === mode
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs border border-[var(--color-border)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                  }`}
                >
                  {mode === 'time' ? 'Time-Based' : 'Manual'}
                </button>
              ))}
            </div>

            {/* Time-Based Fields */}
            {formState.mode === 'time' && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Start Time</label>
                    <input
                      type="time"
                      value={formState.inTime}
                      onChange={(e) => setFormState(prev => ({ ...prev, inTime: e.target.value }))}
                      className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">End Time</label>
                    <input
                      type="time"
                      value={formState.outTime}
                      onChange={(e) => setFormState(prev => ({ ...prev, outTime: e.target.value }))}
                      className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-right font-semibold text-[var(--color-text-muted)] pr-0.5 flex justify-between items-center">
                  <span>Status:</span>
                  {!formState.outTime ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Session Active
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-main)] font-mono">
                      Calculated: {computeOfficeHours(formState.inTime, formState.outTime)}h
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Manual Fields */}
            {formState.mode === 'manual' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                  <span>Total Hours Worked</span>
                  <span className="text-xs font-mono text-[var(--color-text-main)] font-bold">{formState.manualHours}h</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={formState.manualHours}
                  onChange={(e) => setFormState(prev => ({ ...prev, manualHours: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-xs font-mono bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            )}
          </div>
        )}

        {/* Validation Errors */}
        {validationError && (
          <p className="text-[10px] text-rose-500 font-semibold text-center">{validationError}</p>
        )}

        {/* Action Button */}
        <Button
          onClick={handleSaveWorkPresence}
          isLoading={isLoggingWork}
          variant="primary"
          size="sm"
          className="w-full font-bold text-xs"
        >
          Save Presence
        </Button>

        {/* Progress Grid */}
        <div className="border-t border-[var(--color-border)]/50 pt-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--color-text-muted)]">
            <span>Weekly Office Presence</span>
            <span className="font-mono text-[var(--color-text-main)]">
              {totalOfficeHours}h / {weeklyGoal}h
            </span>
          </div>
          <div className="w-full h-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-full overflow-hidden">
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
      </div>
    </Card>
  )
}
