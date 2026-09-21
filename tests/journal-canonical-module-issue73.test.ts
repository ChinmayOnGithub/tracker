import { describe, it, expect } from 'bun:test'
import {
  selectJournalByDate,
  selectJournalForToday,
  selectJournalRange,
  selectSearchJournal,
} from '@/modules/journal'
import { JournalEntry } from '@/lib/store/store'

describe('Issue #73: Canonical Journal Module Read Model & Selectors', () => {
  const entries: JournalEntry[] = [
    {
      id: 'j-1',
      userId: 'user-alice',
      journalDate: '2026-09-20T12:00:00.000Z',
      content: '<p>Had a productive coding day working on Tracker.</p>',
      mood: 'energized',
      gratitude: 'Grateful for clean architecture',
      reflections: 'Need to sleep on time',
      lessonsLearned: 'Always verify optimistic rollback',
      tomorrowPlan: 'Ship issue 73',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'j-2',
      userId: 'user-alice',
      journalDate: '2026-09-21T12:00:00.000Z',
      content: '<p>Rest day, spent time in the garden.</p>',
      mood: 'calm',
      gratitude: 'Fresh air',
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: 'Start the work week strong',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'j-deleted',
      userId: 'user-alice',
      journalDate: '2026-09-21T12:00:00.000Z',
      content: 'Deleted draft',
      mood: null,
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    },
  ]

  it('selectJournalByDate returns correct entry for exact date', () => {
    const entry = selectJournalByDate(entries, '2026-09-20')
    expect(entry).not.toBeNull()
    expect(entry?.id).toBe('j-1')
    expect(entry?.mood).toBe('energized')
  })

  it('selectJournalByDate excludes soft-deleted entries', () => {
    const entry = selectJournalByDate([entries[2]], '2026-09-21')
    expect(entry).toBeNull()
  })

  it('selectJournalForToday retrieves today entry', () => {
    const entry = selectJournalForToday(entries, '2026-09-21')
    expect(entry).not.toBeNull()
    expect(entry?.id).toBe('j-2')
  })

  it('selectJournalRange retrieves entries in date bounds', () => {
    const range = selectJournalRange(entries, '2026-09-20', '2026-09-21')
    expect(range.length).toBe(2)
    expect(range.some((e) => e.id === 'j-deleted')).toBe(false)
  })

  it('selectSearchJournal matches across all documented fields', () => {
    // 1. Content match
    expect(selectSearchJournal(entries, 'productive').length).toBe(1)
    // 2. Mood match
    expect(selectSearchJournal(entries, 'energized').length).toBe(1)
    // 3. Gratitude match
    expect(selectSearchJournal(entries, 'architecture').length).toBe(1)
    // 4. Reflections match
    expect(selectSearchJournal(entries, 'sleep').length).toBe(1)
    // 5. Lessons Learned match
    expect(selectSearchJournal(entries, 'optimistic rollback').length).toBe(1)
    // 6. Tomorrow Plan match
    expect(selectSearchJournal(entries, 'ship issue 73').length).toBe(1)

    // Excludes soft-deleted
    expect(selectSearchJournal(entries, 'deleted draft').length).toBe(0)
  })
})
