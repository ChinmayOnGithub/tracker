"use client"

import React, { useContext, ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDataContext } from './DashboardLayout'
import { TodayDashboard } from './TodayDashboard'
import { ActivityTemplate } from '@/types'

type TodayDashboardProps = ComponentProps<typeof TodayDashboard>

interface TodayDashboardWrapperProps {
  analyzedTemplates: TodayDashboardProps['analyzedTemplates']
  logs: TodayDashboardProps['logs']
  notes: TodayDashboardProps['_notes']
  todayStr: TodayDashboardProps['todayStr']
  journalEntries: TodayDashboardProps['journalEntries']
  leaveRecords: TodayDashboardProps['leaveRecords']
  leaveAllowances: TodayDashboardProps['leaveAllowances']
  weightRecords: TodayDashboardProps['weightRecords']
}

export const TodayDashboardWrapper: React.FC<TodayDashboardWrapperProps> = ({
  analyzedTemplates,
  logs,
  notes,
  todayStr,
  journalEntries,
  leaveRecords,
  leaveAllowances,
  weightRecords,
}) => {
  const router = useRouter()
  const context = useContext(CalendarDataContext)

  if (!context) {
    throw new Error('TodayDashboardWrapper must be rendered inside a DashboardLayout')
  }

  const { calendarData, fetchCalendar, onOpenCreateActivity, onEditTemplate } = context

  const onTabChange = (tabId: string) => {
    router.push(tabId === 'today' ? '/' : `/${tabId}`)
  }

  // Handle local mark complete wrapper
  const onMarkHabitComplete = async (template: ActivityTemplate) => {
    const status = template.category === 'finance' ? 'paid' : 'done'
    const amount = template.amount
    const { markComplete } = await import('@/app/actions/log')
    await markComplete(template.id, todayStr, status, amount, null)

    // Route Redirections
    if (template.type === 'JOURNAL') {
      router.push('/journal')
    } else if (template.type === 'LEAVE') {
      router.push('/leave')
    } else if (template.type === 'PERSONAL' && (template.name.toLowerCase().includes('weight') || template.category === 'health')) {
      router.push('/weight')
    }
    
    router.refresh()
  }

  return (
    <TodayDashboard
      analyzedTemplates={analyzedTemplates}
      logs={logs}
      _notes={notes}
      todayStr={todayStr}
      calendarData={calendarData}
      onRefetchCalendar={fetchCalendar}
      onOpenCreateActivity={onOpenCreateActivity}
      _onMarkHabitComplete={onMarkHabitComplete}
      _onEditTemplate={onEditTemplate}
      journalEntries={journalEntries}
      leaveRecords={leaveRecords}
      leaveAllowances={leaveAllowances}
      weightRecords={weightRecords}
      onTabChange={onTabChange}
    />
  )
}
