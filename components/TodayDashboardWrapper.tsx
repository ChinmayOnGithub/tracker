"use client"

import React, { useContext, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDataContext } from './DashboardLayout'
import { TodayDashboard, TodayDashboardProps } from './TodayDashboard'
import { ActivityTemplate, ActivityLog, Note, TimelineItem, AnalyzedTemplate } from '@/types'
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
  const { state, initialize, cycleTaskStatusAction } = useStore()

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

  const { calendarData, fetchCalendar, onOpenCreateActivity, onEditTemplate } = context

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

  // Handle local mark complete wrapper via store queue
  const onMarkHabitComplete = async (template: ActivityTemplate) => {
    const existingLog = state.logs.find(l => l.activityId === template.id && l.date === todayStr)
    const occurrence: TimelineItem = {
      id: existingLog?.id || `temp-${template.id}`,
      templateId: template.id,
      templateName: template.name,
      type: template.type,
      priority: template.priority,
      start: new Date(),
      end: new Date(),
      isAllDay: true,
      completed: !!existingLog,
      logId: existingLog?.id,
      status: existingLog?.status || undefined
    }
    await cycleTaskStatusAction(occurrence, todayStr)
  }

  return (
    <TodayDashboard
      analyzedTemplates={analyzedTemplates}
      logs={state.logs.length > 0 ? state.logs : initialLogs}
      _notes={state.notes.length > 0 ? state.notes : initialNotes}
      todayStr={todayStr}
      calendarData={calendarData}
      onRefetchCalendar={fetchCalendar}
      onOpenCreateActivity={onOpenCreateActivity}
      _onMarkHabitComplete={onMarkHabitComplete}
      _onEditTemplate={onEditTemplate}
      journalEntries={(state.journalEntries.length > 0 ? state.journalEntries : initialJournalEntries) as unknown as TodayDashboardProps['journalEntries']}
      leaveRecords={(state.leaveRecords.length > 0 ? state.leaveRecords : initialLeaveRecords) as unknown as TodayDashboardProps['leaveRecords']}
      leaveAllowances={(state.leaveAllowances.length > 0 ? state.leaveAllowances : initialLeaveAllowances) as unknown as TodayDashboardProps['leaveAllowances']}
      weightRecords={(state.weightRecords.length > 0 ? state.weightRecords : initialWeightRecords) as unknown as TodayDashboardProps['weightRecords']}
      onTabChange={onTabChange}
    />
  )
}

