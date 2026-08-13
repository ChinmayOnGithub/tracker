"use client"

import React from 'react'

interface TodayContextProps {
  totalActivities: number
  completedCount: number
  progressPct: number
}

export const TodayContext: React.FC<TodayContextProps> = ({
  totalActivities,
  completedCount,
  progressPct,
}) => {
  if (totalActivities === 0) return null

  return (
    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]/40 pb-2 mb-2">
      <span className="font-semibold">
        Today&apos;s Progress: <span className="text-[var(--color-text-main)] font-mono">{completedCount}/{totalActivities}</span> ({progressPct}%)
      </span>
      <div className="w-24 h-1 bg-[var(--color-border)] rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-[var(--color-completed)] transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  )
}
