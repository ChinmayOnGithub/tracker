"use client"

import React from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Loader2 } from 'lucide-react'
import { Button, IconButton } from '@/design-system'

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
  const isCurrentToday = todayStr === new Date().toISOString().split('T')[0]

  const navControls = (
    <div className="flex items-center gap-1.5">
      <IconButton
        icon={<ChevronLeft className="w-4 h-4" />}
        label="Yesterday"
        variant="outline"
        size="md"
        onClick={() => onNavigateDate(-1)}
      />
      <IconButton
        icon={<ChevronRight className="w-4 h-4" />}
        label="Tomorrow"
        variant="outline"
        size="md"
        onClick={() => onNavigateDate(1)}
      />
      {!isCurrentToday && (
        <Button variant="outline" size="sm" onClick={onGoToToday} className="text-xs font-bold px-2.5 h-8">
          Today
        </Button>
      )}
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
    <div className="border-b border-[var(--color-border)] pb-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Title + Desktop inline nav controls */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Desktop Nav buttons prefix (hidden on mobile) */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {navControls}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] leading-tight truncate">
                {isCurrentToday ? 'Today' : 'Timeline'}
              </h1>
              {isValidating && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 animate-in fade-in duration-200"
                  title="Fetching latest updates for this date…"
                >
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span className="hidden md:inline">Updating</span>
                </span>
              )}
            </div>
            <div className="text-sm text-[var(--color-text-muted)] mt-0.5 font-normal leading-snug flex items-center gap-3 flex-wrap">
              <span>{todayLongDate}</span>
              {isCurrentToday && <CompactTodayPills />}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {actionButtons}
        </div>
      </div>

      {/* Mobile: Nav buttons placed cleanly below the info header */}
      <div className="flex sm:hidden items-center justify-between mt-3 pt-2.5 border-t border-[var(--color-border)]/40">
        <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Jump Date
        </span>
        {navControls}
      </div>
    </div>
  )
}

