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

    const templatesRaw = await db.activityTemplate.findMany({
      where: loggedUser.username === 'admin'
        ? { OR: [{ userId: loggedUser.id }, { userId: null }], deletedAt: null }
        : { userId: loggedUser.id, deletedAt: null },
      include: { tags: true },
      orderBy: { sortOrder: 'asc' },
    })

    const logsRaw = await fetchRecurrenceLogs(loggedUser.id, templatesRaw, loggedUser.username === 'admin')
    
    const journalEntriesRaw = await db.journalEntry.findMany({
      where: { userId: loggedUser.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
      take: 20,
    })

    const leaveRecordsRaw = await db.leaveRecord.findMany({
      where: {
        userId: loggedUser.id,
        deletedAt: null,
        startDate: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      orderBy: { startDate: 'desc' },
    })

    const leaveAllowancesRaw = await db.leaveAllowance.findMany({
      where: { userId: loggedUser.id, year: currentYear },
      orderBy: { leaveType: 'asc' },
    })

    const weightRecordsRaw = await db.weightRecord.findMany({
      where: {
        userId: loggedUser.id,
        deletedAt: null,
        date: { gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'asc' },
    })

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
