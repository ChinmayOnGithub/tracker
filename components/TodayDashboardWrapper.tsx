"use client"

import React, { useContext, useEffect, useMemo, useRef } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { TodayDashboard } from './TodayDashboard'
import { ActivityLog, AnalyzedTemplate } from '@/types'
import { useStore, JournalEntry, LeaveRecord, LeaveAllowance, WeightRecord } from '@/lib/store/store'
import { analyzeRecurrence } from '@/lib/recurrence'
import { fetchDashboardDataAction } from '@/app/actions/queries'
import { Skeleton } from '@/design-system'

interface TodayDashboardWrapperProps {
  analyzedTemplates?: AnalyzedTemplate[]
  logs?: ActivityLog[]
  todayStr: string
  journalEntries?: JournalEntry[]
  leaveRecords?: LeaveRecord[]
  leaveAllowances?: LeaveAllowance[]
  weightRecords?: WeightRecord[]
  initialDashboardConfig?: { order: string[]; hidden: string[] } | null
}

const TODAY_TTL = 30000 // 30 seconds freshness TTL for Today dashboard

export const TodayDashboardWrapper: React.FC<TodayDashboardWrapperProps> = ({
  todayStr,
  initialDashboardConfig,
}) => {
  const context = useContext(CalendarDataContext)
  const { state, initialize, setCacheMetadata } = useStore()

  // Loop-safe state ref to prevent useEffect infinite trigger loops
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Background fetch/revalidate logic (SWR)
  useEffect(() => {
    let active = true
    const lastFetched = stateRef.current.cacheMetadata.lastFetched['today'] || 0
    const isValidating = stateRef.current.cacheMetadata.isValidating['today']
    const templatesLength = stateRef.current.templates.length
    const isStale = Date.now() - lastFetched > TODAY_TTL

    if (!isValidating && (isStale || templatesLength === 0)) {
      const revalidate = async () => {
        setCacheMetadata('today', lastFetched, true) // set validation in progress
        try {
          const res = await fetchDashboardDataAction(todayStr)
          if (active && res.success && res.data) {
            initialize({
              templates: res.data.templates,
              logs: res.data.logs,
              journalEntries: res.data.journalEntries,
              leaveRecords: res.data.leaveRecords,
              leaveAllowances: res.data.leaveAllowances,
              weightRecords: res.data.weightRecords,
            })
            setCacheMetadata('today', Date.now(), false)
          } else if (active) {
            setCacheMetadata('today', lastFetched, false)
          }
        } catch (err) {
          console.error('[TodayDashboardWrapper] Background sync failed:', err)
          if (active) {
            setCacheMetadata('today', lastFetched, false)
          }
        }
      }
      revalidate()
    }
    return () => {
      active = false
    }
  }, [todayStr, initialize, setCacheMetadata])

  if (!context) {
    throw new Error('TodayDashboardWrapper must be rendered inside a DashboardLayout')
  }

  const { calendarData, fetchCalendar, onOpenCreateActivity } = context

  const onTabChange = (_tabId: string) => {
    // Standard Next.js route push is handled by parent or links, we can rely on standard navigation
  }

  // Compute analyzedTemplates dynamically from the store state
  const analyzedTemplates = useMemo(() => {
    return state.templates.map(template => {
      const templateLogs = state.logs.filter(log => log.activityId === template.id)
      const analysis = analyzeRecurrence(template, templateLogs, todayStr)
      return { template, analysis }
    })
  }, [state.templates, state.logs, todayStr])

  // Show a loading skeleton only on absolute cold first mount when IndexedDB is still loading
  if (state.templates.length === 0) {
    return (
      <div className="p-8 space-y-6 max-w-5xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-10 w-1/3 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 col-span-2 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <TodayDashboard
      analyzedTemplates={analyzedTemplates}
      logs={state.logs}
      todayStr={todayStr}
      calendarData={calendarData}
      onRefetchCalendar={fetchCalendar}
      onOpenCreateActivity={onOpenCreateActivity}
      journalEntries={state.journalEntries}
      leaveRecords={state.leaveRecords}
      leaveAllowances={state.leaveAllowances}
      weightRecords={state.weightRecords}
      onTabChange={onTabChange}
      initialDashboardConfig={initialDashboardConfig}
    />
  )
}
