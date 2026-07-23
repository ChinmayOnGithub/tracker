"use client"

import React, { useState, useContext } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { Calendar } from './Calendar'
import { DayLogsModal } from './DayLogsModal'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis } from '@/types'
import { useSearchParams, useRouter } from 'next/navigation'

interface CalendarWrapperProps {
  logs: ActivityLog[]
  templates: ActivityTemplate[]
  notes: Note[]
  todayStr: string
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
}

export const CalendarWrapper: React.FC<CalendarWrapperProps> = ({
  logs,
  templates,
  notes,
  todayStr,
  analyzedTemplates,
}) => {
  const context = useContext(CalendarDataContext)
  const searchParams = useSearchParams()
  const router = useRouter()
  const dateParam = searchParams?.get('date')

  if (!context) {
    throw new Error('CalendarWrapper must be rendered inside a DashboardLayout')
  }

  const { calendarData } = context

  // Local DayLogsModal states
  const selectedDateStr = dateParam || todayStr
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(true)
  const [dayLogsModalTab] = useState<'activities' | 'notes'>('activities')

  const handleDayClick = (dateStr: string) => {
    setIsDayLogsOpen(true)
    router.replace(`/calendar?date=${dateStr}`, { scroll: false })
  }

  const handleClose = () => {
    setIsDayLogsOpen(false)
    router.replace('/calendar', { scroll: false })
  }

  // Filter logs and note for selected date
  const selectedDayLogs = logs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = notes.find(note => note.date === selectedDateStr) || null

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start w-full relative">
      <div className="flex-1 w-full min-w-0">
        <Calendar
          logs={logs}
          templates={templates}
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
            templates={templates.filter(t => t.isActive)}
            logs={selectedDayLogs}
            note={selectedDayNote}
            initialTab={dayLogsModalTab}
            allLogs={logs}
            mode="sidebar"
          />
        </div>
      )}
    </div>
  )
}
