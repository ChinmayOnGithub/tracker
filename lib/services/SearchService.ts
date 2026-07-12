import { db } from '../db'

export class SearchService {
  /**
   * Search across templates, logs, and journal entries.
   */
  static async search(userId: string, queryStr: string) {
    const q = queryStr.trim().toLowerCase()
    if (!q) return { templates: [], logs: [], journal: [] }

    const [templates, logs, journal] = await Promise.all([
      db.activityTemplate.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { notes: { contains: q, mode: 'insensitive' } }
          ]
        },
        take: 10
      }),
      db.activityLog.findMany({
        where: {
          userId,
          deletedAt: null,
          note: { contains: q, mode: 'insensitive' }
        },
        include: { activity: true },
        take: 10
      }),
      db.journalEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { content: { contains: q, mode: 'insensitive' } },
            { gratitude: { contains: q, mode: 'insensitive' } },
            { reflections: { contains: q, mode: 'insensitive' } },
            { lessonsLearned: { contains: q, mode: 'insensitive' } },
            { tomorrowPlan: { contains: q, mode: 'insensitive' } }
          ]
        },
        take: 10
      })
    ])

    return {
      templates,
      logs,
      journal
    }
  }
}
