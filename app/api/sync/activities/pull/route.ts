/**
 * Activity Sync Pull Endpoint
 * Returns remote changes since last sync, including deletion tombstones
 * to eliminate offline resurrection bugs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guards'
import { SyncOperation } from '@/lib/sync/types'
import { ActivitySyncAdapter } from '@/lib/sync/adapters/ActivitySyncAdapter'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const sinceParam = searchParams.get('since')
    const since = parseInt(sinceParam || '0')

    const now = Date.now()
    // Cursor validation: if since is invalid, negative, or from the future (> 1 minute ahead), require full resync
    if (sinceParam !== null && (isNaN(since) || since < 0 || since > now + 60_000)) {
      return NextResponse.json(
        {
          error: {
            code: 'SYNC_RESYNC_REQUIRED',
            message: 'A full synchronization is required due to invalid or future sync timestamp.'
          }
        },
        { status: 409 }
      )
    }

    const cursorParam = searchParams.get('cursor')
    if (cursorParam !== null) {
      const clientCursor = parseInt(cursorParam, 10)
      if (isNaN(clientCursor) || clientCursor < 0) {
        return NextResponse.json(
          {
            error: {
              code: 'SYNC_RESYNC_REQUIRED',
              message: 'A full synchronization is required.'
            }
          },
          { status: 409 }
        )
      }
      const syncCursor = await db.syncCursor.findUnique({
        where: { userId: user.id }
      })
      const serverRevision = syncCursor ? Number(syncCursor.revision) : 0
      if (clientCursor > serverRevision) {
        return NextResponse.json(
          {
            error: {
              code: 'SYNC_RESYNC_REQUIRED',
              message: 'A full synchronization is required.'
            }
          },
          { status: 409 }
        )
      }
    }

    const isIncrementalSync = since > 0

    console.log(`[SyncAPI] Pulling changes for user ${user.id} since ${new Date(since).toISOString()}`)

    const operations: SyncOperation[] = []

    const MAX_SYNC_BATCH = 200

    // ─── Activity Logs ────────────────────────────────────────────────
    // In incremental sync, we include soft-deleted records so clients delete their local copies
    const activityLogs = await db.activityLog.findMany({
      where: {
        userId: user.id,
        ...(isIncrementalSync
          ? { updatedAt: { gt: new Date(since) } }
          : { deletedAt: null }),
      },
      orderBy: {
        updatedAt: 'asc'
      },
      take: MAX_SYNC_BATCH,
    })

    for (const log of activityLogs) {
      const isDeleted = log.deletedAt !== null
      const syncData = ActivitySyncAdapter.activityLogToSync(
        {
          id: log.id,
          activityId: log.activityId,
          date: log.logDate.toISOString().split('T')[0],
          logDate: log.logDate,
          note: log.note,
          status: log.status,
          amount: log.amount,
          payload: log.payload,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt
        },
        user.id
      )

      operations.push({
        id: `pull_${isDeleted ? 'del_' : ''}${log.id}_${log.updatedAt.getTime()}`,
        type: isDeleted ? 'delete' : 'update',
        entityType: 'activityLog',
        entityId: log.id,
        data: syncData,
        metadata: {
          id: log.id,
          entityType: 'activityLog',
          entityId: log.id,
          lastModified: log.updatedAt.getTime(),
          version: log.version ?? 1,
          syncStatus: 'synced',
          retryCount: 0,
          createdAt: log.createdAt.getTime(),
          updatedAt: log.updatedAt.getTime()
        },
        createdAt: log.updatedAt.getTime(),
        priority: 'normal'
      })
    }

    // ─── Activity Templates ───────────────────────────────────────────
    const activityTemplates = await db.activityTemplate.findMany({
      where: {
        userId: user.id,
        ...(isIncrementalSync
          ? { updatedAt: { gt: new Date(since) } }
          : { deletedAt: null }),
      },
      orderBy: {
        updatedAt: 'asc'
      },
      take: MAX_SYNC_BATCH,
    })

    for (const template of activityTemplates) {
      const isDeleted = template.deletedAt !== null
      const syncData = ActivitySyncAdapter.activityTemplateToSync(
        {
          id: template.id,
          name: template.name,
          category: template.category,
          type: template.type,
          priority: template.priority,
          estimatedDuration: template.estimatedDuration,
          energyRequired: template.energyRequired,
          calendarProvider: template.calendarProvider,
          calendarEventId: template.calendarEventId,
          notificationRules: template.notificationRules,
          icon: template.icon,
          color: template.color,
          isActive: template.isActive,
          notes: template.notes,
          amount: template.amount,
          sortOrder: template.sortOrder,
          recurrenceType: template.recurrenceType,
          recurrenceInterval: template.recurrenceInterval,
          recurrenceDaysOfWeek: template.recurrenceDaysOfWeek,
          recurrenceDayOfMonth: template.recurrenceDayOfMonth,
          recurrenceMonth: template.recurrenceMonth,
          targetDate: template.targetDate ? template.targetDate.toISOString().split('T')[0] : null,
          remindBeforeDays: template.remindBeforeDays,
          metadata: template.metadata,
          tags: [],
          createdAt: template.createdAt,
          updatedAt: template.updatedAt
        },
        user.id
      )

      operations.push({
        id: `pull_template_${isDeleted ? 'del_' : ''}${template.id}_${template.updatedAt.getTime()}`,
        type: isDeleted ? 'delete' : 'update',
        entityType: 'activityTemplate',
        entityId: template.id,
        data: syncData,
        metadata: {
          id: template.id,
          entityType: 'activityTemplate',
          entityId: template.id,
          lastModified: template.updatedAt.getTime(),
          version: template.version ?? 1,
          syncStatus: 'synced',
          retryCount: 0,
          createdAt: template.createdAt.getTime(),
          updatedAt: template.updatedAt.getTime()
        },
        createdAt: template.updatedAt.getTime(),
        priority: 'normal'
      })
    }

    const syncCursor = await db.syncCursor.findUnique({
      where: { userId: user.id }
    })

    console.log(`[SyncAPI] Returning ${operations.length} operations`)

    return NextResponse.json({
      operations,
      cursor: (syncCursor?.revision ?? 0n).toString()
    })
  } catch (error) {
    console.error('[SyncAPI] Pull failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}