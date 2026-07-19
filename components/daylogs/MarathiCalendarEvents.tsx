"use client"

import React from 'react'
import { getEventsForDate } from '@/lib/marathiCalendar'

interface MarathiCalendarEventsProps {
  dateStr: string
}

export const MarathiCalendarEvents: React.FC<MarathiCalendarEventsProps> = ({ dateStr }) => {
  const events = getEventsForDate(dateStr)
  if (events.length === 0) return null

  return (
    <div className="p-3 bg-orange-500/10 border border-orange-500/30 text-orange-655 dark:text-orange-400 rounded-xl flex items-center gap-2 text-xs font-semibold">
      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
      <span>Marathi Calendar: {events.map(e => e.title).join(', ')}</span>
    </div>
  )
}
