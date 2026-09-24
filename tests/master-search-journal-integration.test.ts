import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { MasterSearchEngine, SearchableDataset } from '@/lib/search/MasterSearchEngine'
import { searchGlobalAction } from '@/app/actions/search'
import { db } from '@/lib/db'

describe('Master Search — Complete Journal Integration Suite (#73)', () => {
  const userA = 'user-alice-search'
  const userB = 'user-bob-search'

  beforeEach(() => {
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () =>
        Promise.resolve({
          id: userA,
          username: 'alice',
          email: 'alice@example.com',
          isOwner: true,
        }),
    }))
  })

  it('1. A journal containing "Today I worked on Tracker architecture" is returned when searching "Tracker architecture"', async () => {

    const origFindMany = db.journalEntry.findMany
    db.journalEntry.findMany = mock(() =>
      Promise.resolve([
        {
          id: 'j-arch-1',
          userId: userA,
          journalDate: new Date('2026-09-22T12:00:00.000Z'),
          content: '<p>Today I worked on Tracker architecture and modular boundaries</p>',
          mood: 'focused',
          gratitude: 'Clean code',
          reflections: 'Deep work pays off',
          lessonsLearned: 'Always verify integration paths',
          tomorrowPlan: 'Ship and deploy',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ])
    ) as unknown as typeof db.journalEntry.findMany

    try {
      const res = await searchGlobalAction('Tracker architecture', 'all')
      expect(res.success).toBe(true)
      expect(res.results.length).toBeGreaterThan(0)

      const journalResult = res.results.find(r => r.type === 'journal' && r.id === 'journal-j-arch-1')
      expect(journalResult).toBeDefined()
      expect(journalResult?.type).toBe('journal')
      expect(journalResult?.href).toBe('/journal?date=2026-09-22')
      expect(journalResult?.payload?.date).toBe('2026-09-22')
      expect(journalResult?.snippet).toContain('Tracker architecture')
      expect(journalResult?.metadata).toBe('JOURNAL')
    } finally {
      db.journalEntry.findMany = origFindMany
    }
  })

  it('2. Journal results are NOT filtered out when guestPermissions has journal: false for Owner', () => {
    const dataset: SearchableDataset = {
      journalEntries: [
        {
          id: 'j-owner-1',
          userId: userA,
          journalDate: '2026-09-22T12:00:00.000Z',
          content: 'Secret owner thoughts on Tracker architecture',
          mood: 'determined',
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
    }

    // Pass allowedModules with journal: false (host guest permissions default)
    const results = MasterSearchEngine.search('Tracker architecture', dataset, 'all', {
      userId: userA,
      isOwner: true,
      allowedModules: { journal: false, notes: true, settings: true },
    })

    expect(results.length).toBe(1)
    expect(results[0].type).toBe('journal')
    expect(results[0].id).toBe('journal-j-owner-1')
  })

  it('3. Soft-deleted journal entries are excluded from MasterSearchEngine', () => {
    const dataset: SearchableDataset = {
      journalEntries: [
        {
          id: 'j-deleted-1',
          userId: userA,
          journalDate: '2026-09-22T12:00:00.000Z',
          content: 'Deleted entry about Tracker architecture',
          mood: null,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: new Date(),
        },
        {
          id: 'j-active-1',
          userId: userA,
          journalDate: '2026-09-22T12:00:00.000Z',
          content: 'Active entry about Tracker architecture',
          mood: null,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
    }

    const results = MasterSearchEngine.search('Tracker architecture', dataset, 'all', {
      userId: userA,
      isOwner: true,
    })

    expect(results.length).toBe(1)
    expect(results[0].id).toBe('journal-j-active-1')
  })

  it('4. Master Search isolates journal results between users', () => {
    const dataset: SearchableDataset = {
      journalEntries: [
        {
          id: 'j-alice',
          userId: userA,
          journalDate: '2026-09-22T12:00:00.000Z',
          content: 'Confidential Alice plan for architecture',
          mood: null,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'j-bob',
          userId: userB,
          journalDate: '2026-09-22T12:00:00.000Z',
          content: 'Confidential Bob plan for architecture',
          mood: null,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
    }

    const aliceResults = MasterSearchEngine.search('architecture', dataset, 'all', {
      userId: userA,
      isOwner: false,
    })
    expect(aliceResults.length).toBe(1)
    expect(aliceResults[0].id).toBe('journal-j-alice')

    const bobResults = MasterSearchEngine.search('architecture', dataset, 'all', {
      userId: userB,
      isOwner: false,
    })
    expect(bobResults.length).toBe(1)
    expect(bobResults[0].id).toBe('journal-j-bob')
  })

  it('5. Searches across all documented Journal fields in MasterSearchEngine', () => {
    const dataset: SearchableDataset = {
      journalEntries: [
        {
          id: 'j-fields-1',
          userId: userA,
          journalDate: '2026-09-22T12:00:00.000Z',
          content: 'Plain diary content',
          mood: 'ecstatic',
          gratitude: 'Morning sunshine',
          reflections: 'Meditation helped focus',
          lessonsLearned: 'Double check boundary conditions',
          tomorrowPlan: 'Launch production build',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
    }

    const testKeywords = [
      'ecstatic',            // mood
      'sunshine',            // gratitude
      'Meditation',          // reflections
      'boundary conditions', // lessonsLearned
      'production build',    // tomorrowPlan
    ]

    for (const kw of testKeywords) {
      const results = MasterSearchEngine.search(kw, dataset, 'all', {
        userId: userA,
        isOwner: true,
      })
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('journal-j-fields-1')
      expect(results[0].type).toBe('journal')
    }
  })
})
