import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SessionService } from '@/lib/services/SessionService'
import { rateLimiter } from '@/lib/services/RateLimiter'
import { z } from 'zod'

const MAX_SYNC_BYTES = 2 * 1024 * 1024 // 2 MB inbound payload
const MAX_SYNC_RESPONSE_BYTES = 1.5 * 1024 * 1024 // 1.5 MB outbound response cap
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

// Composite cursor for deterministic pagination: supports independent per-entity cursors and legacy single cursor
const EntityCursorSchema = z.object({
  updatedAt: z.string(),
  id: z.string()
})

const MultiEntityCursorSchema = z.object({
  templates: EntityCursorSchema.nullable().optional(),
  logs: EntityCursorSchema.nullable().optional(),
  notes: EntityCursorSchema.nullable().optional(),
  updatedAt: z.string().optional(),
  id: z.string().optional()
})

const SyncRequestSchema = z.object({
  lastSyncedAt: z.string().nullable().optional(),
  cursor: z.string().nullable().optional(), // composite cursor (base64-encoded JSON)
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

      // 6. Parse multi-entity composite cursor for deterministic, lossless pagination
      const rawCursor = (parseResult.data as { cursor?: string | null }).cursor
      let templateCursor: { updatedAt: Date; id: string } | null = null
      let logCursor: { updatedAt: Date; id: string } | null = null
      let noteCursor: { updatedAt: Date; id: string } | null = null

      if (rawCursor) {
        try {
          const decoded = JSON.parse(Buffer.from(rawCursor, 'base64').toString('utf8'))
          const parsed = MultiEntityCursorSchema.safeParse(decoded)
          if (parsed.success) {
            if (parsed.data.templates) {
              templateCursor = { updatedAt: new Date(parsed.data.templates.updatedAt), id: parsed.data.templates.id }
            }
            if (parsed.data.logs) {
              logCursor = { updatedAt: new Date(parsed.data.logs.updatedAt), id: parsed.data.logs.id }
            }
            if (parsed.data.notes) {
              noteCursor = { updatedAt: new Date(parsed.data.notes.updatedAt), id: parsed.data.notes.id }
            }
            // Fallback for legacy single cursor format { updatedAt, id }
            if (!parsed.data.templates && !parsed.data.logs && !parsed.data.notes && parsed.data.updatedAt && parsed.data.id !== undefined) {
              const legacy = { updatedAt: new Date(parsed.data.updatedAt), id: parsed.data.id }
              templateCursor = legacy
              logCursor = legacy
              noteCursor = legacy
            }
          }
        } catch {
          // Invalid cursor — treat as first page
        }
      } else if (lastSyncedAt) {
        // Backwards-compat: treat lastSyncedAt as a cursor with empty id (will fetch all after that time)
        const legacy = { updatedAt: new Date(lastSyncedAt), id: '' }
        templateCursor = legacy
        logCursor = legacy
        noteCursor = legacy
      }

      const pageLimit = limit || 100

      // Build composite cursor filter: (updatedAt > cursor.updatedAt) OR (updatedAt = cursor.updatedAt AND id > cursor.id)
      const buildCursorFilter = (cursor: { updatedAt: Date; id: string } | null) => {
        if (!cursor) return {}
        return {
          OR: [
            { updatedAt: { gt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, id: { gt: cursor.id } }
          ]
        }
      }

      const templateFilter = templateCursor ? buildCursorFilter(templateCursor) : { deletedAt: null }
      const dbTemplates = await tx.activityTemplate.findMany({
        where: { userId, ...templateFilter },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: pageLimit + 1
      })
      const hasMoreTemplates = dbTemplates.length > pageLimit
      const pageTemplates = hasMoreTemplates ? dbTemplates.slice(0, pageLimit) : dbTemplates
      const nextTemplateCursor = hasMoreTemplates
        ? { updatedAt: pageTemplates[pageTemplates.length - 1].updatedAt.toISOString(), id: pageTemplates[pageTemplates.length - 1].id }
        : (templateCursor
            ? { updatedAt: templateCursor.updatedAt.toISOString(), id: templateCursor.id }
            : (pageTemplates.length > 0 ? { updatedAt: pageTemplates[pageTemplates.length - 1].updatedAt.toISOString(), id: pageTemplates[pageTemplates.length - 1].id } : null))

      const logFilter = logCursor ? buildCursorFilter(logCursor) : { deletedAt: null }
      const dbLogs = await tx.activityLog.findMany({
        where: { userId, ...logFilter },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: pageLimit + 1
      })
      const hasMoreLogs = dbLogs.length > pageLimit
      const pageLogs = hasMoreLogs ? dbLogs.slice(0, pageLimit) : dbLogs
      const nextLogCursor = hasMoreLogs
        ? { updatedAt: pageLogs[pageLogs.length - 1].updatedAt.toISOString(), id: pageLogs[pageLogs.length - 1].id }
        : (logCursor
            ? { updatedAt: logCursor.updatedAt.toISOString(), id: logCursor.id }
            : (pageLogs.length > 0 ? { updatedAt: pageLogs[pageLogs.length - 1].updatedAt.toISOString(), id: pageLogs[pageLogs.length - 1].id } : null))

      const noteFilter = noteCursor ? buildCursorFilter(noteCursor) : { deletedAt: null }
      const dbNotes = await tx.note.findMany({
        where: { userId, ...noteFilter },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: pageLimit + 1
      })
      const hasMoreNotes = dbNotes.length > pageLimit
      const pageNotes = hasMoreNotes ? dbNotes.slice(0, pageLimit) : dbNotes
      const nextNoteCursor = hasMoreNotes
        ? { updatedAt: pageNotes[pageNotes.length - 1].updatedAt.toISOString(), id: pageNotes[pageNotes.length - 1].id }
        : (noteCursor
            ? { updatedAt: noteCursor.updatedAt.toISOString(), id: noteCursor.id }
            : (pageNotes.length > 0 ? { updatedAt: pageNotes[pageNotes.length - 1].updatedAt.toISOString(), id: pageNotes[pageNotes.length - 1].id } : null))

      const hasMore = hasMoreTemplates || hasMoreLogs || hasMoreNotes

      let nextCursor: string | null = null
      if (hasMore) {
        nextCursor = Buffer.from(
          JSON.stringify({
            templates: nextTemplateCursor,
            logs: nextLogCursor,
            notes: nextNoteCursor
          })
        ).toString('base64')
      }

      const mappedLogs = pageLogs.map(log => ({ ...log, date: log.logDate.toISOString().split('T')[0] }))

      return {
        cursor: syncCursor.revision.toString(),
        hasMore,
        nextCursor,
        templates: pageTemplates,
        logs: mappedLogs,
        notes: pageNotes
      }
    })

    const responsePayload = {
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
    }

    // Byte-cap outbound response — if the serialized response is too large, return a truncated
    // result that asks the client to re-sync with a tighter cursor
    const serialized = JSON.stringify(responsePayload)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SYNC_RESPONSE_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: 'SYNC_RESPONSE_TOO_LARGE',
            message: 'Server response too large. Reduce limit or use a more recent cursor.'
          }
        },
        { status: 507 }
      )
    }

    return NextResponse.json(responsePayload)
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
