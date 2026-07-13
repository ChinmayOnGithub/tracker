import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const session = verifySession(token)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Session is invalid or expired' }, { status: 401 })
    }

    const userId = session.userId

    // Parse payload
    const body = await request.json()
    const { lastSyncedAt, localChanges } = body

    // 1. Process local logs sent by mobile app
    if (localChanges?.logs && Array.isArray(localChanges.logs)) {
      for (const log of localChanges.logs) {
        // Enforce ownership: Verify if this log is owned by another user before updating
        const existing = await db.activityLog.findUnique({ where: { id: log.id } })
        if (existing && existing.userId !== userId) {
          console.warn(`[MobileSync] Unauthorized activity log update attempt on ID: ${log.id} by user: ${userId}`)
          continue
        }

        // Standardize log dates to UTC noon
        const logDate = new Date(`${log.date}T12:00:00.000Z`)

        // Upsert log in Postgres
        await db.activityLog.upsert({
          where: { id: log.id },
          create: {
            id: log.id,
            activityId: log.activityId,
            logDate,
            status: log.status,
            note: log.note || null,
            amount: log.amount !== undefined ? log.amount : null,
            payload: log.payload || {},
            userId: userId,
          },
          update: {
            status: log.status,
            note: log.note || null,
            amount: log.amount !== undefined ? log.amount : null,
            payload: log.payload || {},
          }
        })
      }
    }

    // 2. Process local notes sent by mobile app
    if (localChanges?.notes && Array.isArray(localChanges.notes)) {
      for (const note of localChanges.notes) {
        // Enforce ownership
        const existing = await db.note.findUnique({ where: { id: note.id } })
        if (existing && existing.userId !== userId) {
          console.warn(`[MobileSync] Unauthorized note update attempt on ID: ${note.id} by user: ${userId}`)
          continue
        }

        await db.note.upsert({
          where: { id: note.id },
          create: {
            id: note.id,
            date: note.date,
            title: note.title || null,
            content: note.content,
            userId: userId,
          },
          update: {
            title: note.title || null,
            content: note.content,
          }
        })
      }
    }

    // 3. Process local templates sent by mobile app
    if (localChanges?.templates && Array.isArray(localChanges.templates)) {
      for (const t of localChanges.templates) {
        // Enforce ownership
        const existing = await db.activityTemplate.findUnique({ where: { id: t.id } })
        if (existing && existing.userId !== userId) {
          console.warn(`[MobileSync] Unauthorized template update attempt on ID: ${t.id} by user: ${userId}`)
          continue
        }

        await db.activityTemplate.upsert({
          where: { id: t.id },
          create: {
            id: t.id,
            name: t.name,
            category: t.category,
            icon: t.icon,
            color: t.color,
            isActive: t.isActive !== undefined ? t.isActive : true,
            notes: t.notes || null,
            amount: t.amount !== undefined ? t.amount : null,
            sortOrder: t.sortOrder !== undefined ? t.sortOrder : 0,
            recurrenceType: t.recurrenceType,
            recurrenceInterval: t.recurrenceInterval || null,
            recurrenceDaysOfWeek: t.recurrenceDaysOfWeek || null,
            recurrenceDayOfMonth: t.recurrenceDayOfMonth || null,
            recurrenceMonth: t.recurrenceMonth || null,
            targetDate: t.targetDate || null,
            remindBeforeDays: t.remindBeforeDays || null,
            userId: userId,
          },
          update: {
            name: t.name,
            category: t.category,
            icon: t.icon,
            color: t.color,
            isActive: t.isActive !== undefined ? t.isActive : true,
            notes: t.notes || null,
            amount: t.amount !== undefined ? t.amount : null,
            sortOrder: t.sortOrder !== undefined ? t.sortOrder : 0,
            recurrenceType: t.recurrenceType,
            recurrenceInterval: t.recurrenceInterval || null,
            recurrenceDaysOfWeek: t.recurrenceDaysOfWeek || null,
            recurrenceDayOfMonth: t.recurrenceDayOfMonth || null,
            recurrenceMonth: t.recurrenceMonth || null,
            targetDate: t.targetDate || null,
            remindBeforeDays: t.remindBeforeDays || null,
          }
        })
      }
    }

    // 4. Process deletions sent by mobile app
    if (localChanges?.deletedLogs && Array.isArray(localChanges.deletedLogs)) {
      await db.activityLog.updateMany({
        where: { id: { in: localChanges.deletedLogs }, userId },
        data: { deletedAt: new Date() }
      })
    }
    if (localChanges?.deletedNotes && Array.isArray(localChanges.deletedNotes)) {
      await db.note.updateMany({
        where: { id: { in: localChanges.deletedNotes }, userId },
        data: { deletedAt: new Date() }
      })
    }
    if (localChanges?.deletedTemplates && Array.isArray(localChanges.deletedTemplates)) {
      await db.activityTemplate.updateMany({
        where: { id: { in: localChanges.deletedTemplates }, userId },
        data: { deletedAt: new Date() }
      })
    }

    // Determine filter criteria (pull updates since last synced)
    let syncFilter = {}
    if (lastSyncedAt) {
      syncFilter = {
        updatedAt: {
          gt: new Date(lastSyncedAt)
        }
      }
    }

    // Fetch updated states from Postgres for this user
    const dbTemplates = await db.activityTemplate.findMany({
      where: {
        userId,
        ...syncFilter
      }
    })

    const dbLogs = await db.activityLog.findMany({
      where: {
        userId,
        ...syncFilter
      }
    })

    const dbNotes = await db.note.findMany({
      where: {
        userId,
        ...syncFilter
      }
    })

    const mappedLogs = dbLogs.map(log => ({
      ...log,
      date: log.logDate.toISOString().split('T')[0],
    }))

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      syncData: {
        templates: dbTemplates,
        logs: mappedLogs,
        notes: dbNotes,
      }
    })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Mobile sync API error:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: errMsg }, { status: 500 })
  }
}
