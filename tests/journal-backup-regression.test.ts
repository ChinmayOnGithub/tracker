import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { BackupService } from '@/lib/database/local/BackupService'
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine'
import { LocalJournalRepository } from '@/modules/journal/repository/LocalJournalRepository'

// Mock server actions to avoid Next.js request context / auth errors in tests
mock.module('@/app/actions/journal', () => ({
  listJournalEntries: async () => ({ success: true, entries: [] })
}))

describe('Journal Backup & Restore Regression Test Suite', () => {
  let localStore: Record<string, Record<string, unknown>[]> = {}

  beforeEach(() => {
    // Clean and isolate database/mock state for each test
    localStore = {
      journal_entries: [],
      activity_templates: [],
      activity_logs: [],
      weight_records: [],
      leave_records: [],
      work_sessions: [],
      link_library: [],
      settings: []
    }

    if (typeof window === 'undefined') {
      const mockEngine = {
        put: async (storeName: string, item: Record<string, unknown>) => {
          console.log(`[Mock IDB] put ${storeName} key=${item.id}`)
          if (!localStore[storeName]) localStore[storeName] = []
          const list = localStore[storeName]
          const idx = list.findIndex(i => i.id === item.id)
          if (idx >= 0) {
            list[idx] = item
          } else {
            list.push(item)
          }
        },
        getAll: async (storeName: string) => {
          console.log(`[Mock IDB] getAll ${storeName}`)
          return localStore[storeName] || []
        },
        get: async (storeName: string, id: string) => {
          console.log(`[Mock IDB] get ${storeName} id=${id}`)
          return localStore[storeName]?.find(i => i.id === id) || null
        },
        getDb: async () => ({
          transaction: (storeNames: string[]) => {
            console.log(`[Mock IDB] transaction for stores: ${storeNames.join(', ')}`)
            let onCompleteCallback: (() => void) | null = null
            
            const tx = {
              objectStore: (name: string) => ({
                clear: () => {
                  console.log(`[Mock IDB Tx] clear ${name}`)
                  localStore[name] = []
                },
                put: (item: Record<string, unknown>) => {
                  console.log(`[Mock IDB Tx] put ${name} key=${item.id}`)
                  const list = localStore[name] || []
                  const idx = list.findIndex(i => i.id === item.id)
                  if (idx >= 0) {
                    list[idx] = item
                  } else {
                    list.push(item)
                  }
                }
              }),
              abort: () => {
                console.log(`[Mock IDB Tx] abort`)
              },
              get oncomplete() {
                return onCompleteCallback
              },
              set oncomplete(val) {
                onCompleteCallback = val
                // Trigger the oncomplete callback immediately in a microtask
                queueMicrotask(() => {
                  if (onCompleteCallback) onCompleteCallback()
                })
              },
              onerror: null,
              onabort: null
            }
            return tx
          }
        })
      }
      // Inject mock engine
      IndexedDBEngine.getInstance = () => mockEngine as unknown as IndexedDBEngine
    }
  })

  it('TEST 1: LocalJournalRepository -> BackupService.exportBackup() -> verify journal_entries', async () => {
    console.log('[Test 1] Starting')
    const localJournalRepo = new LocalJournalRepository()

    console.log('[Test 1] Seeding entries')
    // Seed 3 historical journal entries
    await localJournalRepo.save({
      id: 'journal-hist-1',
      journalDate: '2026-08-12T12:00:00.000Z',
      content: 'Historical entry 1 content',
      mood: 'neutral',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: '2026-08-12T12:00:00.000Z',
      updatedAt: '2026-08-12T12:00:00.000Z'
    })

    await localJournalRepo.save({
      id: 'journal-hist-2',
      journalDate: '2026-08-13T12:00:00.000Z',
      content: 'Historical entry 2 content',
      mood: 'happy',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:00:00.000Z'
    })

    await localJournalRepo.save({
      id: 'journal-hist-3',
      journalDate: '2026-08-14T12:00:00.000Z',
      content: 'Historical entry 3 content',
      mood: 'sad',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: '2026-08-14T12:00:00.000Z',
      updatedAt: '2026-08-14T12:00:00.000Z'
    })

    // Seed 1 newly created journal entry
    await localJournalRepo.save({
      id: 'journal-new-1',
      journalDate: '2026-08-15T12:00:00.000Z',
      content: 'Newly created entry',
      mood: 'positive',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: '2026-08-15T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z'
    })

    // Seed 1 entry with rich text
    await localJournalRepo.save({
      id: 'journal-rich-1',
      journalDate: '2026-08-15T12:30:00.000Z',
      content: '<h1>Rich Text Heading</h1><p>This is a <strong>rich text</strong> paragraph.</p>',
      mood: 'excited',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      createdAt: '2026-08-15T12:30:00.000Z',
      updatedAt: '2026-08-15T12:30:00.000Z'
    })

    // Seed 1 entry with metadata & image references
    await localJournalRepo.save({
      id: 'journal-meta-1',
      journalDate: '2026-08-15T13:00:00.000Z',
      content: '<img src="data:image/png;base64,12345" alt="memory.png" />',
      mood: 'creative',
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      metadata: { images: [{ name: 'memory.png', data: 'data:image/png;base64,12345' }] },
      createdAt: '2026-08-15T13:00:00.000Z',
      updatedAt: '2026-08-15T13:00:00.000Z'
    })

    console.log('[Test 1] Exporting backup')
    const jsonStr = await BackupService.exportBackup()
    
    console.log('[Test 1] Parsing backup JSON')
    const payload = JSON.parse(jsonStr)

    console.log('[Test 1] Performing assertions')
    expect(payload.data.journal_entries).toBeDefined()
    expect(payload.data.journal_entries.length).toBe(6)

    interface ExpectedEntry {
      id: string
      content: string
      metadata?: { images?: { name: string; data: string }[] }
    }
    const entries = payload.data.journal_entries as ExpectedEntry[]
    expect(entries.some(e => e.id === 'journal-hist-1' && e.content === 'Historical entry 1 content')).toBe(true)
    expect(entries.some(e => e.id === 'journal-rich-1' && e.content.includes('Rich Text Heading'))).toBe(true)
    expect(entries.some(e => e.id === 'journal-meta-1' && e.metadata?.images?.[0]?.name === 'memory.png')).toBe(true)
    console.log('[Test 1] Completed successfully')
  })

  it('TEST 2: BackupService.restoreBackup() -> verify restored Journal records', async () => {
    console.log('[Test 2] Starting')
    const mockBackupPayload = {
      appVersion: '1.0.0',
      formatVersion: 1,
      dbVersion: 4,
      timestamp: new Date().toISOString(),
      data: {
        journal_entries: [
          {
            id: 'journal-restore-1',
            journalDate: '2026-08-15T12:00:00.000Z',
            content: 'Restored entry content',
            mood: 'peaceful',
            createdAt: '2026-08-15T12:00:00.000Z',
            updatedAt: '2026-08-15T12:00:00.000Z',
            metadata: { tag: 'restore-test' }
          }
        ]
      }
    }

    console.log('[Test 2] Restoring backup')
    await BackupService.restoreBackup(mockBackupPayload as unknown as import('@/lib/database/local/BackupService').BackupPayload)

    console.log('[Test 2] Verifying restored data in localStore')
    const restored = localStore.journal_entries
    expect(restored).toBeDefined()
    expect(restored.length).toBe(1)
    expect(restored[0].id).toBe('journal-restore-1')
    expect(restored[0].content).toBe('Restored entry content')
    const meta = restored[0].metadata as Record<string, unknown> | undefined
    expect(meta?.tag).toBe('restore-test')
    console.log('[Test 2] Completed successfully')
  })
})
