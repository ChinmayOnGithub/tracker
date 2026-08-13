"use client"

import React from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Plus } from 'lucide-react'
import { Button } from '@/design-system'

interface TodayHeaderProps {
  todayStr: string
  todayLongDate: string
  contextSubtitle: string
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
  contextSubtitle,
  calendarConnected,
  calendarLoading,
  onRefetchCalendar,
  onOpenCreateActivity,
  onNavigateDate,
  onGoToToday,
}) => {
  const isCurrentToday = todayStr === new Date().toISOString().split('T')[0]

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3 mb-6">
      <div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateDate(-1)}
            icon={<ChevronLeft className="w-4 h-4" />}
            title="Yesterday"
            className="p-0 w-11 h-11 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center"
          />
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">
            {isCurrentToday ? 'Today' : 'Timeline'}
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateDate(1)}
            icon={<ChevronRight className="w-4 h-4" />}
            title="Tomorrow"
            className="p-0 w-11 h-11 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center"
          />
          {!isCurrentToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGoToToday}
              className="text-xs font-bold"
            >
              Today
            </Button>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mt-1 font-normal">
          {todayLongDate} • {contextSubtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
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
        <Button onClick={onOpenCreateActivity} size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
          New Activity
        </Button>
      </div>
    </div>
  )
}
