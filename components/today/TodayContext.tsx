"use client"

import React from 'react'

interface TodayContextProps {
  totalActivities: number
  completedCount: number
  progressPct: number
}

/**
 * TodayContext
 * Renders the day's progress bar in a clean, consistent format.
 * Uses semantic color tokens and standardized typography.
 */
export const TodayContext: React.FC<TodayContextProps> = ({
  totalActivities,
  completedCount,
  progressPct,
}) => {
  if (totalActivities === 0) return null

  return (
    <div className="flex flex-col gap-2 pb-2 mb-2">
      <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-muted)]">
        <span>
          Today&apos;s Progress: <span className="text-[var(--color-text-main)] font-mono">{completedCount}/{totalActivities}</span>
        </span>
        <span className="font-mono text-[var(--color-text-main)]">{progressPct}%</span>
      </div>
      <div className="w-full h-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-[var(--color-completed)] transition-all duration-500 rounded-full"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  )
}
