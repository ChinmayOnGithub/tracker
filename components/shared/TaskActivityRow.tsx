"use client"

import React from 'react'
import { Check, ArrowRightCircle, Calendar } from 'lucide-react'

export interface TaskActivityRowProps {
  id: string
  title: React.ReactNode
  icon?: React.ReactNode
  isExternal?: boolean
  status?: 'cleared' | 'done' | 'skipped' | 'postponed'
  accentColorClass?: string
  isCompleted?: boolean
  isSkipped?: boolean
  isPostponed?: boolean
  isLoading?: boolean
  onCheckboxClick?: () => void
  checkboxTooltip?: string
  meta?: React.ReactNode
  rightActions?: React.ReactNode
  isDragOverlay?: boolean
  dragHandle?: React.ReactNode
  onClick?: () => void
  className?: string
}

/**
 * TaskActivityRow
 * 
 * Shared presentation-only row for tasks, habits, and external events.
 * Consolidates the visual presentation across Today and Calendar while
 * preserving page-specific interaction logic and external event semantics.
 */
export const TaskActivityRow: React.FC<TaskActivityRowProps> = ({
  id: _id,
  title,
  icon,
  isExternal = false,
  status = 'cleared',
  accentColorClass,
  isCompleted = false,
  isSkipped = false,
  isPostponed = false,
  isLoading = false,
  onCheckboxClick,
  checkboxTooltip,
  meta,
  rightActions,
  isDragOverlay = false,
  dragHandle,
  onClick,
  className = '',
}) => {
  const isDone = isCompleted || status === 'done'
  const isCanceled = isSkipped || status === 'skipped'
  const isPoned = isPostponed || status === 'postponed'

  // Default strip color if not provided
  let stripColor = accentColorClass
  if (!stripColor) {
    if (isExternal) stripColor = 'bg-[var(--color-external)]'
    else if (isDone) stripColor = 'bg-[var(--color-completed)]'
    else if (isCanceled) stripColor = 'bg-[var(--color-overdue)]'
    else if (isPoned) stripColor = 'bg-[var(--color-external)]'
    else stripColor = 'bg-zinc-400 dark:bg-zinc-600'
  }

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-bg-surface)] hover:bg-[var(--color-accent)]/20 transition-all select-none ${
        isDragOverlay ? 'shadow-lg border-[var(--color-primary)] scale-[1.02] cursor-grabbing z-50' : 'shadow-2xs'
      } ${className}`}
    >
      {/* Left semantic indicator strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${stripColor}`} />

      {/* Optional Drag Handle (if provided by caller) */}
      {dragHandle}

      {/* Checkbox or External Marker */}
      {isExternal ? (
        <div
          className="shrink-0 w-8 h-8 flex items-center justify-center"
          title="External calendar event (read-only)"
        >
          <div className="w-5 h-5 rounded-md border border-[var(--color-external)]/30 bg-[var(--color-external)]/10 text-[var(--color-external)] flex items-center justify-center">
            <Calendar className="w-3 h-3" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isLoading}
          onClick={(e) => {
            e.stopPropagation()
            onCheckboxClick?.()
          }}
          title={checkboxTooltip || (isDone ? 'Done' : isCanceled ? 'Canceled' : isPoned ? 'Postponed' : 'Cleared')}
          aria-label="Cycle task status"
          className="shrink-0 w-8 h-8 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
        >
          <div
            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shadow-2xs ${
              isLoading
                ? 'bg-slate-100 dark:bg-zinc-800 border-[var(--color-border)]'
                : isDone
                ? 'bg-[var(--color-completed)] border-[var(--color-completed)] text-white'
                : isCanceled
                ? 'bg-[var(--color-overdue)] border-[var(--color-overdue)] text-white'
                : isPoned
                ? 'bg-[var(--color-external)] border-[var(--color-external)] text-white'
                : 'bg-[var(--color-bg-base)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
            }`}
          >
            {isLoading ? (
              <span className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-ping" />
            ) : isDone ? (
              <Check className="w-3.5 h-3.5" />
            ) : isCanceled ? (
              <span className="text-[10px] font-black leading-none">✕</span>
            ) : isPoned ? (
              <ArrowRightCircle className="w-3.5 h-3.5" />
            ) : null}
          </div>
        </button>
      )}

      {/* Category Icon */}
      {icon && (
        <div className="shrink-0 w-6 h-6 rounded-md border border-[var(--color-border)]/60 bg-[var(--color-bg-subtle)]/40 flex items-center justify-center text-xs">
          {icon}
        </div>
      )}

      {/* Title & Metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-semibold leading-snug truncate ${
              isDone || isCanceled
                ? 'line-through text-[var(--color-text-muted)]'
                : 'text-[var(--color-text-main)]'
            }`}
          >
            {title}
          </span>
          {meta}
        </div>
      </div>

      {/* Right Actions Slot */}
      {rightActions && (
        <div className="shrink-0 flex items-center gap-1.5 ml-auto">
          {rightActions}
        </div>
      )}
    </div>
  )
}
export default TaskActivityRow
