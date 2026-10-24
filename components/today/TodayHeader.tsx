"use client"

import React from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Loader2 } from 'lucide-react'
import { Button, IconButton } from '@/design-system'
import { todayYMD } from '@/lib/dateUtils'
import { CompactTodayPills } from './CompactTodayPills'

/**
 * TodayHeader
 * Header bar for the Today dashboard and timeline view.
 * Displays current date navigation (prev/next day, jump to today), live weather pills,
 * real-time data synchronization loading spinner, and dashboard customization controls.
 */

interface TodayHeaderProps {
  todayStr: string
  todayLongDate: string
  calendarConnected: boolean
  calendarLoading: boolean
  onRefetchCalendar: (force?: boolean) => void
  onOpenCreateActivity: () => void
  onNavigateDate: (offset: number) => void
  onGoToToday: () => void
  isEditing?: boolean
  onToggleEdit?: () => void
  onOpenCustomize?: () => void
  isValidating?: boolean
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
  isEditing = false,
  onToggleEdit,
  onOpenCustomize,
  isValidating = false,
}) => {
  const isCurrentToday = todayStr === todayYMD()

  const navControls = (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-3 w-full">
      <IconButton
        icon={<ChevronLeft className="w-6 h-6" />}
        label="Previous day"
        variant="outline"
        size="lg"
        onClick={() => onNavigateDate(-1)}
        className="h-14 w-14 rounded-xl"
      />
      <div className="min-w-0 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2.5 shadow-xs">
        <div className="text-base sm:text-lg font-bold text-[var(--color-text-main)] leading-tight truncate">{todayLongDate}</div>
        {!isCurrentToday && (
          <button type="button" onClick={onGoToToday} className="mt-1 text-xs font-semibold text-[var(--color-primary)] hover:underline">Today</button>
        )}
      </div>
      <IconButton
        icon={<ChevronRight className="w-6 h-6" />}
        label="Next day"
        variant="outline"
        size="lg"
        onClick={() => onNavigateDate(1)}
        className="h-14 w-14 rounded-xl"
      />
    </div>
  )

  const actionButtons = (
    <div className="flex items-center gap-2">
      {onOpenCustomize && isEditing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCustomize}
          className="font-semibold text-xs"
        >
          Add Widgets
        </Button>
      )}
      {onToggleEdit && (
        <Button
          variant={isEditing ? 'primary' : 'ghost'}
          size="sm"
          onClick={onToggleEdit}
          className="font-semibold text-xs"
        >
          {isEditing ? 'Done' : 'Edit Dashboard'}
        </Button>
      )}
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
    </div>
  )

  return (
    <div className="mb-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight text-[var(--color-text-main)] leading-tight">
            {isCurrentToday ? 'Today' : 'Timeline'}
          </h1>
          {isValidating && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" aria-label="Updating" />}
        </div>
        <div className="flex shrink-0 items-center gap-2">{actionButtons}</div>
      </div>
      {navControls}
    </div>
  )
}

