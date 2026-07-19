"use client"

import React, { useState, useContext } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { ActivityManager } from './ActivityManager'
import { DashboardPanel } from './DashboardPanel'
import { DayLogsModal } from './DayLogsModal'
import { ActivityTemplate, ActivityLog, Tag, RecurrenceAnalysis } from '@/types'
import { getTodayDateStr } from '@/lib/recurrence'

interface ActivitiesWrapperProps {
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
  recentLogs: ActivityLog[]
  tags: Tag[]
  templates: ActivityTemplate[]
  logs: ActivityLog[]
  notes: any[]
}

export const ActivitiesWrapper: React.FC<ActivitiesWrapperProps> = ({
  analyzedTemplates,
  recentLogs,
  tags,
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
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getTodayDateStr())
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(false)
  const [dayLogsModalTab] = useState<'activities' | 'notes'>('activities')

  const handleOpenLoggerForTemplate = () => {
    setSelectedDateStr(getTodayDateStr())
    setIsDayLogsOpen(true)
  }

  // Filter logs and note for selected date
  const selectedDayLogs = logs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = notes.find(note => note.date === selectedDateStr) || null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-[var(--color-text-main)] font-sans">Activity Schedules & Templates</h1>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-8">
          <ActivityManager
            analyzedTemplates={analyzedTemplates}
            onAddTemplate={onOpenCreateActivity}
            onEditTemplate={onEditTemplate}
          />
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <DashboardPanel
            analyzedTemplates={analyzedTemplates}
            recentLogs={recentLogs}
            allTags={tags}
            onOpenLogger={handleOpenLoggerForTemplate}
          />
        </div>
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
