import { ActivityTemplate, ActivityLog, RecurrenceAnalysis } from '../types'

// Timezone-safe YYYY-MM-DD date parsing and arithmetic
export function parseUTCDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatUTCDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addUTCDays(dateStr: string, days: number): string {
  const date = parseUTCDate(dateStr)
  date.setUTCDate(date.getUTCDate() + days)
  return formatUTCDate(date)
}

export function addUTCMonths(dateStr: string, months: number): string {
  const date = parseUTCDate(dateStr)
  const originalDay = date.getUTCDate()
  date.setUTCMonth(date.getUTCMonth() + months)
  // Prevent date overflow (e.g. Jan 31 + 1 month -> March 3 instead of Feb 28)
  if (date.getUTCDate() !== originalDay) {
    date.setUTCDate(0) // Go back to the last day of the previous month
  }
  return formatUTCDate(date)
}

export function addUTCYears(dateStr: string, years: number): string {
  const date = parseUTCDate(dateStr)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return formatUTCDate(date)
}

export function diffUTCDays(dateStr1: string, dateStr2: string): number {
  const d1 = parseUTCDate(dateStr1)
  const d2 = parseUTCDate(dateStr2)
  const diffTime = d1.getTime() - d2.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

export function getTodayDateStr(): string {
  // Returns user's local date in YYYY-MM-DD format based on system time
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function analyzeRecurrence(
  template: ActivityTemplate,
  logs: ActivityLog[],
  todayStr: string = getTodayDateStr()
): RecurrenceAnalysis {
  // Filter for completion logs (exclude 'skipped' and 'reminder')
  const completionLogs = logs
    .filter(log => log.status !== 'skipped' && log.status !== 'reminder')
    .sort((a, b) => b.date.localeCompare(a.date)) // descending order (newest first)

  const lastCompletedDate = completionLogs.length > 0 ? completionLogs[0].date : null

  let nextDueDate: string | null = null
  let overdue = false
  let daysSinceLast: number | null = null
  let monthsSinceLast: number | null = null
  let streak = 0

  if (lastCompletedDate) {
    daysSinceLast = diffUTCDays(todayStr, lastCompletedDate)
    
    // Calculate months since last done (precise float rounded to 1 decimal)
    const d1 = parseUTCDate(todayStr)
    const d2 = parseUTCDate(lastCompletedDate)
    const yearDiff = d1.getUTCFullYear() - d2.getUTCFullYear()
    const monthDiff = d1.getUTCMonth() - d2.getUTCMonth()
    const dayDiff = d1.getUTCDate() - d2.getUTCDate()
    monthsSinceLast = Math.max(0, parseFloat((yearDiff * 12 + monthDiff + dayDiff / 30.0).toFixed(1)))
  }

  // Compute next due date based on recurrence rule
  switch (template.recurrenceType) {
    case 'daily': {
      if (!lastCompletedDate) {
        nextDueDate = todayStr
      } else {
        nextDueDate = addUTCDays(lastCompletedDate, 1)
      }
      break
    }
    case 'weekly': {
      if (!lastCompletedDate) {
        nextDueDate = todayStr
      } else if (template.recurrenceDaysOfWeek) {
        // Find next due day from custom days of week
        // daysOfWeek: e.g. "1,3,5" for Mon, Wed, Fri
        const allowedDays = template.recurrenceDaysOfWeek
          .split(',')
          .map(Number)
          .sort((a, b) => a - b)
        
        if (allowedDays.length > 0) {
          const lastDate = parseUTCDate(lastCompletedDate)
          const lastDayOfWeek = lastDate.getUTCDay() // 0 = Sun, 1 = Mon, etc.
          
          // Find the next day in the list that is strictly after lastDayOfWeek
          let daysToAdd = 0
          const nextDay = allowedDays.find(d => d > lastDayOfWeek)
          if (nextDay !== undefined) {
            daysToAdd = nextDay - lastDayOfWeek
          } else {
            // Next occurrence is in the next week
            daysToAdd = 7 - lastDayOfWeek + allowedDays[0]
          }
          nextDueDate = addUTCDays(lastCompletedDate, daysToAdd)
        } else {
          nextDueDate = addUTCDays(lastCompletedDate, 7)
        }
      } else {
        nextDueDate = addUTCDays(lastCompletedDate, 7)
      }
      break
    }
    case 'monthly': {
      if (!lastCompletedDate) {
        nextDueDate = todayStr
      } else if (template.recurrenceDayOfMonth !== null) {
        // Due next month on a specific day
        const nextMonthStr = addUTCMonths(lastCompletedDate, 1)
        const [y, m] = nextMonthStr.split('-')
        
        // Ensure day doesn't exceed month length
        const tempDate = parseUTCDate(`${y}-${m}-01`)
        tempDate.setUTCMonth(tempDate.getUTCMonth() + 1)
        tempDate.setUTCDate(0) // Last day of that month
        const maxDay = tempDate.getUTCDate()
        const resolvedDay = Math.min(template.recurrenceDayOfMonth, maxDay)
        
        nextDueDate = `${y}-${m}-${String(resolvedDay).padStart(2, '0')}`
      } else {
        nextDueDate = addUTCMonths(lastCompletedDate, 1)
      }
      break
    }
    case 'yearly': {
      if (!lastCompletedDate) {
        nextDueDate = todayStr
      } else if (template.recurrenceMonth !== null && template.recurrenceDayOfMonth !== null) {
        const lastDate = parseUTCDate(lastCompletedDate)
        const nextYear = lastDate.getUTCFullYear() + 1
        const targetMonth = String(template.recurrenceMonth).padStart(2, '0')
        const targetDay = String(template.recurrenceDayOfMonth).padStart(2, '0')
        nextDueDate = `${nextYear}-${targetMonth}-${targetDay}`
      } else {
        nextDueDate = addUTCYears(lastCompletedDate, 1)
      }
      break
    }
    case 'custom': {
      if (!lastCompletedDate) {
        nextDueDate = todayStr
      } else {
        const interval = template.recurrenceInterval || 1
        nextDueDate = addUTCDays(lastCompletedDate, interval)
      }
      break
    }
    case 'one_time': {
      if (lastCompletedDate) {
        nextDueDate = null // Completed
      } else {
        nextDueDate = template.targetDate || todayStr
      }
      break
    }
    case 'milestone':
    default: {
      nextDueDate = null // Milestones aren't due; they just track last completed
      break
    }
  }

  // Calculate overdue status
  if (nextDueDate) {
    overdue = nextDueDate < todayStr
  }

  // Calculate daily streak
  if (template.recurrenceType === 'daily' && completionLogs.length > 0) {
    // Check if the most recent log is today or yesterday
    const newestLogDate = completionLogs[0].date
    if (newestLogDate === todayStr || newestLogDate === addUTCDays(todayStr, -1)) {
      streak = 1
      let currentDateStr = newestLogDate
      // Keep checking backwards day by day
      for (let i = 1; i < completionLogs.length; i++) {
        const prevDateStr = addUTCDays(currentDateStr, -1)
        if (completionLogs[i].date === prevDateStr) {
          streak++
          currentDateStr = prevDateStr
        } else {
          break
        }
      }
    }
  }

  // Generate status message
  let statusMessage = ''
  if (template.recurrenceType === 'milestone') {
    if (lastCompletedDate) {
      if (monthsSinceLast !== null && monthsSinceLast >= 1) {
        statusMessage = `${monthsSinceLast} ${monthsSinceLast === 1 ? 'month' : 'months'} since last done`
      } else if (daysSinceLast !== null) {
        statusMessage = `${daysSinceLast} ${daysSinceLast === 1 ? 'day' : 'days'} since last done`
      }
    } else {
      statusMessage = 'Never completed'
    }
  } else if (nextDueDate) {
    if (nextDueDate === todayStr) {
      statusMessage = 'Due today'
    } else if (nextDueDate < todayStr) {
      const days = diffUTCDays(todayStr, nextDueDate)
      statusMessage = `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`
    } else {
      const days = diffUTCDays(nextDueDate, todayStr)
      statusMessage = `Due in ${days} ${days === 1 ? 'day' : 'days'}`
    }
  } else {
    statusMessage = 'Completed'
  }

  return {
    lastCompletedDate,
    nextDueDate,
    overdue,
    daysSinceLast,
    monthsSinceLast,
    streak,
    statusMessage,
  }
}
