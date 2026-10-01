import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SessionService } from '@/lib/services/SessionService'
import { rateLimiter } from '@/lib/services/RateLimiter'
import { z } from 'zod'

const MAX_SYNC_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_RECORDS_PER_ENTITY = 500
const MAX_TOTAL_RECORDS = 1500

const SyncLogSchema = z.object({
  id: z.string().min(1).max(128),
  activityId: z.string().min(1).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  status: z.string().max(50),
  note: z.string().max(2000).nullable().optional(),
  amount: z.number().nullable().optional(),
  payload: z.record(z.unknown()).optional(),
  version: z.number().int().nonnegative().optional()
})

const SyncNoteSchema = z.object({
  id: z.string().min(1).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  title: z.string().max(300).nullable().optional(),
  content: z.string().max(50000),
  version: z.number().int().nonnegative().optional()
})

const SyncTemplateSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  category: z.string().max(100),
  icon: z.string().max(100).default('default'),
  color: z.string().max(50).default('#3b82f6'),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  amount: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
  recurrenceType: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom', 'milestone', 'one_time']).default('daily'),
  recurrenceInterval: z.number().int().nullable().optional(),
  recurrenceDaysOfWeek: z.string().nullable().optional(),
  recurrenceDayOfMonth: z.number().int().nullable().optional(),
  recurrenceMonth: z.number().int().nullable().optional(),
  targetDate: z.string().nullable().optional(),
  remindBeforeDays: z.number().int().nullable().optional(),
  version: z.number().int().nonnegative().optional()
})

const SyncItemIdentifierSchema = z.union([
  z.string().max(128).transform(id => ({ id, version: undefined as number | undefined })),
  z.object({
    id: z.string().max(128),
    version: z.number().int().nonnegative().optional()
  })
])

