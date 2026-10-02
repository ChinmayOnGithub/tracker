import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const [deletedJournals, deletedNotes, deletedTemplates, deletedWeights, deletedLeaves] = await Promise.all([
      db.journalEntry.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 50,
      }),
      db.note.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 50,
      }),
      db.activityTemplate.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 50,
      }),
      db.weightRecord.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 50,
      }),
      db.leaveRecord.findMany({
        where: { userId: user.id, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 50,
      }),
    ])

    const items = [
      ...deletedJournals.map((j) => ({
        id: j.id,
        entityType: 'journal' as const,
        title: `Journal: ${j.journalDate.toISOString().slice(0, 10)}`,
        preview: j.content ? j.content.slice(0, 120).replace(/<[^>]*>/g, '') : null,
        deletedAt: j.deletedAt?.toISOString() || new Date().toISOString(),
      })),
      ...deletedNotes.map((n) => ({
        id: n.id,
        entityType: 'note' as const,
        title: n.title || 'Untitled Note',
        preview: n.content ? n.content.slice(0, 120) : null,
        deletedAt: n.deletedAt?.toISOString() || new Date().toISOString(),
      })),
      ...deletedTemplates.map((t) => ({
        id: t.id,
        entityType: 'activity_template' as const,
        title: `Activity: ${t.name}`,
        preview: `${t.category} • ${t.recurrenceType}`,
        deletedAt: t.deletedAt?.toISOString() || new Date().toISOString(),
      })),
      ...deletedWeights.map((w) => ({
        id: w.id,
        entityType: 'weight' as const,
        title: `Weight Record: ${w.weight} kg`,
        preview: w.notes || `Logged on ${w.date.toISOString().slice(0, 10)}`,
        deletedAt: w.deletedAt?.toISOString() || new Date().toISOString(),
      })),
      ...deletedLeaves.map((l) => ({
        id: l.id,
        entityType: 'leave' as const,
        title: `Time Off: ${l.leaveType} (${l.totalDays}d)`,
        preview: `${l.startDate.toISOString().slice(0, 10)} to ${l.endDate.toISOString().slice(0, 10)}${l.notes ? ' • ' + l.notes : ''}`,
        deletedAt: l.deletedAt?.toISOString() || new Date().toISOString(),
      })),
    ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())

    return apiSuccess({ items })
  } catch (error) {
    console.error('[MobileBinGet] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve bin items', 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let body: { entityType?: string; id?: string; action?: string }
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const { entityType, id, action } = body

    if (!id || !entityType) {
      return apiError('VALIDATION_ERROR', 'Both entityType and id are required', 400)
    }

    if (action !== 'restore') {
      return apiError('VALIDATION_ERROR', 'Invalid action. Only "restore" is supported', 400)
    }

    let restoredCount = 0

    if (entityType === 'journal') {
      const res = await db.journalEntry.updateMany({
        where: { id, userId: user.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount = res.count
      if (restoredCount > 0) {
        await db.activityLog.updateMany({
          where: { journalEntryId: id, userId: user.id, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
      }
    } else if (entityType === 'note') {
      const res = await db.note.updateMany({
        where: { id, userId: user.id, deletedAt: { not: null } },
        data: { deletedAt: null, version: { increment: 1 } },
      })
      restoredCount = res.count
    } else if (entityType === 'activity_template') {
      const res = await db.activityTemplate.updateMany({
        where: { id, userId: user.id, deletedAt: { not: null } },
        data: { deletedAt: null, version: { increment: 1 } },
      })
      restoredCount = res.count
    } else if (entityType === 'weight') {
      const res = await db.weightRecord.updateMany({
        where: { id, userId: user.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount = res.count
      if (restoredCount > 0) {
        await db.activityLog.updateMany({
          where: { weightRecordId: id, userId: user.id, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
      }
    } else if (entityType === 'leave') {
      const res = await db.leaveRecord.updateMany({
        where: { id, userId: user.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      restoredCount = res.count
      if (restoredCount > 0) {
        await db.activityLog.updateMany({
          where: {
            userId: user.id,
            deletedAt: { not: null },
            OR: [
              { leaveRecordId: id },
              { payload: { path: ['leaveRecordId'], equals: id } },
            ],
          },
          data: { deletedAt: null },
        })
      }
    } else {
      return apiError('VALIDATION_ERROR', `Unsupported entity type: ${entityType}`, 400)
    }

    if (restoredCount === 0) {
      return apiError('NOT_FOUND', 'Item not found in Bin or already restored', 404)
    }

    return apiSuccess({ restored: true })
  } catch (error) {
    console.error('[MobileBinPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to restore bin item', 500)
  }
}
