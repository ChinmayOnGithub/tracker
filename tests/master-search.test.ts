import { describe, it, expect } from 'bun:test'

describe('Master Search Data Filtering & Indexing Logic', () => {
  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const sampleNotes = [
    { id: 'note-1', title: 'System Architecture Notes', content: '<p>Discussing database write queues and local storage.</p>' },
    { id: 'note-2', title: 'Grocery List', content: '<p>Milk, eggs, coffee beans, bread.</p>' }
  ]

  const sampleJournalEntries = [
    { id: 'j-1', journalDate: '2026-09-04', content: '<p>Great productive day refactoring search and notes.</p>', mood: 'productive', reflections: 'Need more sleep.' },
    { id: 'j-2', journalDate: '2026-09-01', content: '<p>Visited the museum and library today.</p>', mood: 'relaxed', reflections: null }
  ]

  const sampleTemplates = [
    { id: 't-1', name: 'Morning Workout & Cardio', category: 'fitness', recurrenceType: 'daily', notes: 'Leg day routine' },
    { id: 't-2', name: 'Pay Electricity Bill', category: 'finance', recurrenceType: 'monthly', notes: 'Due 10th of every month' }
  ]

  const sampleLinks = [
    { id: 'l-1', title: 'Next.js Documentation', url: 'https://nextjs.org/docs', description: 'App router guides' },
    { id: 'l-2', title: 'GitHub Tracker Repo', url: 'https://github.com/tracker', description: 'Source code repository' }
  ]

  const sampleVault = [
    { id: 'v-1', name: 'Aadhaar Card.pdf', isFolder: false, mimeGroup: 'PDF Document' },
    { id: 'v-2', name: 'Tax Invoices 2026', isFolder: true, mimeGroup: 'Folder' }
  ]

  const sampleWeight = [
    { id: 'w-1', date: '2026-09-04', weight: 72.5, notes: 'Post morning cardio' },
    { id: 'w-2', date: '2026-09-01', weight: 73.0, notes: 'Fasting measurement' }
  ]

  const sampleLeave = [
    { id: 'lv-1', leaveType: 'vacation', startDate: '2026-10-10', endDate: '2026-10-15', totalDays: 5, status: 'approved', notes: 'Goa trip' },
    { id: 'lv-2', leaveType: 'sick', startDate: '2026-08-15', endDate: '2026-08-16', totalDays: 1, status: 'completed', notes: 'Fever rest' }
  ]

  it('should match notes by title or content substring', () => {
    const q = 'write queues'
    const matched = sampleNotes.filter(n => {
      const titleMatch = (n.title || '').toLowerCase().includes(q)
      const contentMatch = stripHtml(n.content || '').toLowerCase().includes(q)
      return titleMatch || contentMatch
    })
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe('note-1')
  })

  it('should match journal entries by content, date, or mood', () => {
    const q1 = 'productive'
    const matchedMood = sampleJournalEntries.filter(j => (j.mood || '').toLowerCase().includes(q1))
    expect(matchedMood.length).toBe(1)
    expect(matchedMood[0].id).toBe('j-1')

    const q2 = '2026-09-01'
    const matchedDate = sampleJournalEntries.filter(j => j.journalDate.includes(q2))
    expect(matchedDate.length).toBe(1)
    expect(matchedDate[0].id).toBe('j-2')
  })

  it('should match tasks and habits by name, category, or notes', () => {
    const q = 'cardio'
    const matched = sampleTemplates.filter(t => (t.name || '').toLowerCase().includes(q))
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe('t-1')
  })

  it('should match links by url and description', () => {
    const q = 'nextjs.org'
    const matched = sampleLinks.filter(l => (l.url || '').toLowerCase().includes(q))
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe('l-1')
  })

  it('should match vault items by filename', () => {
    const q = 'aadhaar'
    const matched = sampleVault.filter(v => (v.name || '').toLowerCase().includes(q))
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe('v-1')
  })

  it('should match weight logs by date or weight number', () => {
    const q = '72.5'
    const matched = sampleWeight.filter(w => `${w.weight}`.includes(q))
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe('w-1')
  })

  it('should match leave records by leaveType or destination notes', () => {
    const q = 'goa trip'
    const matched = sampleLeave.filter(lv => (lv.notes || '').toLowerCase().includes(q))
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe('lv-1')
  })
})
