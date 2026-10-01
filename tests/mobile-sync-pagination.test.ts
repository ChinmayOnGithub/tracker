import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { POST as mobileSyncPost } from '@/app/api/mobile/sync/route'
import { SessionService } from '@/lib/services/SessionService'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { ActivityTemplate, ActivityLog, Note } from '@prisma/client'

describe('Mobile Sync Lossless Multi-Entity Pagination Suite (#Blocker-C)', () => {
  const userId = 'usr_sync_pag_test'

  let templateStore: ActivityTemplate[]
  let logStore: ActivityLog[]
  let noteStore: Note[]

  const origTransaction = db.$transaction
  const origResolveAuth = SessionService.resolveAuthFromRequest

  afterEach(() => {
    db.$transaction = origTransaction
    SessionService.resolveAuthFromRequest = origResolveAuth
  })

  beforeEach(() => {
    templateStore = []
    logStore = []
    noteStore = []

    SessionService.resolveAuthFromRequest = mock(() =>
      Promise.resolve({
        id: userId,
        username: 'sync_user',
        email: 'sync@example.com',
        isOwner: true,
        accessLevel: 'OWNER',
        isPro: true,
      })
    )

    db.$transaction = (async <T>(cb: (tx: typeof db) => Promise<T>): Promise<T> => {
      const fakeTx = {
        rateLimit: {
          findUnique: async () => null,
          upsert: async () => ({ count: 1, resetAt: new Date(Date.now() + 60000) }),
          create: async () => ({ count: 1, resetAt: new Date(Date.now() + 60000) }),
          update: async () => ({ count: 1, resetAt: new Date(Date.now() + 60000) }),
        },
        syncCursor: {
          upsert: async () => ({ revision: 1n, userId, updatedAt: new Date() }),
        },
        activityTemplate: {
          findMany: async ({ where, take }: { where: { userId: string; OR?: unknown[] }; take: number }) => {
            let res = templateStore.filter((t) => t.userId === where.userId)
            if (where.OR) {
              const orClauses = where.OR as Array<{ updatedAt?: { gt?: Date }; id?: { gt?: string } }>
              const gtClause = orClauses[0]?.updatedAt?.gt
              const eqClauseTime = (orClauses[1] as unknown as { updatedAt: Date })?.updatedAt
              const eqClauseId = orClauses[1]?.id?.gt

              if (gtClause && eqClauseTime && eqClauseId !== undefined) {
                res = res.filter(
                  (t) =>
                    t.updatedAt.getTime() > gtClause.getTime() ||
                    (t.updatedAt.getTime() === eqClauseTime.getTime() && t.id > eqClauseId)
                )
              }
            }
            res.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))
            return res.slice(0, take)
          },
        },
        activityLog: {
          findMany: async ({ where, take }: { where: { userId: string; OR?: unknown[] }; take: number }) => {
            let res = logStore.filter((l) => l.userId === where.userId)
            if (where.OR) {
              const orClauses = where.OR as Array<{ updatedAt?: { gt?: Date }; id?: { gt?: string } }>
              const gtClause = orClauses[0]?.updatedAt?.gt
              const eqClauseTime = (orClauses[1] as unknown as { updatedAt: Date })?.updatedAt
              const eqClauseId = orClauses[1]?.id?.gt

              if (gtClause && eqClauseTime && eqClauseId !== undefined) {
                res = res.filter(
                  (l) =>
                    l.updatedAt.getTime() > gtClause.getTime() ||
                    (l.updatedAt.getTime() === eqClauseTime.getTime() && l.id > eqClauseId)
                )
              }
            }
            res.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))
            return res.slice(0, take)
          },
        },
        note: {
          findMany: async ({ where, take }: { where: { userId: string; OR?: unknown[] }; take: number }) => {
            let res = noteStore.filter((n) => n.userId === where.userId)
            if (where.OR) {
              const orClauses = where.OR as Array<{ updatedAt?: { gt?: Date }; id?: { gt?: string } }>
              const gtClause = orClauses[0]?.updatedAt?.gt
              const eqClauseTime = (orClauses[1] as unknown as { updatedAt: Date })?.updatedAt
              const eqClauseId = orClauses[1]?.id?.gt

              if (gtClause && eqClauseTime && eqClauseId !== undefined) {
                res = res.filter(
                  (n) =>
                    n.updatedAt.getTime() > gtClause.getTime() ||
                    (n.updatedAt.getTime() === eqClauseTime.getTime() && n.id > eqClauseId)
                )
              }
            }
            res.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))
            return res.slice(0, take)
          },
        },
      } as unknown as typeof db

      return await cb(fakeTx)
    }) as unknown as typeof db.$transaction
  })

