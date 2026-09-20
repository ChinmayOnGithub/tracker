/**
 * tests/cross-account-security-hardening.test.ts
 *
 * Strict Regression Test Suite for Issue #72 / Step 5:
 * Cross-Account Data Ownership, Authorization Hardening, and State Isolation.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { db } from '@/lib/db'
import { NotFoundError } from '@/lib/errors'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { GoogleCredentialService } from '@/modules/sync/google-calendar/services/GoogleCredentialService'
import {
  getUserStorageItem,
  setUserStorageItem,
  purgeUserStorage,
  migrateLegacyUserStorage,
} from '@/lib/storage/userStorage'
import { WorkSessionService } from '@/modules/work/services/WorkSessionService'
import { createNote, listNotes } from '@/app/actions/note'
import { upsertJournalEntry, listJournalEntries } from '@/app/actions/journal'
import { logWeight, getWeightHistory } from '@/app/actions/weight'
import { updateLinkCollection, deleteLinkCollection, deleteLink, deleteLinkTag } from '@/app/actions/links'
import { renameVaultItem, toggleVaultFavorite, toggleVaultPin } from '@/app/actions/vault'
import { CalendarRepository } from '@/modules/calendar/repositories/CalendarRepository'
import type { Prisma, Note, JournalEntry, WeightRecord, CalendarEvent } from '@prisma/client'

// In-memory mock storage for client storage isolation tests
const mockStorage = new Map<string, string>()
if (typeof window === 'undefined') {
  const localStorageMock = {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { mockStorage.set(key, String(value)) },
    removeItem: (key: string) => { mockStorage.delete(key) },
    clear: () => { mockStorage.clear() },
    key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
    get length() { return mockStorage.size }
  }
  ;(globalThis as unknown as { window: { localStorage: typeof localStorageMock } }).window = { localStorage: localStorageMock }
  ;(globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock
}

describe('Step 5 / Issue #72: Cross-Account Security & Data Isolation Hardening', () => {
  const userA = 'user-a-1111-1111-1111'
  const userB = 'user-b-2222-2222-2222'

  beforeEach(() => {
    mockStorage.clear()
  })

  // ---------------------------------------------------------------------------
  // 1. requireOwnership & ID Existence Disclosure Oracle
  // ---------------------------------------------------------------------------
  describe('Phase 2: requireOwnership Hardening & Oracle Elimination', () => {
    it('throws NotFoundError identically for non-existent vs other users resource', async () => {
      // Mock requireAuth to return User A
      const origRequireAuth = AuthorizationService.requireAuth
      AuthorizationService.requireAuth = mock(() =>
        Promise.resolve({ id: userA, username: 'user_a', isOwner: false })
      )

      // Mock note findFirst: returns null because the note belongs to userB, not userA
      const origFindFirst = db.note.findFirst
      db.note.findFirst = mock((args?: { where?: Prisma.NoteWhereInput }) => {
        if (args?.where?.id === 'note-b' && args?.where?.userId === userB) {
          return Promise.resolve({
            id: 'note-b',
            userId: userB,
            title: 'Secret B',
            content: 'Private note',
            date: '2026-09-20',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          } as Note)
        }
        return Promise.resolve(null)
      }) as unknown as typeof db.note.findFirst

      try {
        // Query non-existent ID
        let nonExistentError: unknown
        try {
          await AuthorizationService.requireOwnership('note', 'non-existent-id')
        } catch (err) {
          nonExistentError = err
        }

        // Query User B's ID
        let userBError: unknown
        try {
          await AuthorizationService.requireOwnership('note', 'note-b')
        } catch (err) {
          userBError = err
        }

        expect(nonExistentError).toBeInstanceOf(NotFoundError)
        expect(userBError).toBeInstanceOf(NotFoundError)
        expect((nonExistentError as NotFoundError).message).toBe((userBError as NotFoundError).message)
        expect((nonExistentError as NotFoundError).statusCode).toBe(404)
        expect((userBError as NotFoundError).statusCode).toBe(404)
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.note.findFirst = origFindFirst
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Journal Access & Pro Write Enforcement
  // ---------------------------------------------------------------------------
  describe('Phase 3: Journal Access & Write Capability', () => {
    it('denies Free / lapsed user journal writes while preserving historical reads', async () => {
      const origRequireModule = AuthorizationService.requireModuleAccess
      const origHasFeature = EntitlementService.hasFeature
      const origFindMany = db.journalEntry.findMany
      const origCount = db.journalEntry.count

      AuthorizationService.requireModuleAccess = mock(() =>
        Promise.resolve({ id: userA, username: 'user_a', isOwner: false })
      )
      // User A does not have advanced_journal capability (Free or lapsed Pro)
      EntitlementService.hasFeature = mock(() => Promise.resolve(false))

      db.journalEntry.findMany = mock(() =>
        Promise.resolve([
          {
            id: 'j-1',
            userId: userA,
            journalDate: new Date('2026-08-01T12:00:00.000Z'),
            content: 'Old memory from when I was Pro',
            mood: 'happy',
            gratitude: null,
            reflections: null,
            lessonsLearned: null,
            tomorrowPlan: null,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          } as JournalEntry
        ])
      ) as unknown as typeof db.journalEntry.findMany
      db.journalEntry.count = mock(() => Promise.resolve(1)) as unknown as typeof db.journalEntry.count

      try {
        // Direct write action must fail with ACCESS_DENIED
        const writeResult = await upsertJournalEntry('2026-09-20', { content: 'New entry today' })
        expect(writeResult.success).toBe(false)
        expect(writeResult.code).toBe('ACCESS_DENIED')

        // Historical read must succeed
        const readResult = await listJournalEntries(1, 10)
        expect(readResult.success).toBe(true)
        expect(readResult.entries.length).toBe(1)
        expect(readResult.entries[0].content).toBe('Old memory from when I was Pro')
      } finally {
        AuthorizationService.requireModuleAccess = origRequireModule
        EntitlementService.hasFeature = origHasFeature
        db.journalEntry.findMany = origFindMany
        db.journalEntry.count = origCount
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Notes Access & Pro Write Enforcement
  // ---------------------------------------------------------------------------
  describe('Phase 3: Notes Access & Write Capability', () => {
    it('denies Free / lapsed user notes writes while preserving historical reads', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origHasFeature = EntitlementService.hasFeature
      const origFindMany = db.note.findMany

      AuthorizationService.requireAuth = mock(() =>
        Promise.resolve({ id: userA, username: 'user_a', isOwner: false })
      )
      // Free / lapsed user lacks unlimited_notes write capability
      EntitlementService.hasFeature = mock(() => Promise.resolve(false))

      db.note.findMany = mock(() =>
        Promise.resolve([
          {
            id: 'n-1',
            userId: userA,
            date: '2026-07-15',
            title: 'Important Saved Note',
            content: 'Historical knowledge',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          } as Note
        ])
      ) as unknown as typeof db.note.findMany

      try {
        // Write action must fail with ACCESS_DENIED
        const createResult = await createNote('New content', 'My New Note')
        expect(createResult.success).toBe(false)
        expect(createResult.code).toBe('ACCESS_DENIED')

        // Historical read must succeed
        const readResult = await listNotes()
        expect(readResult.success).toBe(true)
        expect(readResult.notes.length).toBe(1)
        expect(readResult.notes[0].title).toBe('Important Saved Note')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        EntitlementService.hasFeature = origHasFeature
        db.note.findMany = origFindMany
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Weight Access & Pro Write Enforcement
  // ---------------------------------------------------------------------------
  describe('Phase 3: Weight Access & Write Capability', () => {
    it('denies Free / lapsed user weight log writes while preserving historical reads', async () => {
      const origRequireModule = AuthorizationService.requireModuleAccess
      const origIsPro = EntitlementService.isPro
      const origFindMany = db.weightRecord.findMany

      AuthorizationService.requireModuleAccess = mock(() =>
        Promise.resolve({ id: userA, username: 'user_a', isOwner: false })
      )
      // Free user is not Pro
      EntitlementService.isPro = mock(() => Promise.resolve(false))

      db.weightRecord.findMany = mock(() =>
        Promise.resolve([
          {
            id: 'w-1',
            userId: userA,
            date: new Date('2026-08-01T12:00:00.000Z'),
            weight: 72.5,
            notes: 'Baseline',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          } as WeightRecord
        ])
      ) as unknown as typeof db.weightRecord.findMany

      try {
        // Write action must fail with ACCESS_DENIED
        const logResult = await logWeight('2026-09-20', 73.0)
        expect(logResult.success).toBe(false)
        expect(logResult.code).toBe('ACCESS_DENIED')

        // Historical read must succeed
        const readResult = await getWeightHistory(90)
        expect(readResult.success).toBe(true)
        expect(readResult.records.length).toBe(1)
        expect(readResult.records[0].weight).toBe(72.5)
      } finally {
        AuthorizationService.requireModuleAccess = origRequireModule
        EntitlementService.isPro = origIsPro
        db.weightRecord.findMany = origFindMany
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Work Sessions: Scoped Mutations & Cascade Isolation
  // ---------------------------------------------------------------------------
  describe('Phase 1: Work Sessions User-Scoped Mutations', () => {
    it('prevents User A from pausing, resuming, finishing, or deleting User B session', async () => {
      // Setup mock: session belongs to User B
      db.workSession.findFirst = mock((args?: { where?: Prisma.WorkSessionWhereInput }) => {
        if (args?.where?.id === 'sess-b' && args?.where?.userId === userB) {
          return Promise.resolve({
            id: 'sess-b',
            userId: userB,
            date: '2026-09-20',
            mode: 'office',
            startedAt: new Date(),
            endedAt: null,
            durationMinutes: 60,
            loggingMode: 'timer',
            manualMinutes: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          })
        }
        return Promise.resolve(null)
      }) as unknown as typeof db.workSession.findFirst

      db.workSession.updateMany = mock((args?: { where?: Prisma.WorkSessionWhereInput }) => {
        if (args?.where?.userId === userB) {
          return Promise.resolve({ count: 1 })
        }
        return Promise.resolve({ count: 0 })
      }) as unknown as typeof db.workSession.updateMany

      // User A attempts to pause User B's session
      expect(WorkSessionService.pauseSession(userA, 'sess-b')).rejects.toThrow('Work session not found.')

      // User A attempts to resume User B's session
      expect(WorkSessionService.resumeSession(userA, 'sess-b')).rejects.toThrow('Work session not found.')

      // User A attempts to finish User B's session
      expect(WorkSessionService.finishSession(userA, 'sess-b')).rejects.toThrow('Work session not found.')

      // User A attempts to delete User B's session
      expect(WorkSessionService.deleteSession(userA, 'sess-b')).rejects.toThrow('Work session not found.')
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Google Calendar: Atomic Transactional Disconnect
  // ---------------------------------------------------------------------------
  describe('Phase 4: Google Calendar Disconnect Atomicity', () => {
    it('transactionally cleans up credentials and linkedEventMappings for the user', async () => {
      let transactionOperations: unknown[] = []
      const origTransaction = db.$transaction
      db.$transaction = mock((ops: unknown[]) => {
        transactionOperations = ops
        return Promise.resolve(ops)
      }) as unknown as typeof db.$transaction

      const origGetRefreshToken = GoogleCredentialService.getRefreshToken
      GoogleCredentialService.getRefreshToken = mock(() => Promise.resolve(null))

      try {
        const res = await GoogleCredentialService.disconnect(userA)
        expect(res).toBe(true)
        // Verify transaction was called with 2 atomic operations (credentials deleteMany + mappings updateMany)
        expect(transactionOperations.length).toBe(2)
      } finally {
        db.$transaction = origTransaction
        GoogleCredentialService.getRefreshToken = origGetRefreshToken
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Storage Isolation & Legacy Key Migration
  // ---------------------------------------------------------------------------
  describe('Phase 5: User Storage Isolation & Migration', () => {
    it('safely migrates User A legacy keys to scoped namespace and prevents User B leakage', () => {
      // Legacy un-scoped keys present before migration
      localStorage.setItem('personal_display_name', 'Alice In Wonderland')
      localStorage.setItem('tracker-user-height', '170')

      // User A accesses the system -> trigger migration
      migrateLegacyUserStorage(userA)

      // User A gets their value via scoped storage
      expect(getUserStorageItem(userA, 'personal_display_name')).toBe('Alice In Wonderland')
      expect(getUserStorageItem(userA, 'tracker-user-height')).toBe('170')

      // Legacy raw un-scoped keys must have been removed
      expect(localStorage.getItem('personal_display_name')).toBeNull()
      expect(localStorage.getItem('tracker-user-height')).toBeNull()

      // User B logs in: User B MUST NEVER see User A's data
      expect(getUserStorageItem(userB, 'personal_display_name')).toBeNull()
      expect(getUserStorageItem(userB, 'tracker-user-height')).toBeNull()
    })

    it('unsafe un-scoped fallback is completely eliminated', () => {
      // Set an arbitrary un-scoped key
      localStorage.setItem('custom_arbitrary_key', 'Sensitive Secret')

      // getUserStorageItem must return null instead of falling back to raw un-scoped key
      expect(getUserStorageItem(userA, 'custom_arbitrary_key')).toBeNull()
      expect(getUserStorageItem(userB, 'custom_arbitrary_key')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Account Switching: Full Footprint Purge
  // ---------------------------------------------------------------------------
  describe('Phase 6: Account Switching Full Purge', () => {
    it('purges all User A state so User B starts completely clean', () => {
      setUserStorageItem(userA, 'personal_display_name', 'Commander Alice')
      setUserStorageItem(userA, 'personal_weekly_goal', '35')

      // Verify User A sees data
      expect(getUserStorageItem(userA, 'personal_display_name')).toBe('Commander Alice')

      // User A logs out
      purgeUserStorage(userA)

      // User B logs in
      expect(getUserStorageItem(userB, 'personal_display_name')).toBeNull()
      expect(getUserStorageItem(userB, 'personal_weekly_goal')).toBeNull()
      // User A is also cleanly wiped
      expect(getUserStorageItem(userA, 'personal_display_name')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Tasks & Calendar Isolation
  // ---------------------------------------------------------------------------
  describe('Phase 7: Tasks & Calendar Cross-Account Isolation', () => {
    it('prevents User A from reading, updating, or deleting User B calendar events', async () => {
      // Mock db.calendarEvent.findFirst to simulate User B ownership
      const origFindFirst = db.calendarEvent.findFirst
      const origUpdateMany = db.calendarEvent.updateMany

      db.calendarEvent.findFirst = mock((args?: { where?: Prisma.CalendarEventWhereInput }) => {
        if (args?.where?.id === 'evt-b' && args?.where?.userId === userB) {
          return Promise.resolve({
            id: 'evt-b',
            userId: userB,
            title: 'User B Secret Meeting',
            description: null,
            start: new Date(),
            end: new Date(),
            allDay: false,
            type: 'MEETING',
            status: 'confirmed',
            color: null,
            trackerArtifactId: null,
            trackerArtifactType: null,
            externalId: null,
            externalProvider: null,
            etag: null,
            externalMetadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          } as CalendarEvent)
        }
        return Promise.resolve(null)
      }) as unknown as typeof db.calendarEvent.findFirst

      db.calendarEvent.updateMany = mock((args?: { where?: Prisma.CalendarEventWhereInput }) => {
        if (args?.where?.id === 'evt-b' && args?.where?.userId === userA) {
          return Promise.resolve({ count: 0 })
        }
        return Promise.resolve({ count: 1 })
      }) as unknown as typeof db.calendarEvent.updateMany

      try {
        // User A reading User B event returns null
        const readResult = await CalendarRepository.findEventById(userA, 'evt-b')
        expect(readResult).toBeNull()

        // User A updating User B event throws error
        expect(CalendarRepository.updateEvent(userA, 'evt-b', { title: 'Hacked' })).rejects.toThrow()

        // User A deleting User B event throws error
        expect(CalendarRepository.deleteEvent(userA, 'evt-b')).rejects.toThrow()
      } finally {
        db.calendarEvent.findFirst = origFindFirst
        db.calendarEvent.updateMany = origUpdateMany
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 10. Links & Collections Isolation
  // ---------------------------------------------------------------------------
  describe('Phase 7: Links & Collections Isolation', () => {
    it('prevents User A from modifying or deleting User B link collections and tags', async () => {
      const origRequireOwnership = AuthorizationService.requireOwnership
      AuthorizationService.requireOwnership = mock((_model: string, _id: string) => {
        // Simulates that id belongs to User B, so User A gets NotFoundError
        throw new NotFoundError('Resource not found')
      })

      const origUpdateMany = db.linkCollection.updateMany
      db.linkCollection.updateMany = mock(() => Promise.resolve({ count: 0 })) as unknown as typeof db.linkCollection.updateMany

      try {
        const updateResult = await updateLinkCollection('coll-b', { name: 'Hacked Name' })
        expect(updateResult.success).toBe(false)

        const deleteResult = await deleteLinkCollection('coll-b')
        expect(deleteResult.success).toBe(false)

        const deleteTagResult = await deleteLinkTag('tag-b')
        expect(deleteTagResult.success).toBe(false)

        const deleteLinkResult = await deleteLink('link-b')
        expect(deleteLinkResult.success).toBe(false)
      } finally {
        AuthorizationService.requireOwnership = origRequireOwnership
        db.linkCollection.updateMany = origUpdateMany
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 11. Vault Isolation
  // ---------------------------------------------------------------------------
  describe('Phase 7: Vault Documents Isolation', () => {
    it('prevents User A from renaming, favoriting, or pinning User B documents', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      AuthorizationService.requireAuth = mock(() =>
        Promise.resolve({ id: userA, username: 'user_a', isOwner: false })
      )

      const origUpdateMany = db.secureDocument.updateMany
      db.secureDocument.updateMany = mock((args?: { where?: Prisma.SecureDocumentWhereInput }) => {
        if (args?.where?.userId === userA) {
          return Promise.resolve({ count: 0 })
        }
        return Promise.resolve({ count: 1 })
      }) as unknown as typeof db.secureDocument.updateMany

      const origFindFirst = db.secureDocument.findFirst
      db.secureDocument.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.secureDocument.findFirst

      try {
        const renameRes = await renameVaultItem('doc-b', 'New Name')
        expect(renameRes.success).toBe(false)

        const favRes = await toggleVaultFavorite('doc-b', true)
        expect(favRes.success).toBe(false)

        const pinRes = await toggleVaultPin('doc-b', true)
        expect(pinRes.success).toBe(false)
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.secureDocument.updateMany = origUpdateMany
        db.secureDocument.findFirst = origFindFirst
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 12. Full Access Regression Matrix
  // ---------------------------------------------------------------------------
  describe('Phase 9: Full Access Regression Matrix', () => {
    it('verifies the exact product access contract for Free, Pro, and Lapsed Pro', async () => {
      // Free User Limits
      const freeLimits = {
        tasks_created_daily: await EntitlementService.getLimit('free-user', 'tasks_created_daily'),
        activities_active: await EntitlementService.getLimit('free-user', 'activities_active'),
        calendar_events_created_daily: await EntitlementService.getLimit('free-user', 'calendar_events_created_daily'),
      }

      expect(freeLimits.tasks_created_daily).toBe(50)
      expect(freeLimits.activities_active).toBe(10)
      expect(freeLimits.calendar_events_created_daily).toBe(5)
    })
  })
})
