import { describe, it, expect, mock } from 'bun:test'
import { JournalService } from '@/modules/journal/server'
import { db } from '@/lib/db'

describe('Issue #73: Secure Cross-Account Journal Search', () => {
  const userA = 'user-alice-111'
  const userB = 'user-bob-222'

  const userAEntries = [
    {
      id: 'entry-a1',
      userId: userA,
      journalDate: new Date('2026-09-20T12:00:00.000Z'),
      content: 'UniqueAliceSecretContent',
      mood: 'excited',
      gratitude: 'AliceUniqueGratitude',
      reflections: 'AliceUniqueReflections',
      lessonsLearned: 'AliceUniqueLessons',
      tomorrowPlan: 'AliceUniqueTomorrow',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
    },
    {
      id: 'entry-a-deleted',
      userId: userA,
      journalDate: new Date('2026-09-19T12:00:00.000Z'),
      content: 'DeletedUniqueKeyword',
      mood: null,
      gratitude: null,
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
    },
  ]

  const userBEntries = [
    {
      id: 'entry-b1',
      userId: userB,
      journalDate: new Date('2026-09-20T12:00:00.000Z'),
      content: 'BobPersonalJournal',
      mood: 'focused',
      gratitude: 'BobGratitude',
      reflections: null,
      lessonsLearned: null,
      tomorrowPlan: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
    },
  ]

  const allEntries = [...userAEntries, ...userBEntries]

  it('searches strictly scoped by userId, excludes other users and deleted entries', async () => {
    const origFindMany = db.journalEntry.findMany
    db.journalEntry.findMany = mock((args: { where: { userId: string; deletedAt: null; OR?: Array<Record<string, { contains: string }>> } }) => {
      const { userId, deletedAt, OR } = args.where
      return Promise.resolve(
        allEntries.filter((e) => {
          if (e.userId !== userId) return false
          if (deletedAt === null && e.deletedAt !== null) return false
          if (!OR) return true

          return OR.some((clause) => {
            const key = Object.keys(clause)[0] as keyof typeof e
            const term = clause[key]?.contains?.toLowerCase()
            const val = String(e[key] || '').toLowerCase()
            return term ? val.includes(term) : false
          })
        })
      )
    }) as unknown as typeof db.journalEntry.findMany

    try {
      // 1. User A searches their unique content
      const resA = await JournalService.search(userA, 'UniqueAliceSecretContent')
      expect(resA.length).toBe(1)
      expect(resA[0].id).toBe('entry-a1')

      // 2. User B searches Alice's secret content -> gets NOTHING
      const resB = await JournalService.search(userB, 'UniqueAliceSecretContent')
      expect(resB.length).toBe(0)

      // 3. User A searches deleted keyword -> gets NOTHING (soft-deleted excluded)
      const resDeleted = await JournalService.search(userA, 'DeletedUniqueKeyword')
      expect(resDeleted.length).toBe(0)

      // 4. Works for each documented searchable field:
      // gratitude
      const resGratitude = await JournalService.search(userA, 'AliceUniqueGratitude')
      expect(resGratitude.length).toBe(1)

      // reflections
      const resReflections = await JournalService.search(userA, 'AliceUniqueReflections')
      expect(resReflections.length).toBe(1)

      // lessonsLearned
      const resLessons = await JournalService.search(userA, 'AliceUniqueLessons')
      expect(resLessons.length).toBe(1)

      // tomorrowPlan
      const resPlan = await JournalService.search(userA, 'AliceUniqueTomorrow')
      expect(resPlan.length).toBe(1)

      // mood
      const resMood = await JournalService.search(userA, 'excited')
      expect(resMood.length).toBe(1)
    } finally {
      db.journalEntry.findMany = origFindMany
    }
  })
})
