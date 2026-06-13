"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Note } from '@/types'
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { getEventsForDate } from '@/lib/marathiCalendar'

interface CalendarProps {
  logs: ActivityLog[]
  templates: ActivityTemplate[]
  notes: Note[]
  onDayClick: (dateStr: string) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const Calendar: React.FC<CalendarProps> = ({
  logs,
  templates,
  notes,
  onDayClick,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() // 0-indexed

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleResetToToday = () => {
    setCurrentDate(new Date())
  }

  // Get total days in month and start day index
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDayIndex = new Date(year, month, 1).getDay() // 0 = Sun, 1 = Mon, etc.

  // Calendar cells mapping
  const cells: { dateStr: string | null; dayNumber: number | null; isCurrentMonth: boolean }[] = []

  // Prepend padding from previous month
  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startDayIndex - 1; i >= 0; i--) {
    cells.push({
      dateStr: null,
      dayNumber: prevMonthDays - i,
      isCurrentMonth: false,
    })
  }

  // Add days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const formattedMonth = String(month + 1).padStart(2, '0')
    const formattedDay = String(day).padStart(2, '0')
    cells.push({
      dateStr: `${year}-${formattedMonth}-${formattedDay}`,
      dayNumber: day,
      isCurrentMonth: true,
    })
  }

  // Append padding for next month to complete the grid (multiples of 7)
  // If we can fit in 35 cells, let's show 35. Otherwise, 42.
  const totalSlots = cells.length <= 35 ? 35 : 42
  const finalRemainingSlots = totalSlots - cells.length

  for (let i = 1; i <= finalRemainingSlots; i++) {
    cells.push({
      dateStr: null,
      dayNumber: i,
      isCurrentMonth: false,
    })
  }

  // Map database logs/notes by date for quick lookup
  const logsByDate = new Map<string, ActivityLog[]>()
  logs.forEach(log => {
    const list = logsByDate.get(log.date) || []
    list.push(log)
    logsByDate.set(log.date, list)
  })

  const notesByDate = new Map<string, Note>()
  notes.forEach(note => {
    notesByDate.set(note.date, note)
  })

