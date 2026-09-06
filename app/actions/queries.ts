"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { fetchRecurrenceLogs } from '@/lib/services/TimelineService'
import { RecurrenceType } from '@/types'
import { getTodayDateStr } from '@/lib/recurrence'

export async function fetchDashboardDataAction(dateParam?: string) {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const currentYear = new Date().getFullYear()
    const todayStr = dateParam || getTodayDateStr()

    // Parallelize independent root queries (eliminating request waterfall)
    const [
      templatesRaw,
      journalEntriesRaw,
      leaveRecordsRaw,
      leaveAllowancesRaw,
      weightRecordsRaw,
    ] = await Promise.all([
      db.activityTemplate.findMany({
        where: loggedUser.username === 'admin'
          ? { OR: [{ userId: loggedUser.id }, { userId: null }], deletedAt: null }
          : { userId: loggedUser.id, deletedAt: null },
        include: { tags: true },
        orderBy: { sortOrder: 'asc' },
      }),
      db.journalEntry.findMany({
        where: { userId: loggedUser.id, deletedAt: null },
        orderBy: { journalDate: 'desc' },
        take: 30,
      }),
      db.leaveRecord.findMany({
        where: {
          userId: loggedUser.id,
          deletedAt: null,
          startDate: {
            gte: new Date(`${currentYear}-01-01`),
            lte: new Date(`${currentYear}-12-31`),
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      db.leaveAllowance.findMany({
        where: { userId: loggedUser.id, year: currentYear },
        orderBy: { leaveType: 'asc' },
      }),
      db.weightRecord.findMany({
        where: {
          userId: loggedUser.id,
          deletedAt: null,
          date: { gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { date: 'asc' },
      }),
    ])

    const logsRaw = await fetchRecurrenceLogs(loggedUser.id, templatesRaw, loggedUser.username === 'admin')

    // Serialize Dates to strings or ISO format
    const templates = templatesRaw.map(t => ({
      ...t,
      recurrenceType: t.recurrenceType as RecurrenceType,
      targetDate: t.targetDate ? t.targetDate.toISOString().split('T')[0] : null,
      metadata: t.metadata,
    }))

    const logs = logsRaw.map(l => ({
      ...l,
      date: l.logDate ? l.logDate.toISOString().split('T')[0] : l.date,
      payload: l.payload,
    }))

    const journalEntries = journalEntriesRaw.map(e => ({
      ...e,
      journalDate: e.journalDate.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      deletedAt: e.deletedAt?.toISOString() ?? null,
    }))

    const leaveRecords = leaveRecordsRaw.map(r => ({
      ...r,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
    }))

    const weightRecords = weightRecordsRaw.map(r => ({
      ...r,
      date: r.date.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
    }))

    return {
      success: true,
      data: {
        templates,
        logs,
        journalEntries,
        leaveRecords,
        leaveAllowances: leaveAllowancesRaw,
        weightRecords,
        todayStr,
      }
    }
  } catch (error) {
    console.error('fetchDashboardDataAction failed:', error)
    return { success: false, error: 'Failed to fetch dashboard data' }
  }
}

export async function fetchCalendarDataAction() {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const templatesRaw = await db.activityTemplate.findMany({
      where: loggedUser.username === 'admin'
        ? { OR: [{ userId: loggedUser.id }, { userId: null }], deletedAt: null }
        : { userId: loggedUser.id, deletedAt: null },
      include: { tags: true },
      orderBy: { sortOrder: 'asc' },
    })

    const logsRaw = await fetchRecurrenceLogs(loggedUser.id, templatesRaw, loggedUser.username === 'admin')
    
    const journalRaw = await db.journalEntry.findMany({
      where: { userId: loggedUser.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
    })

    const templates = templatesRaw.map(t => ({
      ...t,
      recurrenceType: t.recurrenceType as RecurrenceType,
      targetDate: t.targetDate ? t.targetDate.toISOString().split('T')[0] : null,
      metadata: t.metadata,
    }))

    const logs = logsRaw.map(l => ({
      ...l,
      date: l.logDate ? l.logDate.toISOString().split('T')[0] : l.date,
      payload: l.payload,
    }))

    const notes = journalRaw.map(j => ({
      id: j.id,
      date: j.journalDate.toISOString().split('T')[0],
      title: null,
      content: j.content,
      userId: loggedUser.id,
      createdAt: j.journalDate.toISOString(),
      updatedAt: j.journalDate.toISOString(),
      deletedAt: null
    }))

    return {
      success: true,
      data: {
        templates,
        logs,
        notes,
      }
    }
  } catch (error) {
    console.error('fetchCalendarDataAction failed:', error)
    return { success: false, error: 'Failed to fetch calendar data' }
  }
}

/**
 * P2 Background Prefetch Action:
 * Preheats secondary domains (links, vault metadata, notes) in parallel using Promise.allSettled
 * so clicking navigation tabs (Link Library, Vault, Notes) is instantaneous.
 */
export async function prefetchSecondaryDataAction() {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const [collectionsSettled, vaultSettled, notesSettled] = await Promise.allSettled([
      // 1. Link collections & saved links
      db.linkCollection.findMany({
        where: { userId: loggedUser.id, deletedAt: null },
        include: {
          links: {
            where: { deletedAt: null },
            include: { tags: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      // 2. Vault document metadata
      db.secureDocument.findMany({
        where: { userId: loggedUser.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      // 3. Notes list
      db.note.findMany({
        where: { userId: loggedUser.id, deletedAt: null },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ])

    const collectionsRaw = collectionsSettled.status === 'fulfilled' ? collectionsSettled.value : []
    const vaultRaw = vaultSettled.status === 'fulfilled' ? vaultSettled.value : []
    const notesRaw = notesSettled.status === 'fulfilled' ? notesSettled.value : []

    const collections = collectionsRaw.map(c => ({
      id: c.id,
      name: c.name,
      description: null,
      icon: c.icon,
      color: c.color,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))

    const links = collectionsRaw.flatMap(c =>
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
      }))
    )

    const vaultItems = vaultRaw.map(v => ({
      id: v.id,
      name: v.searchName,
      isFolder: v.isFolder,
      parentId: v.parentId,
      size: v.fileSize,
      mimeGroup: v.mimeGroup,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }))

    const notes = notesRaw.map(n => ({
      id: n.id,
      date: n.date,
      title: n.title,
      content: n.content,
      userId: n.userId,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      deletedAt: null,
    }))

    return {
      success: true,
      data: {
        collections,
        links,
        vaultItems,
        notes,
      },
    }
  } catch (error) {
    console.error('prefetchSecondaryDataAction failed:', error)
    return { success: false, error: 'Failed to prefetch secondary data' }
  }
}

