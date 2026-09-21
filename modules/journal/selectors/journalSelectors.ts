import { JournalEntry } from '@/lib/store/store'
import { toYMD, todayYMD } from '@/lib/dateUtils'

/**
 * Pure selectors for Journal state in the client store or React surfaces.
 * Standardizes filtering, date formatting, and search across /journal, Today, Calendar, and Widgets.
 */

/**
 * Selects a journal entry for a given YYYY-MM-DD date string.
 */
export function selectJournalByDate(
  entries: JournalEntry[] | null | undefined,
  dateStr: string
): JournalEntry | null {
  if (!entries || !dateStr) return null

  return (
    entries.find((e) => {
      if (e.deletedAt) return false
      const d = typeof e.journalDate === 'string' ? e.journalDate.split('T')[0] : toYMD(e.journalDate)
      return d === dateStr
    }) || null
  )
}

/**
 * Selects today's journal entry.
 */
export function selectJournalForToday(
  entries: JournalEntry[] | null | undefined,
  todayStr: string = todayYMD()
): JournalEntry | null {
  return selectJournalByDate(entries, todayStr)
}

/**
 * Selects journal entries within an inclusive date range (YYYY-MM-DD).
 */
export function selectJournalRange(
  entries: JournalEntry[] | null | undefined,
  startDateStr: string,
  endDateStr: string
): JournalEntry[] {
  if (!entries || !startDateStr || !endDateStr) return []

  return entries.filter((e) => {
    if (e.deletedAt) return false
    const d = typeof e.journalDate === 'string' ? e.journalDate.split('T')[0] : toYMD(e.journalDate)
    return d >= startDateStr && d <= endDateStr
  })
}

/**
 * Searches in-memory journal entries across all documented fields.
 */
export function selectSearchJournal(
  entries: JournalEntry[] | null | undefined,
  query: string
): JournalEntry[] {
  if (!entries) return []
  const q = query.toLowerCase().trim()
  if (!q) return entries.filter((e) => !e.deletedAt)

  return entries.filter((e) => {
    if (e.deletedAt) return false
    const matchContent = (e.content || '').toLowerCase().includes(q)
    const matchGratitude = (e.gratitude || '').toLowerCase().includes(q)
    const matchReflections = (e.reflections || '').toLowerCase().includes(q)
    const matchLessons = (e.lessonsLearned || '').toLowerCase().includes(q)
    const matchPlan = (e.tomorrowPlan || '').toLowerCase().includes(q)
    const matchMood = (e.mood || '').toLowerCase().includes(q)
    return matchContent || matchGratitude || matchReflections || matchLessons || matchPlan || matchMood
  })
}
