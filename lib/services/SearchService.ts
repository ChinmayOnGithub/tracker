import { db } from '../db'

export class SearchService {
  /**
   * Search across templates, logs, and journal entries.
   */
  static async search(userId: string, queryStr: string) {
    const q = queryStr.trim().toLowerCase()
    if (!q) return { templates: [], logs: [], journal: [] }

    const { JournalService } = await import('@/modules/journal/server')

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
      JournalService.search(userId, q)
    ])

    return {
      templates,
      logs,
      journal
    }
  }
}