function createMockTemplate(overrides: Partial<ActivityTemplate> & { id: string; userId: string; name: string }): ActivityTemplate {
  return {
    id: overrides.id,
    userId: overrides.userId,
    name: overrides.name,
    category: overrides.category ?? 'general',
    type: overrides.type ?? 'PERSONAL',
    priority: overrides.priority ?? 'NORMAL',
    estimatedDuration: overrides.estimatedDuration ?? 0,
    scheduledTime: overrides.scheduledTime ?? null,
    energyRequired: overrides.energyRequired ?? 'MEDIUM',
    calendarProvider: overrides.calendarProvider ?? 'NONE',
    calendarEventId: overrides.calendarEventId ?? null,
    notificationRules: overrides.notificationRules ?? null,
    icon: overrides.icon ?? 'star',
    color: overrides.color ?? 'blue',
    isActive: overrides.isActive ?? true,
    notes: overrides.notes ?? null,
    amount: overrides.amount ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    recurrenceType: overrides.recurrenceType ?? 'daily',
    recurrenceInterval: overrides.recurrenceInterval ?? null,
    recurrenceDaysOfWeek: overrides.recurrenceDaysOfWeek ?? null,
    recurrenceDayOfMonth: overrides.recurrenceDayOfMonth ?? null,
    recurrenceMonth: overrides.recurrenceMonth ?? null,
    targetDate: overrides.targetDate ?? null,
    remindBeforeDays: overrides.remindBeforeDays ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    deletedAt: overrides.deletedAt ?? null,
    effectiveFrom: overrides.effectiveFrom ?? new Date(),
    version: overrides.version ?? 1,
  }
}

  it('paginates 101 templates + 1 log + 1 note without skipping templates on second page', async () => {
    // 101 templates around 10:00 AM
    const baseTime = new Date('2026-10-01T10:00:00.000Z').getTime()
    for (let i = 0; i < 101; i++) {
      templateStore.push(createMockTemplate({
        id: `tmpl_${String(i).padStart(3, '0')}`,
        userId,
        name: `Template ${i}`,
        sortOrder: i,
        createdAt: new Date(baseTime + i * 1000),
        updatedAt: new Date(baseTime + i * 1000),
      }))
    }

    // 1 newer log at 11:00 AM (newer than all templates)
    const logTime = new Date('2026-10-01T11:00:00.000Z')
    logStore.push({
      id: 'log_solo_1',
      userId,
      activityId: 'tmpl_000',
      logDate: new Date('2026-10-01T12:00:00.000Z'),
      status: 'done',
      amount: 1,
      note: 'Log at 11am',
      payload: {},
      workSessionId: null,
      weightRecordId: null,
      leaveRecordId: null,
      journalEntryId: null,
      version: 1,
      createdAt: logTime,
      updatedAt: logTime,
      deletedAt: null,
    })

    // 1 note at 10:30 AM
    const noteTime = new Date('2026-10-01T10:30:00.000Z')
    noteStore.push({
      id: 'note_solo_1',
      userId,
      title: 'Note 1',
      content: 'Important',
      date: '2026-10-01',
      version: 1,
      createdAt: noteTime,
      updatedAt: noteTime,
      deletedAt: null,
    })

    // Fetch Page 1 with limit=100
    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    })
    const res1 = await mobileSyncPost(req1)
    expect(res1.status).toBe(200)
    const json1 = await res1.json()

    expect(json1.syncData.templates.length).toBe(100)
    expect(json1.syncData.logs.length).toBe(1)
    expect(json1.syncData.notes.length).toBe(1)
    expect(json1.hasMore).toBe(true)
    expect(json1.nextCursor).toBeDefined()

    // Fetch Page 2 using nextCursor
    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, cursor: json1.nextCursor }),
    })
    const res2 = await mobileSyncPost(req2)
    expect(res2.status).toBe(200)
    const json2 = await res2.json()

    // CRITICAL INVARIANT: The 101st template MUST NOT be skipped despite the log having an 11:00 timestamp!
    expect(json2.syncData.templates.length).toBe(1)
    expect(json2.syncData.templates[0].id).toBe('tmpl_100')
    // No duplicate logs or notes on page 2
    expect(json2.syncData.logs.length).toBe(0)
    expect(json2.syncData.notes.length).toBe(0)
    expect(json2.hasMore).toBe(false)
  })

  it('paginates 1 template + 101 logs + 1 note without skipping logs on second page', async () => {
    // 1 template at 09:00 AM
    const tmplTime = new Date('2026-10-01T09:00:00.000Z')
    templateStore.push(createMockTemplate({
      id: 'tmpl_solo',
      userId,
      name: 'Template Solo',
      sortOrder: 1,
      createdAt: tmplTime,
      updatedAt: tmplTime,
    }))

    // 101 logs at 10:00 AM
    const baseTime = new Date('2026-10-01T10:00:00.000Z').getTime()
    for (let i = 0; i < 101; i++) {
      logStore.push({
        id: `log_${String(i).padStart(3, '0')}`,
        userId,
        activityId: 'tmpl_solo',
        logDate: new Date('2026-10-01T12:00:00.000Z'),
        status: 'done',
        amount: 1,
        note: `Log ${i}`,
        payload: {},
        workSessionId: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        version: 1,
        createdAt: new Date(baseTime + i * 1000),
        updatedAt: new Date(baseTime + i * 1000),
        deletedAt: null,
      })
    }

    // Page 1
    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    })
    const res1 = await mobileSyncPost(req1)
    const json1 = await res1.json()

    expect(json1.syncData.templates.length).toBe(1)
    expect(json1.syncData.logs.length).toBe(100)
    expect(json1.hasMore).toBe(true)

    // Page 2
    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, cursor: json1.nextCursor }),
    })
    const res2 = await mobileSyncPost(req2)
    const json2 = await res2.json()

    expect(json2.syncData.templates.length).toBe(0)
    expect(json2.syncData.logs.length).toBe(1)
    expect(json2.syncData.logs[0].id).toBe('log_100')
    expect(json2.hasMore).toBe(false)
  })

  it('retrying the same cursor produces identical deterministic results', async () => {
    const tmplTime = new Date('2026-10-01T09:00:00.000Z')
    templateStore.push(createMockTemplate({
      id: 'tmpl_idempotent',
      userId,
      name: 'Deterministic',
      sortOrder: 1,
      createdAt: tmplTime,
      updatedAt: tmplTime,
    }))

    const reqA = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
    })
    const resA = await mobileSyncPost(reqA)
    const jsonA = await resA.json()

    const reqB = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
    })
    const resB = await mobileSyncPost(reqB)
    const jsonB = await resB.json()

    expect(jsonA.syncData.templates).toEqual(jsonB.syncData.templates)
    expect(jsonA.nextCursor).toEqual(jsonB.nextCursor)
  })
})
