"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { isOwnerUser, getEffectiveGuestPermissions, canAccessModule, TrackerModuleKey } from '@/lib/auth-guards'
import { MasterSearchEngine, SearchCategory, SearchResult, SearchableDataset } from '@/lib/search/MasterSearchEngine'
import { RecurrenceType } from '@/types'

/**
 * Server-side authoritative global search action.
 * Scopes data strictly to the authenticated user's records and effective module permissions.
 */
export async function searchGlobalAction(
  query: string,
  category: SearchCategory = 'all'
): Promise<{
  success: boolean
  results: SearchResult[]
  error?: string
}> {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return { success: false, results: [], error: 'Unauthorized' }
    }

    const trimmedQuery = query?.trim()
    if (!trimmedQuery) {
      return { success: true, results: [] }
    }

    const isOwner = isOwnerUser(user)
    const guestPerms = await getEffectiveGuestPermissions(user)
    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const entitlements = await EntitlementService.getEntitlements(user.id).catch(() => null)

    const dataset: SearchableDataset = {}

    const effectiveAllowedModules: Record<string, boolean> = {
      notes: canAccessModule(user, 'notes', guestPerms, entitlements),
      journal: canAccessModule(user, 'journal', guestPerms, entitlements),
      activities: canAccessModule(user, 'activities', guestPerms, entitlements),
      links: canAccessModule(user, 'links', guestPerms, entitlements),
      documents: canAccessModule(user, 'documents', guestPerms, entitlements),
      weight: canAccessModule(user, 'weight', guestPerms, entitlements),
      leave: canAccessModule(user, 'leave', guestPerms, entitlements),
      settings: true,
    }

    const shouldQuery = (mod: TrackerModuleKey, cat: SearchCategory) => {
      const isCatMatch = category === 'all' || category === cat
      const isModAllowed = effectiveAllowedModules[mod] === true
      return isCatMatch && isModAllowed
    }

    const queries: Promise<void>[] = []

    // 1. NOTES
    if (shouldQuery('notes', 'note')) {
      queries.push(
        db.note.findMany({
          where: { userId: user.id, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        }).then(notes => {
          dataset.notes = notes.map(n => ({
            id: n.id,
            date: n.date,
            title: n.title,
            content: n.content,
            userId: n.userId,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
            deletedAt: null,
          }))
        })
      )
    }

    // 2. JOURNAL
    if (shouldQuery('journal', 'journal')) {
      const { JournalService } = await import('@/modules/journal/server')
      queries.push(
        JournalService.search(user.id, trimmedQuery).then(entries => {
          dataset.journalEntries = entries.map(e => ({
            id: e.id,
            journalDate: e.journalDate.toISOString(),
            content: e.content,
            mood: e.mood,
            gratitude: e.gratitude,
            reflections: e.reflections,
            lessonsLearned: e.lessonsLearned,
            tomorrowPlan: e.tomorrowPlan,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            deletedAt: null,
            userId: e.userId,
          }))
        })
      )
    }

    // 3. ACTIVITIES / TASKS
    if (shouldQuery('activities', 'activity')) {
      queries.push(
        db.activityTemplate.findMany({
          where: isOwner
            ? { OR: [{ userId: user.id }, { userId: null }], deletedAt: null }
            : { userId: user.id, deletedAt: null },
          include: { tags: true },
          orderBy: { sortOrder: 'asc' },
          take: 200,
        }).then(templates => {
          dataset.templates = templates.map(t => ({
            ...t,
            recurrenceType: t.recurrenceType as RecurrenceType,
            targetDate: t.targetDate ? t.targetDate.toISOString().split('T')[0] : null,
            metadata: t.metadata,
          }))
        })
      )
    }

    // 4. LINKS
    if (shouldQuery('links', 'link')) {
      queries.push(
        db.linkCollection.findMany({
          where: { userId: user.id, deletedAt: null },
          include: {
            links: {
              where: { deletedAt: null },
              include: { tags: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        }).then(collections => {
          dataset.collections = collections.map(c => ({
            id: c.id,
            name: c.name,
            description: null,
            icon: c.icon,
            color: c.color,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
            deletedAt: null,
          }))
          dataset.links = collections.flatMap(c =>
            (c.links || []).map(l => ({
              id: l.id,
              title: l.title,
              url: l.url,
              description: l.notes,
              collectionId: l.collectionId,
              clicks: l.openCount,
              isStarred: l.isPinned,
              createdAt: l.createdAt.toISOString(),
              updatedAt: l.updatedAt.toISOString(),
              deletedAt: null,
              userId: user.id,
            }))
          )
        })
      )
    }

    // 5. VAULT / DOCUMENTS
    if (shouldQuery('documents', 'document')) {
      queries.push(
        db.secureDocument.findMany({
          where: { userId: user.id, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        }).then(docs => {
          dataset.vaultItems = docs.map(d => ({
            id: d.id,
            name: d.searchName,
            isFolder: d.isFolder,
            parentId: d.parentId,
            size: d.fileSize,
            mimeGroup: d.mimeGroup,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
            userId: d.userId,
          }))
        })
      )
    }

    // 6. WEIGHT
    if (shouldQuery('weight', 'weight')) {
      queries.push(
        db.weightRecord.findMany({
          where: { userId: user.id, deletedAt: null },
          orderBy: { date: 'desc' },
          take: 100,
        }).then(weights => {
          dataset.weightRecords = weights.map(w => ({
            id: w.id,
            userId: w.userId,
            weight: w.weight,
            date: w.date.toISOString(),
            notes: w.notes,
            createdAt: w.createdAt.toISOString(),
            updatedAt: w.updatedAt.toISOString(),
            deletedAt: null,
          }))
        })
      )
    }

    // 7. LEAVE
    if (shouldQuery('leave', 'leave')) {
      queries.push(
        db.leaveRecord.findMany({
          where: { userId: user.id, deletedAt: null },
          orderBy: { startDate: 'desc' },
          take: 100,
        }).then(leaves => {
          dataset.leaveRecords = leaves.map(l => ({
            id: l.id,
            userId: l.userId,
            leaveType: l.leaveType,
            startDate: l.startDate.toISOString(),
            endDate: l.endDate.toISOString(),
            totalDays: l.totalDays,
            status: l.status,
            notes: l.notes,
            createdAt: l.createdAt.toISOString(),
            updatedAt: l.updatedAt.toISOString(),
            deletedAt: null,
          }))
        })
      )
    }

    await Promise.all(queries)

    const results = MasterSearchEngine.search(trimmedQuery, dataset, category, {
      userId: user.id,
      isOwner,
      allowedModules: isOwner ? undefined : effectiveAllowedModules,
    })

    return { success: true, results }
  } catch (error) {
    console.error('[searchGlobalAction] Search execution failed:', error)
    return { success: false, results: [], error: 'Failed to execute search' }
  }
}
