"use client"

import React, { useState, useContext, useMemo } from 'react'
import { CalendarDataContext } from './DashboardLayout'
import { ActivityManager } from './ActivityManager'
import { DayLogsModal } from './DayLogsModal'
import { ActivityTemplate, ActivityLog, Tag, RecurrenceAnalysis, Note } from '@/types'
import { getTodayDateStr, analyzeRecurrence } from '@/lib/recurrence'
import { useStore } from '@/lib/store/store'

import { TaskOccurrenceService } from '@/modules/activities/domain/TaskOccurrenceService'

interface ActivitiesWrapperProps {
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
  recentLogs?: ActivityLog[]
  tags?: Tag[]
  templates: ActivityTemplate[]
  logs: ActivityLog[]
  notes: Note[]
}

export const ActivitiesWrapper: React.FC<ActivitiesWrapperProps> = ({
  analyzedTemplates: initialAnalyzedTemplates,
  recentLogs: _recentLogs,
  tags: _tags,
  templates: initialTemplates,
  logs: initialLogs,
  notes: initialNotes,
}) => {
  const context = useContext(CalendarDataContext)
  const { state, reorderActivityTemplatesAction } = useStore()

  if (!context) {
    throw new Error('ActivitiesWrapper must be rendered inside a DashboardLayout')
  }

  const { onOpenCreateActivity, onEditTemplate } = context

  // Local DayLogsModal states
  const [selectedDateStr, _setSelectedDateStr] = useState<string>(getTodayDateStr())
  const [isDayLogsOpen, setIsDayLogsOpen] = useState(false)
  const [dayLogsModalTab] = useState<'activities' | 'notes'>('activities')

  // Filter out any ephemeral/temporary quick tasks from the store before rendering
  const rawTemplates = state.templates.length > 0 ? state.templates : initialTemplates
  const persistentTemplates = useMemo(() => {
    return rawTemplates.filter(t => !TaskOccurrenceService.isTemporaryTask(t))
  }, [rawTemplates])

  const effectiveLogs = state.logs.length > 0 ? state.logs : initialLogs
  const effectiveNotes = state.journalEntries.length > 0 
    ? state.journalEntries.map(j => ({
        id: j.id,
        date: typeof j.journalDate === 'string' ? j.journalDate.split('T')[0] : j.journalDate.toISOString().split('T')[0],
        title: null,
        content: j.content,
        userId: j.userId || '',
        createdAt: typeof j.createdAt === 'string' ? new Date(j.createdAt) : j.createdAt,
        updatedAt: typeof j.updatedAt === 'string' ? new Date(j.updatedAt) : j.updatedAt,
        deletedAt: null
      }))
    : initialNotes

  const analyzedTemplates = useMemo(() => {
    const todayStr = getTodayDateStr()
    return persistentTemplates.map(template => {
      const templateLogs = effectiveLogs.filter(log => log.activityId === template.id)
      const analysis = analyzeRecurrence(template, templateLogs, todayStr)
      return { template, analysis }
    })
  }, [persistentTemplates, effectiveLogs])

  // Filter logs and note for selected date
  const selectedDayLogs = effectiveLogs.filter(log => log.date === selectedDateStr)
  const selectedDayNote = effectiveNotes.find(note => note.date === selectedDateStr) || null

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
          analyzedTemplates={analyzedTemplates.length > 0 ? analyzedTemplates : initialAnalyzedTemplates}
          onAddTemplate={onOpenCreateActivity}
          onEditTemplate={onEditTemplate}
          onReorderTemplatesAction={reorderActivityTemplatesAction}
        />
      </div>

      {isDayLogsOpen && (
        <DayLogsModal
          key={`${selectedDateStr}-${selectedDayNote?.id || 'new'}`}
          isOpen={isDayLogsOpen}
          onClose={() => setIsDayLogsOpen(false)}
          dateStr={selectedDateStr}
          templates={persistentTemplates.filter(t => t.isActive)}
          logs={selectedDayLogs}
          note={selectedDayNote}
          initialTab={dayLogsModalTab}
          allLogs={effectiveLogs}
        />
      )}
    </div>
  )
}
