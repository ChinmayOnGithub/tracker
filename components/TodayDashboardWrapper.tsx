"use client"

import React, { useContext, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDataContext } from './DashboardLayout'
import { TodayDashboard } from './TodayDashboard'
import { ActivityLog, Note, AnalyzedTemplate } from '@/types'
import { useStore, JournalEntry, LeaveRecord, LeaveAllowance, WeightRecord } from '@/lib/store/store'
import { analyzeRecurrence } from '@/lib/recurrence'

interface TodayDashboardWrapperProps {
  analyzedTemplates: AnalyzedTemplate[]
  logs: ActivityLog[]
  notes: Note[]
  todayStr: string
  journalEntries: JournalEntry[]
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  weightRecords: WeightRecord[]
}

export const TodayDashboardWrapper: React.FC<TodayDashboardWrapperProps> = ({
  analyzedTemplates: initialAnalyzedTemplates,
  logs: initialLogs,
  notes: initialNotes,
  todayStr,
  journalEntries: initialJournalEntries,
  leaveRecords: initialLeaveRecords,
  leaveAllowances: initialLeaveAllowances,
  weightRecords: initialWeightRecords,
}) => {
  const router = useRouter()
  const context = useContext(CalendarDataContext)
  const { state, initialize } = useStore()

  // Initialize store with server-fetched props
  useEffect(() => {
    const templates = initialAnalyzedTemplates.map(t => t.template)
    initialize({
      templates,
      logs: initialLogs,
      notes: initialNotes,
      journalEntries: initialJournalEntries,
      leaveRecords: initialLeaveRecords,
      leaveAllowances: initialLeaveAllowances,
      weightRecords: initialWeightRecords,
    })
  }, [
    initialAnalyzedTemplates,
    initialLogs,
    initialNotes,
    initialJournalEntries,
    initialLeaveRecords,
    initialLeaveAllowances,
    initialWeightRecords,
    initialize,
  ])

  if (!context) {
    throw new Error('TodayDashboardWrapper must be rendered inside a DashboardLayout')
  }

  const { calendarData, fetchCalendar, onOpenCreateActivity } = context

  const onTabChange = (tabId: string) => {
    router.push(tabId === 'today' ? '/' : `/${tabId}`)
  }

  // Compute analyzedTemplates dynamically from the store state
  const analyzedTemplates = useMemo(() => {
    if (state.templates.length === 0) {
      return initialAnalyzedTemplates
    }
    return state.templates.map(template => {
      const templateLogs = state.logs.filter(log => log.activityId === template.id)
      const analysis = analyzeRecurrence(template, templateLogs, todayStr)
      return { template, analysis }
    })
  }, [state.templates, state.logs, todayStr, initialAnalyzedTemplates])

  return (
    <TodayDashboard
      analyzedTemplates={analyzedTemplates}
      logs={state.logs.length > 0 ? state.logs : initialLogs}
      _notes={state.notes.length > 0 ? state.notes : initialNotes}
      todayStr={todayStr}
      calendarData={calendarData}
      onRefetchCalendar={fetchCalendar}
      onOpenCreateActivity={onOpenCreateActivity}

      journalEntries={state.journalEntries.length > 0 ? state.journalEntries : initialJournalEntries}
      leaveRecords={state.leaveRecords.length > 0 ? state.leaveRecords : initialLeaveRecords}
      leaveAllowances={state.leaveAllowances.length > 0 ? state.leaveAllowances : initialLeaveAllowances}
      weightRecords={state.weightRecords.length > 0 ? state.weightRecords : initialWeightRecords}
      onTabChange={onTabChange}
    />
  )
}

