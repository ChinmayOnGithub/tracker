import { describe, it, expect } from 'bun:test'
import { MasterSearchEngine, SearchableDataset } from '@/lib/search/MasterSearchEngine'

describe('Search Data Isolation Suite (#46)', () => {
  const multiUserDataset: SearchableDataset = {
    notes: [
      {
        id: 'note-user-1',
        title: 'User 1 Confidential Roadmap',
        content: 'Top secret plans for user 1 projects.',
        date: '2026-09-01',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'note-user-2',
        title: 'User 2 Confidential Financials',
        content: 'Budget and expenses for user 2.',
        date: '2026-09-02',
        userId: 'user-2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ],
    journalEntries: [
      {
        id: 'journal-user-1',
        journalDate: '2026-09-01T00:00:00.000Z',
        content: 'Confidential diary entry for user 1.',
        mood: 'calm',
        gratitude: 'Good health',
        reflections: null,
        lessonsLearned: null,
        tomorrowPlan: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        userId: 'user-1',
      },
      {
        id: 'journal-user-2',
        journalDate: '2026-09-02T00:00:00.000Z',
        content: 'Confidential diary entry for user 2.',
        mood: 'focused',
        gratitude: 'Peace',
        reflections: null,
        lessonsLearned: null,
        tomorrowPlan: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        userId: 'user-2',
      },
    ],
    weightRecords: [
      {
        id: 'weight-user-1',
        userId: 'user-1',
        weight: 72.5,
        date: '2026-09-01',
        notes: 'Confidential weight check for user 1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'weight-user-2',
        userId: 'user-2',
        weight: 65.0,
        date: '2026-09-02',
        notes: 'Confidential weight check for user 2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ],
    leaveRecords: [
      {
        id: 'leave-user-1',
        userId: 'user-1',
        leaveType: 'SICK',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        totalDays: 2,
        status: 'APPROVED',
        notes: 'Confidential medical leave for user 1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'leave-user-2',
        userId: 'user-2',
        leaveType: 'CASUAL',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        totalDays: 2,
        status: 'APPROVED',
        notes: 'Confidential personal leave for user 2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ],
  }

  it('isolates search results by userId: user-1 cannot see user-2 records', () => {
    const resultsUser1 = MasterSearchEngine.search('Confidential', multiUserDataset, 'all', {
      userId: 'user-1',
      isOwner: false,
    })

    expect(resultsUser1.length).toBeGreaterThan(0)
    // Every returned record must belong to user-1, none to user-2
    for (const res of resultsUser1) {
      expect(res.id).not.toContain('user-2')
    }
    expect(resultsUser1.some(r => r.id === 'note-note-user-1')).toBe(true)
    expect(resultsUser1.some(r => r.id === 'journal-journal-user-1')).toBe(true)
    expect(resultsUser1.some(r => r.id === 'weight-weight-user-1')).toBe(true)
    expect(resultsUser1.some(r => r.id === 'leave-leave-user-1')).toBe(true)
  })

  it('isolates search results by userId: user-2 cannot see user-1 records', () => {
    const resultsUser2 = MasterSearchEngine.search('Confidential', multiUserDataset, 'all', {
      userId: 'user-2',
      isOwner: false,
    })

    expect(resultsUser2.length).toBeGreaterThan(0)
    for (const res of resultsUser2) {
      expect(res.id).not.toContain('user-1')
    }
    expect(resultsUser2.some(r => r.id === 'note-note-user-2')).toBe(true)
    expect(resultsUser2.some(r => r.id === 'journal-journal-user-2')).toBe(true)
    expect(resultsUser2.some(r => r.id === 'weight-weight-user-2')).toBe(true)
    expect(resultsUser2.some(r => r.id === 'leave-leave-user-2')).toBe(true)
  })

  it('guest accounts cannot see disabled modules even if matching keyword exists', () => {
    const results = MasterSearchEngine.search('Confidential', multiUserDataset, 'all', {
      userId: 'user-1',
      isOwner: false,
      allowedModules: {
        notes: true,
        journal: false,
        weight: false,
        leave: false,
      },
    })

    // Notes is enabled, so user-1 notes are returned
    expect(results.some(r => r.id === 'note-note-user-1')).toBe(true)

    // Journal, weight, and leave are disabled, so 0 results from those modules
    expect(results.some(r => r.type === 'journal')).toBe(false)
    expect(results.some(r => r.type === 'weight')).toBe(false)
    expect(results.some(r => r.type === 'leave')).toBe(false)
  })

  it('guest accounts cannot see owner-only settings commands', () => {
    const guestResults = MasterSearchEngine.search('admin', multiUserDataset, 'settings', {
      userId: 'guest-1',
      isOwner: false,
    })

    // Non-owner should not receive admin tab
    expect(guestResults.some(r => r.payload?.tab === 'admin')).toBe(false)

    // Owner CAN see admin settings commands
    const ownerResults = MasterSearchEngine.search('admin', multiUserDataset, 'settings', {
      userId: 'owner-1',
      isOwner: true,
    })
    expect(ownerResults.some(r => r.payload?.tab === 'admin')).toBe(true)
  })
})
