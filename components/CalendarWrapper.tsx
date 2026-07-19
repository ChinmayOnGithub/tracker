"use client"

import React, { useState, useContext } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { Calendar } from './Calendar'
import { DayLogsModal } from './DayLogsModal'
import { ActivityTemplate, ActivityLog, Note, RecurrenceAnalysis } from '@/types'

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

  if (!context) {
    throw new Error('CalendarWrapper must be rendered inside a DashboardLayout')
  }

  const { calendarData } = context

  // Local DayLogsModal states
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr)
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(false)
  const [dayLogsModalTab] = useState<'activities' | 'notes'>('activities')

  const handleDayClick = (dateStr: string) => {
    setSelectedDateStr(dateStr)
    setIsDayLogsOpen(true)
  }

  // Filter logs and note for selected date
  const selectedDayLogs = logs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = notes.find(note => note.date === selectedDateStr) || null

  return (
    <>
      <Calendar
        logs={logs}
        templates={templates}
        notes={notes}
        calendarData={calendarData}
        todayStr={todayStr}
        analyzedTemplates={analyzedTemplates}
        onDayClick={handleDayClick}
      />

      {isDayLogsOpen && (
        <DayLogsModal
          key={`${selectedDateStr}-${selectedDayNote?.id || 'new'}`}
          isOpen={isDayLogsOpen}
          onClose={() => setIsDayLogsOpen(false)}
          dateStr={selectedDateStr}
          templates={templates.filter(t => t.isActive)}
          logs={selectedDayLogs}
          note={selectedDayNote}
          initialTab={dayLogsModalTab}
          allLogs={logs}
        />
      )}
    </>
  )
}
