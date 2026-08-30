"use client"

import React, { useState, useContext } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { ActivityManager } from './ActivityManager'
import { DayLogsModal } from './DayLogsModal'
import { ActivityTemplate, ActivityLog, Tag, RecurrenceAnalysis, Note } from '@/types'
import { getTodayDateStr } from '@/lib/recurrence'

interface ActivitiesWrapperProps {
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
  recentLogs?: ActivityLog[]
  tags?: Tag[]
  templates: ActivityTemplate[]
  logs: ActivityLog[]
  notes: Note[]
}

export const ActivitiesWrapper: React.FC<ActivitiesWrapperProps> = ({
  analyzedTemplates,
  recentLogs: _recentLogs,
  tags: _tags,
  templates,
  logs,
  notes,
}) => {
  const context = useContext(CalendarDataContext)

  if (!context) {
    throw new Error('ActivitiesWrapper must be rendered inside a DashboardLayout')
  }

  const { onOpenCreateActivity, onEditTemplate } = context

  // Local DayLogsModal states
  const [selectedDateStr, _setSelectedDateStr] = useState<string>(getTodayDateStr())
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(false)
  const [dayLogsModalTab] = useState<'activities' | 'notes'>('activities')

  // Filter logs and note for selected date
  const selectedDayLogs = logs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = notes.find(note => note.date === selectedDateStr) || null

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] font-sans">Activity Schedules & Templates</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Manage recurring routines, habits, and scheduled activities</p>
        </div>
      </div>
      
      <div className="w-full">
        <ActivityManager
          analyzedTemplates={analyzedTemplates}
          onAddTemplate={onOpenCreateActivity}
          onEditTemplate={onEditTemplate}
        />
      </div>

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
    </div>
  )
}
