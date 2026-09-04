import { describe, it, expect } from 'bun:test'
import { MasterSearchEngine, SearchableDataset, computeMatchScore, tokenize } from '@/lib/search/MasterSearchEngine'

describe('MasterSearchEngine Unit & Regression Suite', () => {
  const sampleDataset: SearchableDataset = {
    notes: [
      {
        id: 'note-1',
        title: 'System Architecture Notes',
        content: '<p>Discussing database write queues and local storage offline replication.</p>',
        date: '2026-09-04',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      },
      {
        id: 'note-2',
        title: 'Grocery & Hardware Shopping List',
        content: '<p>Milk, eggs, coffee beans, bread, hammer, screws.</p>',
        date: '2026-09-01',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      }
    ],
    journalEntries: [
      {
        id: 'j-1',
        journalDate: '2026-09-04T00:00:00.000Z',
        content: '<p>Great productive day refactoring search and notes.</p>',
        mood: 'productive',
        gratitude: 'Grateful for good coffee',
        reflections: 'Need more sleep and structured rest.',
        lessonsLearned: 'Always tokenize multi-word search queries.',
        tomorrowPlan: 'Ship mobile search modal.',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        userId: 'user-1'
      },
      {
        id: 'j-2',
        journalDate: '2026-09-01T00:00:00.000Z',
        content: '<p>Visited the national museum and public library today.</p>',
        mood: 'relaxed',
        gratitude: null,
        reflections: null,
        lessonsLearned: null,
        tomorrowPlan: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        userId: 'user-1'
      }
    ],
    templates: [
      {
        id: 't-1',
        name: 'Morning Workout & Cardio',
        category: 'Fitness',
        recurrenceType: 'daily',
        type: 'TASK',
        notes: 'Leg day routine with 20 min cycling',
        isActive: true,
        sortOrder: 0,
        priority: 'MEDIUM',
        estimatedDuration: 30,
        energyRequired: 'HIGH',
        calendarProvider: 'NONE',
        calendarEventId: null,
        notificationRules: null,
        targetDate: null,
        recurrenceInterval: null,
        recurrenceDaysOfWeek: null,
        recurrenceDayOfMonth: null,
        recurrenceMonth: null,
        remindBeforeDays: null,
        amount: null,
        tags: [],
        color: 'blue',
        icon: 'dumbbell',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 't-2',
        name: 'Pay Electricity & Water Bills',
        category: 'Finance',
        recurrenceType: 'monthly',
        type: 'TASK',
        notes: 'Due 10th of every month on portal',
        isActive: true,
        sortOrder: 1,
        priority: 'HIGH',
        estimatedDuration: 15,
        energyRequired: 'LOW',
        calendarProvider: 'NONE',
        calendarEventId: null,
        notificationRules: null,
        targetDate: null,
        recurrenceInterval: null,
        recurrenceDaysOfWeek: null,
        recurrenceDayOfMonth: null,
        recurrenceMonth: null,
        remindBeforeDays: null,
        amount: null,
        tags: [],
        color: 'amber',
        icon: 'wallet',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    collections: [
      {
        id: 'col-1',
        name: 'Dev Resources',
        description: 'Developer documentation and repositories',
        color: '#6366f1',
        icon: 'code',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    links: [
      {
        id: 'l-1',
        title: 'Next.js App Router Documentation',
        url: 'https://nextjs.org/docs/app',
        description: 'Official Next.js guide and API reference',
        collectionId: 'col-1',
        clicks: 12,
        isStarred: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'l-2',
        title: 'GitHub Tracker Repository',
        url: 'https://github.com/tracker/core',
        description: 'Main open source tracker codebase',
        collectionId: null,
        clicks: 5,
        isStarred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    vaultItems: [
      {
        id: 'v-1',
        name: 'Passport_2026.pdf',
        isFolder: false,
        parentId: null,
        mimeGroup: 'PDF',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'v-2',
        name: 'Tax Invoices 2026',
        isFolder: true,
        parentId: null,
        mimeGroup: 'Folder',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    weightRecords: [
      {
        id: 'w-1',
        userId: 'user-1',
        date: '2026-09-04',
        weight: 72.5,
        notes: 'Post morning cardio session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'w-2',
        userId: 'user-1',
        date: '2026-09-01',
        weight: 73.0,
        notes: 'Fasting measurement',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    leaveRecords: [
      {
        id: 'lv-1',
        userId: 'user-1',
        leaveType: 'Vacation',
        startDate: '2026-10-10',
        endDate: '2026-10-15',
        totalDays: 5,
        status: 'approved',
        notes: 'Goa annual vacation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'lv-2',
        userId: 'user-1',
        leaveType: 'Sick',
        startDate: '2026-08-15',
        endDate: '2026-08-16',
        totalDays: 1,
        status: 'completed',
        notes: 'Fever recovery',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
  }

  // ─── Tokenizer & Ranking Tests ───────────────────────────────────────────────

  it('tokenizes multi-word queries correctly', () => {
    const tokens = tokenize('  Windows   Architecture  Guide ')
    expect(tokens).toEqual(['windows', 'architecture', 'guide'])
  })

  it('ranks exact title match higher than partial content match', () => {
    const scoreExact = computeMatchScore(['system', 'architecture'], 'system architecture', {
      title: 'System Architecture',
      content: 'Some other text'
    })

    const scorePartial = computeMatchScore(['system', 'architecture'], 'system architecture', {
      title: 'Random Note',
      content: 'System architecture is discussed here'
    })

    expect(scoreExact.score).toBeGreaterThan(scorePartial.score)
  })

  // ─── Domain Specific Tests ──────────────────────────────────────────────────

  it('searches Notes by title and content with deep-link', () => {
    const results = MasterSearchEngine.search('write queues', sampleDataset, 'note')
    expect(results.length).toBe(1)
    expect(results[0].type).toBe('note')
    expect(results[0].title).toBe('System Architecture Notes')
    expect(results[0].href).toBe('/notes?id=note-1')
    expect(results[0].metadata).toBe('NOTES')
  })

  it('searches Journal entries by phrase, date, mood, and reflections with deep-link', () => {
    const moodResults = MasterSearchEngine.search('productive', sampleDataset, 'journal')
    expect(moodResults.length).toBe(1)
    expect(moodResults[0].type).toBe('journal')
    expect(moodResults[0].href).toBe('/journal?date=2026-09-04')
    expect(moodResults[0].payload?.date).toBe('2026-09-04')

    const reflectionResults = MasterSearchEngine.search('structured rest', sampleDataset, 'journal')
    expect(reflectionResults.length).toBe(1)
    expect(reflectionResults[0].id).toBe('journal-j-1')
  })

  it('searches Activities by name, category, notes, type, and recurrence with deep-link', () => {
    const nameResults = MasterSearchEngine.search('cycling', sampleDataset, 'activity')
    expect(nameResults.length).toBe(1)
    expect(nameResults[0].type).toBe('activity')
    expect(nameResults[0].title).toBe('Morning Workout & Cardio')
    expect(nameResults[0].href).toBe('/activities?id=t-1')
    expect(nameResults[0].metadata).toBe('ACTIVITIES')

    const catResults = MasterSearchEngine.search('finance monthly', sampleDataset, 'activity')
    expect(catResults.length).toBe(1)
    expect(catResults[0].title).toBe('Pay Electricity & Water Bills')
    expect(catResults[0].href).toBe('/activities?id=t-2')
  })

  it('searches Links by title, URL, description, and collection name with exact deep-link', () => {
    const urlResults = MasterSearchEngine.search('nextjs.org', sampleDataset, 'link')
    expect(urlResults.length).toBe(1)
    expect(urlResults[0].type).toBe('link')
    expect(urlResults[0].title).toBe('Next.js App Router Documentation')
    expect(urlResults[0].href).toBe('/links?id=l-1&colId=col-1')
    expect(urlResults[0].payload?.externalUrl).toBe('https://nextjs.org/docs/app')

    const colResults = MasterSearchEngine.search('dev resources', sampleDataset, 'link')
    expect(colResults.length).toBe(1)
    expect(colResults[0].title).toBe('Next.js App Router Documentation')
  })

  it('searches Vault metadata (filename, mimeGroup) safely without decrypting payloads', () => {
    const docResults = MasterSearchEngine.search('passport', sampleDataset, 'document')
    expect(docResults.length).toBe(1)
    expect(docResults[0].type).toBe('document')
    expect(docResults[0].title).toBe('Passport_2026.pdf')
    expect(docResults[0].href).toBe('/documents?id=v-1')
    expect(docResults[0].metadata).toBe('DOCUMENTS')
  })

  it('searches Weight records by weight value and notes', () => {
    const weightResults = MasterSearchEngine.search('72.5', sampleDataset, 'weight')
    expect(weightResults.length).toBe(1)
    expect(weightResults[0].type).toBe('weight')
    expect(weightResults[0].title).toBe('72.5 kg')
    expect(weightResults[0].href).toBe('/weight')
  })

  it('searches Leave records by type, notes, and dates', () => {
    const leaveResults = MasterSearchEngine.search('goa vacation', sampleDataset, 'leave')
    expect(leaveResults.length).toBe(1)
    expect(leaveResults[0].type).toBe('leave')
    expect(leaveResults[0].title).toBe('VACATION (5 days)')
    expect(leaveResults[0].href).toBe('/leave')
  })

  it('searches Settings preferences by tab and keyword with deep-link', () => {
    const appResults = MasterSearchEngine.search('dark light mode theme', sampleDataset, 'settings')
    expect(appResults.length).toBe(1)
    expect(appResults[0].type).toBe('settings')
    expect(appResults[0].href).toBe('/settings?tab=appearance')
    expect(appResults[0].payload?.tab).toBe('appearance')

    const secResults = MasterSearchEngine.search('passcode lock', sampleDataset, 'settings')
    expect(secResults.length).toBe(1)
    expect(secResults[0].href).toBe('/settings?tab=security')
  })

  it('respects category filter when specified', () => {
    // "2026" appears in Journal, Vault, Weight, and Leave
    const allResults = MasterSearchEngine.search('2026', sampleDataset, 'all')
    expect(allResults.length).toBeGreaterThan(2)

    const docOnlyResults = MasterSearchEngine.search('2026', sampleDataset, 'document')
    expect(docOnlyResults.every(r => r.type === 'document')).toBe(true)

    const noteOnlyResults = MasterSearchEngine.search('2026', sampleDataset, 'note')
    expect(noteOnlyResults.every(r => r.type === 'note')).toBe(true)
  })

  it('handles empty query gracefully', () => {
    const emptyResults = MasterSearchEngine.search('   ', sampleDataset, 'all')
    expect(emptyResults).toEqual([])
  })
})
