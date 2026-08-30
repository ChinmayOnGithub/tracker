"use client"

import React from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Plus } from 'lucide-react'
import { Button, PageHeader, IconButton } from '@/design-system'

import { CompactTodayPills } from './CompactTodayPills'

interface TodayHeaderProps {
  todayStr: string
  todayLongDate: string
  calendarConnected: boolean
  calendarLoading: boolean
  onRefetchCalendar: (force?: boolean) => void
  onOpenCreateActivity: () => void
  onNavigateDate: (offset: number) => void
  onGoToToday: () => void
}

export const TodayHeader: React.FC<TodayHeaderProps> = ({
  todayStr,
  todayLongDate,
  calendarConnected,
  calendarLoading,
  onRefetchCalendar,
  onOpenCreateActivity,
  onNavigateDate,
  onGoToToday,
}) => {
  const isCurrentToday = todayStr === new Date().toISOString().split('T')[0]

  const prefix = (
    <div className="flex items-center gap-1">
      <IconButton
        icon={<ChevronLeft className="w-4 h-4" />}
        label="Yesterday"
        variant="outline"
        size="lg"
        onClick={() => onNavigateDate(-1)}
      />
      <IconButton
        icon={<ChevronRight className="w-4 h-4" />}
        label="Tomorrow"
        variant="outline"
        size="lg"
        onClick={() => onNavigateDate(1)}
      />
      {!isCurrentToday && (
        <Button variant="outline" size="sm" onClick={onGoToToday} className="text-xs font-bold">
          Today
        </Button>
      )}
    </div>
  )

  const actions = (
    <>
      {calendarConnected && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRefetchCalendar(true)}
          isLoading={calendarLoading}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          className="font-semibold shadow-xs"
        >
          Refresh
        </Button>
      )}
      <Button size="sm" onClick={onOpenCreateActivity} icon={<Plus className="w-3.5 h-3.5" />}>
        New Activity
      </Button>
    </>
  )

  const subtitleNode = (
    <div className="flex items-center gap-3 flex-wrap">
      <span>{todayLongDate}</span>
      {isCurrentToday && <CompactTodayPills />}
    </div>
  )

  return (
    <PageHeader
      title={isCurrentToday ? 'Today' : 'Timeline'}
      subtitle={subtitleNode}
      prefix={prefix}
      actions={actions}
    />
  )
}

