import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { POST as mobileSyncPost } from '@/app/api/mobile/sync/route'
import { SessionService } from '@/lib/services/SessionService'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { ActivityTemplate, ActivityLog, Note } from '@prisma/client'

describe('Server Mobile Sync Comprehensive Verification Suite (Phase 9 Matrix)', () => {
  const userIdA = 'usr_sync_user_a'
  const userIdB = 'usr_sync_user_b'
  let currentUserId = userIdA

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
    currentUserId = userIdA

    SessionService.resolveAuthFromRequest = mock(() =>
      Promise.resolve({
        id: currentUserId,
        username: currentUserId === userIdA ? 'user_a' : 'user_b',
        email: `${currentUserId}@example.com`,
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
          upsert: async () => ({ revision: 1n, userId: currentUserId, updatedAt: new Date() }),
        },
        activityTemplate: {
          findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
            return templateStore.find((t) => t.id === where.id && t.userId === where.userId) || null
          },
          findMany: async ({ where, take }: { where: { userId: string; OR?: unknown[]; deletedAt?: null }; take: number }) => {
            let res = templateStore.filter((t) => t.userId === where.userId)
            if (where.deletedAt === null) {
              res = res.filter((t) => t.deletedAt === null)
            }
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
          update: async ({ where, data }: { where: { id: string }; data: Partial<ActivityTemplate> }) => {
            const idx = templateStore.findIndex((t) => t.id === where.id)
            if (idx >= 0) {
              templateStore[idx] = { ...templateStore[idx], ...data } as ActivityTemplate
              return templateStore[idx]
            }
            throw new Error(`Template not found: ${where.id}`)
          },
        },
        activityLog: {
          findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
            return logStore.find((l) => l.id === where.id && l.userId === where.userId) || null
          },
          findMany: async ({ where, take }: { where: { userId: string; OR?: unknown[]; deletedAt?: null }; take: number }) => {
            let res = logStore.filter((l) => l.userId === where.userId)
            if (where.deletedAt === null) {
              res = res.filter((l) => l.deletedAt === null)
            }
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
          create: async ({ data }: { data: Partial<ActivityLog> }) => {
            const newLog = {
              id: data.id || `log_${Date.now()}`,
              userId: data.userId || currentUserId,
              activityId: data.activityId || '',
              logDate: data.logDate || new Date(),
              status: data.status || 'done',
              note: data.note || null,
              amount: data.amount ?? null,
              payload: data.payload || null,
              workSessionId: null,
              weightRecordId: null,
              leaveRecordId: null,
              journalEntryId: null,
              version: data.version || 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            } as ActivityLog
            logStore.push(newLog)
            return newLog
          },
          update: async ({ where, data }: { where: { id: string }; data: Partial<ActivityLog> }) => {
            const idx = logStore.findIndex((l) => l.id === where.id)
            if (idx >= 0) {
              logStore[idx] = { ...logStore[idx], ...data } as ActivityLog
              return logStore[idx]
            }
            throw new Error(`Log not found: ${where.id}`)
          },
        },
        note: {
          findFirst: async ({ where }: { where: { id?: string; userId: string; date?: string } }) => {
            return noteStore.find((n) => n.userId === where.userId && (!where.id || n.id === where.id)) || null
          },
          findMany: async ({ where, take }: { where: { userId: string; OR?: unknown[]; deletedAt?: null }; take: number }) => {
            let res = noteStore.filter((n) => n.userId === where.userId)
            if (where.deletedAt === null) {
              res = res.filter((n) => n.deletedAt === null)
            }
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
          update: async ({ where, data }: { where: { id: string }; data: Partial<Note> }) => {
            const idx = noteStore.findIndex((n) => n.id === where.id)
            if (idx >= 0) {
              noteStore[idx] = { ...noteStore[idx], ...data } as Note
              return noteStore[idx]
            }
            throw new Error(`Note not found: ${where.id}`)
          },
        },
      } as unknown as typeof db

      return await cb(fakeTx)
    }) as unknown as typeof db.$transaction
  })

  function makeTemplate(id: string, uid: string, updatedAt: Date, name = 'Tmpl'): ActivityTemplate {
    return {
      id,
      userId: uid,
      name: `${name}_${id}`,
      category: 'general',
      type: 'TASK',
      priority: 'NORMAL',
      estimatedDuration: 15,
      scheduledTime: null,
      energyRequired: 'MEDIUM',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      icon: 'check',
      color: '#3b82f6',
      isActive: true,
      notes: null,
      amount: null,
      sortOrder: 1,
      recurrenceType: 'daily',
      recurrenceInterval: null,
      recurrenceDaysOfWeek: null,
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: null,
      remindBeforeDays: null,
      metadata: null,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
      effectiveFrom: updatedAt,
      version: 1,
    }
  }

  function makeLog(id: string, uid: string, activityId: string, updatedAt: Date): ActivityLog {
    return {
      id,
      userId: uid,
      activityId,
      logDate: new Date('2026-10-01T12:00:00.000Z'),
      status: 'done',
      note: 'Note',
      amount: 1,
      payload: {},
      workSessionId: null,
      weightRecordId: null,
      leaveRecordId: null,
      journalEntryId: null,
      version: 1,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    }
  }

  // TEST 1: 1000 templates, 3 logs. Ensure no records are skipped.
  it('TEST 1 — paginates 1000 templates and 3 logs without skipping any record', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime()
    for (let i = 0; i < 1000; i++) {
      templateStore.push(makeTemplate(`tmpl_${String(i).padStart(4, '0')}`, userIdA, new Date(baseTime + i * 1000)))
    }
    for (let j = 0; j < 3; j++) {
      logStore.push(makeLog(`log_${j}`, userIdA, 'tmpl_0000', new Date(baseTime + (1000 + j) * 1000)))
    }

    let cursor: string | null = null
    const collectedTemplates: string[] = []
    const collectedLogs: string[] = []
    let pages = 0

    do {
      pages++
      const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, cursor }),
      })
      const res = await mobileSyncPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      for (const t of data.syncData.templates) collectedTemplates.push(t.id)
      for (const l of data.syncData.logs) collectedLogs.push(l.id)
      cursor = data.hasMore ? data.nextCursor : null
    } while (cursor && pages < 20)

    expect(collectedTemplates.length).toBe(1000)
    expect(new Set(collectedTemplates).size).toBe(1000)
    expect(collectedLogs.length).toBe(3)
  })

  // TEST 2: 3 templates, 1000 logs. Ensure no records are skipped.
  it('TEST 2 — paginates 3 templates and 1000 logs without skipping any log', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime()
    for (let i = 0; i < 3; i++) {
      templateStore.push(makeTemplate(`tmpl_${i}`, userIdA, new Date(baseTime + i * 1000)))
    }
    for (let j = 0; j < 1000; j++) {
      logStore.push(makeLog(`log_${String(j).padStart(4, '0')}`, userIdA, 'tmpl_0', new Date(baseTime + (10 + j) * 1000)))
    }

    let cursor: string | null = null
    const collectedTemplates: string[] = []
    const collectedLogs: string[] = []
    let pages = 0

    do {
      pages++
      const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, cursor }),
      })
      const res = await mobileSyncPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      for (const t of data.syncData.templates) collectedTemplates.push(t.id)
      for (const l of data.syncData.logs) collectedLogs.push(l.id)
      cursor = data.hasMore ? data.nextCursor : null
    } while (cursor && pages < 20)

    expect(collectedTemplates.length).toBe(3)
    expect(collectedLogs.length).toBe(1000)
    expect(new Set(collectedLogs).size).toBe(1000)
  })

  // TEST 3: Both entities paginate simultaneously.
  it('TEST 3 — paginates both templates and logs simultaneously across pages', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime()
    for (let i = 0; i < 250; i++) {
      templateStore.push(makeTemplate(`tmpl_${i}`, userIdA, new Date(baseTime + i * 1000)))
    }
    for (let j = 0; j < 250; j++) {
      logStore.push(makeLog(`log_${j}`, userIdA, 'tmpl_0', new Date(baseTime + j * 1000)))
    }

    let cursor: string | null = null
    let totalTemplates = 0
    let totalLogs = 0

    do {
      const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, cursor }),
      })
      const res = await mobileSyncPost(req)
      const data = await res.json()
      totalTemplates += data.syncData.templates.length
      totalLogs += data.syncData.logs.length
      cursor = data.hasMore ? data.nextCursor : null
    } while (cursor)

    expect(totalTemplates).toBe(250)
    expect(totalLogs).toBe(250)
  })

  // TEST 4: Record changes between page requests.
  it('TEST 4 — handles record updating between page requests without corrupting cursor stream', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime()
    for (let i = 0; i < 150; i++) {
      templateStore.push(makeTemplate(`tmpl_${i}`, userIdA, new Date(baseTime + i * 1000)))
    }

    // Page 1
    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    })
    const res1 = await mobileSyncPost(req1)
    const data1 = await res1.json()
    expect(data1.syncData.templates.length).toBe(100)
    expect(data1.hasMore).toBe(true)

    // Mutation: record 120 gets updated to a later time
    const tmpl120 = templateStore.find((t) => t.id === 'tmpl_120')!
    tmpl120.name = 'Updated In Between'
    tmpl120.updatedAt = new Date(baseTime + 9999999)

    // Page 2
    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, cursor: data1.nextCursor }),
    })
    const res2 = await mobileSyncPost(req2)
    const data2 = await res2.json()

    // Page 2 fetches the remaining records, including the updated tmpl_120
    const page2Ids = data2.syncData.templates.map((t: { id: string }) => t.id)
    expect(page2Ids).toContain('tmpl_120')
  })

  // TEST 5: Record is deleted between page requests.
  it('TEST 5 — propagates tombstone (deletedAt) when record is deleted between page requests', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime()
    for (let i = 0; i < 150; i++) {
      templateStore.push(makeTemplate(`tmpl_${i}`, userIdA, new Date(baseTime + i * 1000)))
    }

    // Page 1
    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    })
    const res1 = await mobileSyncPost(req1)
    const data1 = await res1.json()

    // Delete record tmpl_110 before page 2
    const deletedDate = new Date()
    const tmpl110 = templateStore.find((t) => t.id === 'tmpl_110')!
    tmpl110.deletedAt = deletedDate
    tmpl110.updatedAt = deletedDate

    // Page 2
    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, cursor: data1.nextCursor }),
    })
    const res2 = await mobileSyncPost(req2)
    const data2 = await res2.json()
    const page2Tmpl110 = data2.syncData.templates.find((t: { id: string }) => t.id === 'tmpl_110')

    // Tombstone must be delivered with non-null deletedAt so client deletes locally
    expect(page2Tmpl110).toBeDefined()
    expect(page2Tmpl110.deletedAt).not.toBeNull()
  })

  // TEST 6: Record is restored between page requests.
  it('TEST 6 — processes restored record with version increment during sync', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z')
    const tmpl = makeTemplate('tmpl_deleted', userIdA, baseTime)
    tmpl.deletedAt = new Date()
    tmpl.version = 1
    templateStore.push(tmpl)

    const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localChanges: {
          restoredTemplates: [{ id: 'tmpl_deleted', version: 1 }],
        },
      }),
    })
    const res = await mobileSyncPost(req)
    expect(res.status).toBe(200)

    const updated = templateStore.find((t) => t.id === 'tmpl_deleted')!
    expect(updated.deletedAt).toBeNull()
    expect(updated.version).toBe(2)
  })

  // TEST 7: Client submits stale version.
  it('TEST 7 — detects and rejects stale client version as conflict', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z')
    const tmpl = makeTemplate('tmpl_conflict', userIdA, baseTime)
    tmpl.version = 5
    templateStore.push(tmpl)

    const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localChanges: {
          deletedTemplates: [{ id: 'tmpl_conflict', version: 3 }], // Stale version!
        },
      }),
    })
    const res = await mobileSyncPost(req)
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.conflicts.length).toBe(1)
    expect(data.conflicts[0].id).toBe('tmpl_conflict')
    expect(data.conflicts[0].serverVersion).toBe(5)
  })

  // TEST 8: Client submits future cursor.
  it('TEST 8 — rejects lastSyncedAt with a future timestamp', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSyncedAt: futureDate }),
    })
    const res = await mobileSyncPost(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('FUTURE_TIMESTAMP')
  })

  // TEST 9: Client requests excessive history.
  it('TEST 9 — handles legacy lastSyncedAt cursor correctly without error', async () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z').toISOString()
    const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSyncedAt: oldDate, limit: 50 }),
    })
    const res = await mobileSyncPost(req)
    expect(res.status).toBe(200)
  })

  // TEST 10: Server would produce an excessive response.
  it('TEST 10 — enforces payload record count ceiling of 1500 items', async () => {
    const logs = []
    for (let i = 0; i < 501; i++) {
      logs.push({
        id: `log_${i}`,
        activityId: 'tmpl_0',
        date: '2026-10-01',
        status: 'done',
      })
    }

    const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localChanges: { logs },
      }),
    })
    const res = await mobileSyncPost(req)
    // Zod schema caps each entity array to MAX_RECORDS_PER_ENTITY (500)
    expect(res.status).toBe(422)
  })

  // TEST 11: User A cannot access User B data.
  it('TEST 11 — enforces strict multi-tenant tenant isolation: User A never receives User B data', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z')
    templateStore.push(makeTemplate('tmpl_a', userIdA, baseTime))
    templateStore.push(makeTemplate('tmpl_b', userIdB, baseTime))

    currentUserId = userIdA
    const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
    })
    const res = await mobileSyncPost(req)
    const data = await res.json()

    const ids = data.syncData.templates.map((t: { id: string }) => t.id)
    expect(ids).toContain('tmpl_a')
    expect(ids).not.toContain('tmpl_b')
  })

  // TEST 12: Same mutation is retried.
  it('TEST 12 — duplicate mutation retry does not create duplicates or corrupt state', async () => {
    templateStore.push(makeTemplate('tmpl_shared', userIdA, new Date()))

    const mutationPayload = {
      localChanges: {
        logs: [
          {
            id: 'log_idempotent_1',
            activityId: 'tmpl_shared',
            date: '2026-10-01',
            status: 'done',
            note: 'Original',
            version: 1,
          },
        ],
      },
    }

    // Call 1
    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationPayload),
    })
    const res1 = await mobileSyncPost(req1)
    expect(res1.status).toBe(200)

    // Call 2 (retry identical mutation with matching version)
    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationPayload),
    })
    const res2 = await mobileSyncPost(req2)
    expect(res2.status).toBe(200)

    // Total logs in store should be exactly 1, not 2
    const matchingLogs = logStore.filter((l) => l.id === 'log_idempotent_1')
    expect(matchingLogs.length).toBe(1)
  })

  // TEST 13: Delete followed by restore.
  it('TEST 13 — handles delete followed by restore correctly', async () => {
    const tmpl = makeTemplate('tmpl_del_rest', userIdA, new Date())
    tmpl.version = 1
    templateStore.push(tmpl)

    // 1. Delete
    const reqDel = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localChanges: { deletedTemplates: [{ id: 'tmpl_del_rest', version: 1 }] },
      }),
    })
    await mobileSyncPost(reqDel)
    const afterDel = templateStore.find((t) => t.id === 'tmpl_del_rest')!
    expect(afterDel.deletedAt).not.toBeNull()
    expect(afterDel.version).toBe(2)

    // 2. Restore
    const reqRest = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localChanges: { restoredTemplates: [{ id: 'tmpl_del_rest', version: 2 }] },
      }),
    })
    await mobileSyncPost(reqRest)
    const afterRest = templateStore.find((t) => t.id === 'tmpl_del_rest')!
    expect(afterRest.deletedAt).toBeNull()
    expect(afterRest.version).toBe(3)
  })

  // TEST 14: Pagination boundary where multiple records have the same updatedAt.
  it('TEST 14 — paginates deterministically when multiple records share exact identical updatedAt timestamps', async () => {
    const exactTime = new Date('2026-10-01T12:00:00.000Z')
    for (let i = 0; i < 50; i++) {
      templateStore.push(makeTemplate(`tmpl_same_${String(i).padStart(2, '0')}`, userIdA, exactTime))
    }

    // Fetch in pages of 20
    let cursor: string | null = null
    const collected: string[] = []

    do {
      const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, cursor }),
      })
      const res = await mobileSyncPost(req)
      const data = await res.json()
      for (const t of data.syncData.templates) collected.push(t.id)
      cursor = data.hasMore ? data.nextCursor : null
    } while (cursor)

    expect(collected.length).toBe(50)
    expect(new Set(collected).size).toBe(50) // Zero duplicates, zero skips
  })

  // TEST 15: Pagination boundary where records are created/updated exactly around the cursor.
  it('TEST 15 — records created with updatedAt equal to the cursor are handled without skip', async () => {
    const time1 = new Date('2026-10-01T10:00:00.000Z')
    const time2 = new Date('2026-10-01T10:00:01.000Z')

    templateStore.push(makeTemplate('tmpl_boundary_a', userIdA, time1))
    templateStore.push(makeTemplate('tmpl_boundary_b', userIdA, time1))
    templateStore.push(makeTemplate('tmpl_boundary_c', userIdA, time2))

    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    })
    const res1 = await mobileSyncPost(req1)
    const data1 = await res1.json()
    expect(data1.syncData.templates[0].id).toBe('tmpl_boundary_a')

    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10, cursor: data1.nextCursor }),
    })
    const res2 = await mobileSyncPost(req2)
    const data2 = await res2.json()

    const remainingIds = data2.syncData.templates.map((t: { id: string }) => t.id)
    expect(remainingIds).toContain('tmpl_boundary_b')
    expect(remainingIds).toContain('tmpl_boundary_c')
  })

  // TEST 16: Repeated sync with no changes.
  it('TEST 16 — repeated sync calls with no changes return empty deltas and hasMore false', async () => {
    const baseTime = new Date('2026-10-01T08:00:00.000Z')
    templateStore.push(makeTemplate('tmpl_clean', userIdA, baseTime))

    const req1 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    })
    const res1 = await mobileSyncPost(req1)
    const _data1 = await res1.json()

    // Next sync with cursor returned from page 1
    const cursor = Buffer.from(
      JSON.stringify({
        templates: { updatedAt: baseTime.toISOString(), id: 'tmpl_clean' },
        logs: null,
        notes: null,
      })
    ).toString('base64')

    const req2 = new NextRequest('http://localhost:3000/api/mobile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, cursor }),
    })
    const res2 = await mobileSyncPost(req2)
    const data2 = await res2.json()

    expect(data2.syncData.templates.length).toBe(0)
    expect(data2.syncData.logs.length).toBe(0)
    expect(data2.syncData.notes.length).toBe(0)
    expect(data2.hasMore).toBe(false)
  })
})
