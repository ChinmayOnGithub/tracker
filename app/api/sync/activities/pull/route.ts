/**
 * Activity Sync Pull Endpoint
 * Returns remote changes since last sync
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guards'
import { SyncOperation } from '@/lib/sync/types'
import { ActivitySyncAdapter } from '@/lib/sync/adapters/ActivitySyncAdapter'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const since = parseInt(searchParams.get('since') || '0')

    console.log(`[SyncAPI] Pulling changes for user ${user.id} since ${new Date(since).toISOString()}`)

    const operations: SyncOperation[] = []

    // Get activity logs modified since last sync
    const activityLogs = await db.activityLog.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        updatedAt: {
          gt: new Date(since)
        }
      },
      orderBy: {
        updatedAt: 'asc'
      }
    })

    // Convert activity logs to sync operations
    for (const log of activityLogs) {
      const syncData = ActivitySyncAdapter.activityLogToSync(
        {
          id: log.id,
          activityId: log.activityId,
          date: log.logDate.toISOString().split('T')[0], // Convert to YYYY-MM-DD
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
        id: `pull_${log.id}_${log.updatedAt.getTime()}`,
        type: 'update', // Pulled operations are typically updates
        entityType: 'activityLog',
        entityId: log.id,
        data: syncData,
        metadata: {
          id: log.id,
          entityType: 'activityLog',
          entityId: log.id,
          lastModified: log.updatedAt.getTime(),
          version: 1, // This would be stored in sync metadata table
          syncStatus: 'synced',
          retryCount: 0,
          createdAt: log.createdAt.getTime(),
          updatedAt: log.updatedAt.getTime()
        },
        createdAt: log.updatedAt.getTime(),
        priority: 'normal'
      })
    }

    // Get activity templates modified since last sync
    const activityTemplates = await db.activityTemplate.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        updatedAt: {
          gt: new Date(since)
        }
      },
      orderBy: {
        updatedAt: 'asc'
      }
    })

    // Convert activity templates to sync operations
    for (const template of activityTemplates) {
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
          tags: [], // Would need to fetch related tags
          createdAt: template.createdAt,
          updatedAt: template.updatedAt
        },
        user.id
      )

      operations.push({
        id: `pull_template_${template.id}_${template.updatedAt.getTime()}`,
        type: 'update',
        entityType: 'activityTemplate',
        entityId: template.id,
        data: syncData,
        metadata: {
          id: template.id,
          entityType: 'activityTemplate',
          entityId: template.id,
          lastModified: template.updatedAt.getTime(),
          version: 1,
          syncStatus: 'synced',
          retryCount: 0,
          createdAt: template.createdAt.getTime(),
          updatedAt: template.updatedAt.getTime()
        },
        createdAt: template.updatedAt.getTime(),
        priority: 'normal'
      })
    }

    console.log(`[SyncAPI] Returning ${operations.length} operations`)

    return NextResponse.json({ operations })
  } catch (error) {
    console.error('[SyncAPI] Pull failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}