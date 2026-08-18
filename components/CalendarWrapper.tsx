"use client"

import React, { useState, useContext, useEffect, useMemo, useRef } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { Calendar } from './Calendar'
import { DayLogsModal } from './DayLogsModal'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis } from '@/types'
import { useSearchParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/store/store'
import { fetchCalendarDataAction } from '@/app/actions/queries'
import { analyzeRecurrence } from '@/lib/recurrence'
import { Skeleton } from '@/design-system'

interface CalendarWrapperProps {
  logs: ActivityLog[]
  templates: ActivityTemplate[]
  notes: Note[]
  todayStr: string
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
}

const CALENDAR_TTL = 45000 // 45 seconds TTL for calendar revalidation

export const CalendarWrapper: React.FC<CalendarWrapperProps> = ({
  todayStr,
}) => {
  const context = useContext(CalendarDataContext)
  const searchParams = useSearchParams()
  const router = useRouter()
  const dateParam = searchParams?.get('date')
  const { state, initialize, setCacheMetadata } = useStore()

  // Loop-safe state ref to prevent useEffect infinite trigger loops
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Background fetch/revalidate (SWR)
  useEffect(() => {
    let active = true
    const lastFetched = stateRef.current.cacheMetadata.lastFetched['calendar'] || 0
    const isValidating = stateRef.current.cacheMetadata.isValidating['calendar']
    const templatesLength = stateRef.current.templates.length
    const isStale = Date.now() - lastFetched > CALENDAR_TTL

    if (!isValidating && (isStale || templatesLength === 0)) {
      const revalidate = async () => {
        setCacheMetadata('calendar', lastFetched, true)
        try {
          const res = await fetchCalendarDataAction()
          if (active && res.success && res.data) {
            initialize({
              templates: res.data.templates,
              logs: res.data.logs,
              journalEntries: res.data.notes.map((n: { id: string; date: string; content: string; createdAt: string; updatedAt: string }) => ({
                id: n.id,
                journalDate: n.date,
                content: n.content,
                mood: null,
                gratitude: null,
                reflections: null,
                lessonsLearned: null,
                tomorrowPlan: null,
                createdAt: n.createdAt,
                updatedAt: n.updatedAt,
              })),
            })
            setCacheMetadata('calendar', Date.now(), false)
          } else if (active) {
            setCacheMetadata('calendar', lastFetched, false)
          }
        } catch (err) {
          console.error('[CalendarWrapper] Background revalidation failed:', err)
          if (active) {
            setCacheMetadata('calendar', lastFetched, false)
          }
        }
      }
      revalidate()
    }
    return () => {
      active = false
    }
  }, [initialize, setCacheMetadata])

  // Derive values from global store
  const notes = useMemo(() => {
    return state.journalEntries.map(j => ({
      id: j.id,
      date: typeof j.journalDate === 'string' ? j.journalDate.split('T')[0] : j.journalDate.toISOString().split('T')[0],
      title: null,
      content: j.content,
      userId: j.userId || '',
      createdAt: typeof j.createdAt === 'string' ? new Date(j.createdAt) : j.createdAt,
      updatedAt: typeof j.updatedAt === 'string' ? new Date(j.updatedAt) : j.updatedAt,
      deletedAt: null
    }))
  }, [state.journalEntries])

  const analyzedTemplates = useMemo(() => {
    return state.templates.map(template => {
      const templateLogs = state.logs.filter(log => log.activityId === template.id)
      const analysis = analyzeRecurrence(template, templateLogs, todayStr)
      return { template, analysis }
    })
  }, [state.templates, state.logs, todayStr])

  if (!context) {
    throw new Error('CalendarWrapper must be rendered inside a DashboardLayout')
  }

  const { calendarData } = context

  // Local DayLogsModal states
  const selectedDateStr = dateParam || todayStr
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(!!dateParam)

  const handleDayClick = (dateStr: string) => {
    setIsDayLogsOpen(true)
    router.replace(`/calendar?date=${dateStr}`, { scroll: false })
  }

  const handleClose = () => {
    setIsDayLogsOpen(false)
    router.replace('/calendar', { scroll: false })
  }

  // Filter logs and note for selected date
  const selectedDayLogs = state.logs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = notes.find(note => note.date === selectedDateStr) || null

  // Show a loading skeleton only on absolute cold first mount
  if (state.templates.length === 0) {
    return (
      <div className="p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-1/3 rounded-lg" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start w-full relative">
      <div className="flex-1 w-full min-w-0">
        <Calendar
          logs={state.logs}
          templates={state.templates}
          notes={notes}
          calendarData={calendarData}
          todayStr={todayStr}
          analyzedTemplates={analyzedTemplates}
          onDayClick={handleDayClick}
          selectedDateStr={selectedDateStr}
        />
      </div>

      {isDayLogsOpen && (
        <div className="w-full lg:w-[360px] shrink-0 lg:sticky lg:top-6">
          <DayLogsModal
            key={`${selectedDateStr}-${selectedDayNote?.id || 'new'}`}
            isOpen={isDayLogsOpen}
            onClose={handleClose}
            dateStr={selectedDateStr}
            templates={state.templates.filter(t => t.isActive)}
            logs={selectedDayLogs}
            note={selectedDayNote}
            initialTab="activities"
            allLogs={state.logs}
            mode="sidebar"
          />
        </div>
      )}
    </div>
  )
}