  // Format today's date string
  const todayDate = new Date()
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(
    todayDate.getDate()
  ).padStart(2, '0')}`

  // Helper to resolve tag color class (dot colors)
  const getTailwindColorClass = (color: string) => {
    switch (color) {
      case 'red':
        return 'bg-red-500 shadow-xs shadow-red-500'
      case 'orange':
        return 'bg-orange-500 shadow-xs shadow-orange-500'
      case 'amber':
        return 'bg-amber-500 shadow-xs shadow-amber-500'
      case 'green':
        return 'bg-green-500 shadow-xs shadow-green-500'
      case 'blue':
        return 'bg-blue-500 shadow-xs shadow-blue-500'
      case 'purple':
        return 'bg-purple-500 shadow-xs shadow-purple-500'
      case 'pink':
        return 'bg-pink-500 shadow-xs shadow-pink-500'
      case 'zinc':
      default:
        return 'bg-zinc-400 dark:bg-zinc-500'
    }
  }

  // Helper to compute cell background density based on number of completed activities
  const getDensityBackground = (dateStr: string) => {
    const dayLogs = logsByDate.get(dateStr) || []
    const completedCount = dayLogs.filter(
      l => l.status !== 'skipped' && l.status !== 'reminder'
    ).length

    if (completedCount === 0) {
      return 'bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800/40 text-slate-400 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800/20'
    } else if (completedCount === 1) {
      return 'bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-zinc-800'
    } else if (completedCount === 2) {
      return 'bg-blue-50/60 dark:bg-zinc-800 border border-blue-100/70 dark:border-zinc-800 text-slate-800 dark:text-white hover:bg-blue-100/50 dark:hover:bg-zinc-800/60'
    } else if (completedCount === 3) {
      return 'bg-blue-100/60 dark:bg-zinc-800 border border-blue-200/70 dark:border-zinc-700 text-slate-900 dark:text-white hover:bg-blue-200/50 dark:hover:bg-zinc-700/50'
    } else {
      return 'bg-blue-200/60 dark:bg-zinc-700 border border-blue-300/70 dark:border-zinc-700 text-slate-955 dark:text-white hover:bg-blue-300/50 dark:hover:bg-zinc-700/80 shadow-inner'
    }
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long' })

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 md:p-6 flex flex-col gap-6 shadow-xs transition-colors duration-200">
      
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {monthName} <span className="text-slate-400 dark:text-zinc-500 font-medium">{year}</span>
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5 font-medium">Click any day to log activities or write notes</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetToToday}
            className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            Today
          </button>
          <div className="flex bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:text-slate-900 dark:hover:text-white text-slate-400 dark:text-zinc-400 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:text-slate-900 dark:hover:text-white text-slate-400 dark:text-zinc-400 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Weekdays Header */}
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
        {WEEKDAYS.map(day => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1.5 aspect-square sm:aspect-auto">
        {cells.map((cell, idx) => {
          const { dateStr, dayNumber, isCurrentMonth } = cell

          if (!isCurrentMonth || !dateStr) {
            // Padding cells from prev/next months
            return (
              <div
                key={`pad-${idx}`}
                className="aspect-square bg-slate-50/10 dark:bg-zinc-900/20 border border-slate-100/40 dark:border-zinc-900/30 text-slate-300 dark:text-zinc-750 flex flex-col justify-start p-1.5 rounded-lg select-none opacity-20 pointer-events-none"
              >
                <span className="text-[10px] font-mono">{dayNumber}</span>
              </div>
            )
          }

          const isToday = dateStr === todayStr
          const cellLogs = logsByDate.get(dateStr) || []
          const cellNote = notesByDate.get(dateStr)

          // Filter completions
          const completions = cellLogs.filter(
            l => l.status !== 'skipped' && l.status !== 'reminder'
          )

          const marathiEvents = dateStr ? getEventsForDate(dateStr) : []

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`aspect-square flex flex-col justify-between p-2 rounded-xl transition-all relative group cursor-pointer focus:outline-hidden ${getDensityBackground(dateStr)} ${
                isToday 
                  ? 'ring-2 ring-slate-800 dark:ring-slate-200 border-2 border-slate-800 dark:border-slate-200 shadow-md scale-[1.02] z-10' 
                  : ''
              }`}
              title={marathiEvents.length > 0 ? marathiEvents.map(e => e.title).join(', ') : undefined}
            >
              {/* Day Number and indicators */}
              <div className="w-full flex items-center justify-between">
                <span className={`text-xs font-mono font-bold ${
                  isToday 
                    ? 'text-slate-900 dark:text-white font-extrabold' 
                    : 'text-slate-700 dark:text-zinc-300'
                }`}>
                  {dayNumber}
                </span>

                <div className="flex items-center gap-1">
                  {/* Marathi Calendar Event Indicator */}
                  {marathiEvents.length > 0 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-xs shadow-orange-500 animate-pulse"
                      title={marathiEvents.map(e => e.title).join(', ')}
                    />
                  )}

                  {/* Freeform daily note indicator */}
                  {cellNote && (
                    <span title={cellNote.title || 'Daily Note'}>
                      <BookOpen
                        size={11}
                        className="text-amber-500 dark:text-amber-400 fill-amber-500/10"
                      />
                    </span>
                  )}
                </div>
              </div>

              {/* Status Indicator Dots */}
              {completions.length > 0 && (
                <div className="w-full flex flex-wrap gap-1 mt-auto items-center justify-start overflow-hidden max-h-5">
                  {completions.slice(0, 4).map(log => {
                    const template = templates.find(t => t.id === log.activityId)
                    const color = template?.color || 'zinc'
                    return (
                      <span
                        key={log.id}
                        className={`w-1.5 h-1.5 rounded-full ${getTailwindColorClass(color)}`}
                        title={template?.name || 'Completed task'}
                      />
                    )
                  })}
                  
                  {/* Plus pill if more than 4 completions */}
                  {completions.length > 4 && (
                    <span className="text-[7px] text-slate-550 dark:text-zinc-500 font-bold leading-none">
                      +{completions.length - 4}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
      
      {/* Calendar Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-zinc-900 pt-4 text-[10px] text-slate-400 dark:text-zinc-500 font-semibold">
        <div className="flex items-center gap-1.5">
          <span>Less active</span>
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800" />
            <span className="w-2.5 h-2.5 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800" />
            <span className="w-2.5 h-2.5 rounded bg-blue-50/60 dark:bg-zinc-800 border border-blue-100/70 dark:border-zinc-800" />
            <span className="w-2.5 h-2.5 rounded bg-blue-100/60 dark:bg-zinc-800 border border-blue-200/70 dark:border-zinc-700" />
            <span className="w-2.5 h-2.5 rounded bg-blue-200/60 dark:bg-zinc-700 border border-blue-300/70 dark:border-zinc-700" />
          </div>
          <span>More active</span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400 dark:text-zinc-500">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-400" />
            <span>Activity</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span>Panchang/Festival</span>
          </div>
          <div className="flex items-center gap-1">
            <BookOpen size={10} className="text-amber-500 dark:text-amber-400" />
            <span>Note</span>
          </div>
        </div>
      </div>

    </div>
  )
}