const SyncRequestSchema = z.object({
  lastSyncedAt: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
  localChanges: z.object({
    logs: z.array(SyncLogSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    notes: z.array(SyncNoteSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    templates: z.array(SyncTemplateSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    deletedLogs: z.array(SyncItemIdentifierSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    deletedNotes: z.array(SyncItemIdentifierSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    deletedTemplates: z.array(SyncItemIdentifierSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    restoredNotes: z.array(SyncItemIdentifierSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    restoredTemplates: z.array(SyncItemIdentifierSchema).max(MAX_RECORDS_PER_ENTITY).default([]),
    restoredLogs: z.array(SyncItemIdentifierSchema).max(MAX_RECORDS_PER_ENTITY).default([])
  }).default({
    logs: [],
    notes: [],
    templates: [],
    deletedLogs: [],
    deletedNotes: [],
    deletedTemplates: [],
    restoredNotes: [],
    restoredTemplates: [],
    restoredLogs: []
  })
}).strict()

export async function POST(request: Request) {
  try {
    const user = await SessionService.resolveAuthFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const userId = user.id

    // ─── Rate Limiting ───────────────────────────────────────────────
    const rateCheck = await rateLimiter.check(`sync:mobile:${userId}`, 60, 60)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: `Rate limit exceeded. Retry in ${rateCheck.retryAfterSeconds}s` } },
        { status: 429 }
      )
    }

    // ─── Payload Size Enforcement ────────────────────────────────────
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_SYNC_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Sync payload is too large.'
          }
        },
        { status: 413 }
      )
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Malformed JSON payload' } },
        { status: 400 }
      )
    }

    // ─── Schema Validation ───────────────────────────────────────────
    const parseResult = SyncRequestSchema.safeParse(parsedJson)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid sync request structure',
            details: parseResult.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
          }
        },
        { status: 422 }
      )
    }

    const { lastSyncedAt, localChanges, limit } = parseResult.data

    if (lastSyncedAt) {
      const syncTime = new Date(lastSyncedAt).getTime()
      if (isNaN(syncTime)) {
        return NextResponse.json(
          { error: { code: 'INVALID_TIMESTAMP', message: 'Malformed lastSyncedAt timestamp' } },
          { status: 400 }
        )
      }
      if (syncTime > Date.now() + 5000) {
        return NextResponse.json(
          { error: { code: 'FUTURE_TIMESTAMP', message: 'lastSyncedAt cannot be in the future' } },
          { status: 400 }
        )
      }
    }

    const totalRecords = localChanges.logs.length + localChanges.notes.length + localChanges.templates.length
    if (totalRecords > MAX_TOTAL_RECORDS) {
      return NextResponse.json(
        {
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Total record count exceeds limit of ${MAX_TOTAL_RECORDS}.`
          }
        },
        { status: 413 }
      )
    }

    interface SyncConflict {
      entity: 'logs' | 'notes' | 'templates'
      id: string
      serverVersion: number
      serverRecord: Record<string, unknown>
    }

    const conflicts: SyncConflict[] = []

    // ─── Atomic Database Transaction ─────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // 1. Process local logs
      for (const log of localChanges.logs) {
        const existing = await tx.activityLog.findFirst({
          where: { id: log.id, userId }
        })

        if (existing) {
          // If deleted on server and not explicitly restored, ignore update
          if (existing.deletedAt && !localChanges.restoredLogs.some(r => r.id === log.id)) {
            continue
          }

          // Version conflict detection
          if (log.version !== undefined && log.version !== existing.version) {
            conflicts.push({
              entity: 'logs',
              id: existing.id,
              serverVersion: existing.version,
              serverRecord: {
                id: existing.id,
                status: existing.status,
                note: existing.note,
                version: existing.version
              }
            })
            continue
          }

          await tx.activityLog.update({
            where: { id: existing.id },
            data: {
              status: log.status,
              note: log.note || null,
              amount: log.amount !== undefined ? log.amount : null,
              payload: log.payload ? (log.payload as object) : undefined,
              version: existing.version + 1,
              updatedAt: new Date()
            }
          })
        } else {
          // Verify template ownership
          const template = await tx.activityTemplate.findFirst({
            where: { id: log.activityId, userId }
          })
          if (!template) {
            continue
          }

          const logDate = new Date(`${log.date}T12:00:00.000Z`)
          await tx.activityLog.create({
            data: {
              id: log.id,
              activityId: log.activityId,
              logDate,
              status: log.status,
              note: log.note || null,
              amount: log.amount !== undefined ? log.amount : null,
              payload: log.payload ? (log.payload as object) : undefined,
              userId,
              version: 1
            }
          })
        }
      }

      // 2. Process local notes
      for (const note of localChanges.notes) {
        const existing = await tx.note.findFirst({
          where: {
            userId,
            date: note.date
          }
        })

        if (existing) {
          // Normal UPDATE must never clear deletedAt. Only explicit restore can clear deletedAt.
          const isRestore = localChanges.restoredNotes.some(r => r.id === note.id)
          if (existing.deletedAt && !isRestore) {
            continue
          }

          if (note.version !== undefined && note.version !== existing.version) {
            conflicts.push({
              entity: 'notes',
              id: existing.id,
              serverVersion: existing.version,
              serverRecord: {
                id: existing.id,
                date: existing.date,
                title: existing.title,
                version: existing.version
              }
            })
            continue
          }

          await tx.note.update({
            where: { id: existing.id },
            data: {
              title: note.title || null,
              content: note.content,
              version: existing.version + 1,
              updatedAt: new Date(),
              ...(isRestore ? { deletedAt: null } : {})
            }
          })
        } else {
          await tx.note.create({
            data: {
              id: note.id,
              date: note.date,
              title: note.title || null,
              content: note.content,
              userId,
              version: 1
            }
          })
        }
      }

      // 3. Process local templates
      for (const t of localChanges.templates) {
        const existing = await tx.activityTemplate.findFirst({
          where: { id: t.id, userId }
        })

        if (existing) {
          const isRestore = localChanges.restoredTemplates.some(r => r.id === t.id)
          if (existing.deletedAt && !isRestore) {
            continue
          }

          if (t.version !== undefined && t.version !== existing.version) {
            conflicts.push({
              entity: 'templates',
              id: existing.id,
              serverVersion: existing.version,
              serverRecord: {
                id: existing.id,
                name: existing.name,
                version: existing.version
              }
            })
            continue
          }

          await tx.activityTemplate.update({
            where: { id: existing.id },
            data: {
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
              targetDate: t.targetDate ? new Date(t.targetDate) : null,
              remindBeforeDays: t.remindBeforeDays || null,
              version: existing.version + 1,
              updatedAt: new Date(),
              ...(isRestore ? { deletedAt: null } : {})
            }
          })
        } else {
          await tx.activityTemplate.create({
            data: {
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
              targetDate: t.targetDate ? new Date(t.targetDate) : null,
              remindBeforeDays: t.remindBeforeDays || null,
              userId,
              version: 1
            }
          })
        }
      }

      // 3.5. Process explicit restores
      for (const item of localChanges.restoredLogs) {
        const existing = await tx.activityLog.findFirst({
          where: { id: item.id, userId }
        })
        if (!existing || !existing.deletedAt) {
          continue
        }
        if (item.version !== undefined && existing.version !== item.version) {
          conflicts.push({
            entity: 'logs',
            id: existing.id,
            serverVersion: existing.version,
            serverRecord: {
              id: existing.id,
              status: existing.status,
              version: existing.version,
              deletedAt: existing.deletedAt
            }
          })
          continue
        }
        await tx.activityLog.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            version: existing.version + 1,
            updatedAt: new Date()
          }
        })
      }

      for (const item of localChanges.restoredNotes) {
        const existing = await tx.note.findFirst({
          where: { id: item.id, userId }
        })
        if (!existing || !existing.deletedAt) continue
        if (item.version !== undefined && existing.version !== item.version) {
          conflicts.push({
            entity: 'notes',
            id: existing.id,
            serverVersion: existing.version,
            serverRecord: { id: existing.id, version: existing.version, deletedAt: existing.deletedAt }
          })
          continue
        }
        await tx.note.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            version: existing.version + 1,
            updatedAt: new Date()
          }
        })
      }

      for (const item of localChanges.restoredTemplates) {
        const existing = await tx.activityTemplate.findFirst({
          where: { id: item.id, userId }
        })
        if (!existing || !existing.deletedAt) continue
        if (item.version !== undefined && existing.version !== item.version) {
          conflicts.push({
            entity: 'templates',
            id: existing.id,
            serverVersion: existing.version,
            serverRecord: { id: existing.id, version: existing.version, deletedAt: existing.deletedAt }
          })
          continue
        }
        await tx.activityTemplate.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            version: existing.version + 1,
            updatedAt: new Date()
          }
        })
      }

      // 4. Process deletions (Never hard delete, version check, increment version)
      for (const item of localChanges.deletedLogs) {
        const existing = await tx.activityLog.findFirst({
          where: { id: item.id, userId }
        })
        if (!existing || existing.deletedAt) {
          continue
        }
        if (item.version !== undefined && existing.version !== item.version) {
          conflicts.push({
            entity: 'logs',
            id: existing.id,
            serverVersion: existing.version,
            serverRecord: {
              id: existing.id,
              status: existing.status,
              version: existing.version
            }
          })
          continue
        }
        await tx.activityLog.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: existing.version + 1, updatedAt: new Date() }
        })
      }

      for (const item of localChanges.deletedNotes) {
        const existing = await tx.note.findFirst({
          where: { id: item.id, userId }
        })
        if (!existing || existing.deletedAt) {
          continue
        }
        if (item.version !== undefined && existing.version !== item.version) {
          conflicts.push({
            entity: 'notes',
            id: existing.id,
            serverVersion: existing.version,
            serverRecord: {
              id: existing.id,
              title: existing.title,
              version: existing.version
            }
          })
          continue
        }
        await tx.note.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: existing.version + 1, updatedAt: new Date() }
        })
      }

      for (const item of localChanges.deletedTemplates) {
        const existing = await tx.activityTemplate.findFirst({
          where: { id: item.id, userId }
        })
        if (!existing || existing.deletedAt) {
          continue
        }
        if (item.version !== undefined && existing.version !== item.version) {
          conflicts.push({
            entity: 'templates',
            id: existing.id,
            serverVersion: existing.version,
            serverRecord: {
              id: existing.id,
              name: existing.name,
              version: existing.version
            }
          })
          continue
        }
        await tx.activityTemplate.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), version: existing.version + 1, updatedAt: new Date() }
        })
      }

      // 5. Update user's monotonic sync cursor
      const syncCursor = await tx.syncCursor.upsert({
        where: { userId },
        create: { userId, revision: 1n },
        update: { revision: { increment: 1n } }
      })

      // 6. Fetch authoritative updates since lastSyncedAt (including soft-deleted tombstones)
      const pageLimit = limit || 100
      const syncFilter = lastSyncedAt
        ? { updatedAt: { gt: new Date(lastSyncedAt) } }
        : { deletedAt: null }

      const dbTemplates = await tx.activityTemplate.findMany({
        where: { userId, ...syncFilter },
        orderBy: { updatedAt: 'asc' },
        take: pageLimit + 1
      })
      const hasMoreTemplates = dbTemplates.length > pageLimit
      const pageTemplates = hasMoreTemplates ? dbTemplates.slice(0, pageLimit) : dbTemplates

      const dbLogs = await tx.activityLog.findMany({
        where: { userId, ...syncFilter },
        orderBy: { updatedAt: 'asc' },
        take: pageLimit + 1
      })
      const hasMoreLogs = dbLogs.length > pageLimit
      const pageLogs = hasMoreLogs ? dbLogs.slice(0, pageLimit) : dbLogs

      const dbNotes = await tx.note.findMany({
        where: { userId, ...syncFilter },
        orderBy: { updatedAt: 'asc' },
        take: pageLimit + 1
      })
      const hasMoreNotes = dbNotes.length > pageLimit
      const pageNotes = hasMoreNotes ? dbNotes.slice(0, pageLimit) : dbNotes

      const hasMore = hasMoreTemplates || hasMoreLogs || hasMoreNotes

      let nextCursor: string | null = null
      if (hasMore) {
        const allDates = [
          ...pageTemplates.map(t => t.updatedAt),
          ...pageLogs.map(l => l.updatedAt),
          ...pageNotes.map(n => n.updatedAt)
        ].filter(Boolean) as Date[]
        if (allDates.length > 0) {
          const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))
          nextCursor = maxDate.toISOString()
        }
      }

      return {
        cursor: syncCursor.revision.toString(),
        hasMore,
        nextCursor,
        templates: pageTemplates,
        logs: pageLogs.map(log => ({
          ...log,
          date: log.logDate.toISOString().split('T')[0]
        })),
        notes: pageNotes
      }
    })

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      cursor: result.cursor,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      conflicts,
      syncData: {
        templates: result.templates,
        logs: result.logs,
        notes: result.notes
      }
    })
  } catch (err) {
    console.error('[MobileSync] Sync failed:', err)
    return NextResponse.json(
      {
        error: {
          code: 'SYNC_ERROR',
          message: 'An error occurred during mobile synchronization.'
        }
      },
      { status: 500 }
    )
  }
}
