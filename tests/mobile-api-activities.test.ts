import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { AuthService, hashPin } from '@/lib/services/AuthService'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { POST as loginRoute } from '@/app/api/mobile/v1/auth/login/route'
import { GET as meRoute } from '@/app/api/mobile/v1/auth/me/route'
import {
  GET as templatesGetRoute,
  POST as templatesPostRoute,
} from '@/app/api/mobile/v1/activities/templates/route'
import {
  GET as logsGetRoute,
  POST as logsPostRoute,
  arePayloadsEquivalent,
} from '@/app/api/mobile/v1/activities/logs/route'
import {
  PATCH as logPatchRoute,
  DELETE as logDeleteRoute,
} from '@/app/api/mobile/v1/activities/logs/[id]/route'
import { ActivityLog, ActivityTemplate, User, Prisma } from '@prisma/client'

describe('Mobile API Foundation & Activities Vertical Slice Suite', () => {
  const aliceId = 'user-alice-mobile'
  const bobId = 'user-bob-mobile'
  const alicePin = '1234'
  const aliceHash = hashPin(alicePin, 'alice')

  const aliceUser: User = {
    id: aliceId,
    username: 'alice',
    email: 'alice@example.com',
    googleId: null,
    passwordHash: aliceHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let aliceToken: string

  beforeEach(() => {
    aliceToken = signSession(aliceId, 'alice')

    // Mock db.user.findUnique
    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'alice' || args?.where?.id === aliceId) {
        return Promise.resolve(aliceUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  describe('1. Authentication Service & Endpoints', () => {
    it('AuthService.verifyCredentials verifies valid credentials and issues signed token', async () => {
      const result = await AuthService.verifyCredentials('alice', '1234')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.user.id).toBe(aliceId)
        expect(result.user.username).toBe('alice')
        expect(result.token).toBeDefined()
      }
    })

    it('AuthService.verifyCredentials rejects invalid PIN or nonexistent user', async () => {
      const wrongPin = await AuthService.verifyCredentials('alice', '9999')
      expect(wrongPin.success).toBe(false)

      const nonUser = await AuthService.verifyCredentials('charlie', '1234')
      expect(nonUser.success).toBe(false)
    })

    it('POST /api/mobile/v1/auth/login returns token and user payload', async () => {
      const req = new Request('http://localhost/api/mobile/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', pin: '1234' }),
      })

      const res = await loginRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.token).toBeDefined()
      expect(data.data.user.id).toBe(aliceId)
    })

    it('POST /api/mobile/v1/auth/login returns 401 for incorrect credentials', async () => {
      const req = new Request('http://localhost/api/mobile/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', pin: '0000' }),
      })

      const res = await loginRoute(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('UNAUTHENTICATED')
    })

    it('GET /api/mobile/v1/auth/me resolves profile from Bearer token', async () => {
      const req = new Request('http://localhost/api/mobile/v1/auth/me', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      })

      const res = await meRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.id).toBe(aliceId)
      expect(data.data.username).toBe('alice')
    })

    it('GET /api/mobile/v1/auth/me rejects request without Bearer token with 401', async () => {
      const req = new Request('http://localhost/api/mobile/v1/auth/me')
      const res = await meRoute(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('UNAUTHENTICATED')
    })
  })

  describe('2. Activity Templates Endpoints', () => {
    it('GET /api/mobile/v1/activities/templates returns user-scoped templates', async () => {
      const mockTemplate: ActivityTemplate = {
        id: 'tmpl-1',
        userId: aliceId,
        name: 'Running',
        category: 'fitness',
        type: 'WORKOUT',
        priority: 'NORMAL',
        estimatedDuration: 30,
        energyRequired: 'medium',
        calendarProvider: 'NONE',
        calendarEventId: null,
        notificationRules: null,
        icon: 'Activity',
        color: 'emerald',
        notes: null,
        amount: null,
        recurrenceType: 'daily',
        recurrenceInterval: null,
        recurrenceDaysOfWeek: null,
        recurrenceDayOfMonth: null,
        recurrenceMonth: null,
        targetDate: null,
        effectiveFrom: new Date(),
        remindBeforeDays: null,
        metadata: null,
        scheduledTime: null,
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityTemplate.findMany = mock(() =>
        Promise.resolve([mockTemplate])
      ) as unknown as typeof db.activityTemplate.findMany

      const req = new Request('http://localhost/api/mobile/v1/activities/templates', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      })

      const res = await templatesGetRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.templates.length).toBe(1)
      expect(data.data.templates[0].name).toBe('Running')
    })

    it('POST /api/mobile/v1/activities/templates validates input and rejects missing name', async () => {
      const req = new Request('http://localhost/api/mobile/v1/activities/templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category: 'fitness' }),
      })

      const res = await templatesPostRoute(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('3. Activity Logs Endpoints & Account Isolation', () => {
    it('GET /api/mobile/v1/activities/logs returns activity logs for date', async () => {
      const mockLog: ActivityLog = {
        id: 'log-alice-55',
        activityId: 'tmpl-1',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: 'Morning run',
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.findMany = mock(() =>
        Promise.resolve([mockLog])
      ) as unknown as typeof db.activityLog.findMany

      const req = new Request('http://localhost/api/mobile/v1/activities/logs?date=2026-09-17', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      })

      const res = await logsGetRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.logs.length).toBe(1)
      expect(data.data.logs[0].id).toBe('log-alice-55')
      expect(data.data.logs[0].date).toBe('2026-09-17')
    })

    it('POST /api/mobile/v1/activities/logs denies logging for another user template', async () => {
      db.activityTemplate.findUnique = mock(() =>
        Promise.resolve({
          id: 'tmpl-bob',
          userId: bobId, // Owned by Bob!
        } as ActivityTemplate)
      ) as unknown as typeof db.activityTemplate.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activityId: 'tmpl-bob',
          date: '2026-09-17',
          status: 'done',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('POST /api/mobile/v1/activities/logs successfully creates log for owned template', async () => {
      db.activityTemplate.findUnique = mock(() =>
        Promise.resolve({
          id: 'tmpl-alice',
          userId: aliceId,
        } as ActivityTemplate)
      ) as unknown as typeof db.activityTemplate.findUnique

      db.activityLog.findUnique = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findUnique
      db.activityLog.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findFirst

      const createdLog: ActivityLog = {
        id: 'log-101',
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: 'Completed workout',
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.create = mock(() => Promise.resolve(createdLog)) as unknown as typeof db.activityLog.create

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'done',
          note: 'Completed workout',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.log.id).toBe('log-101')
      expect(data.data.log.status).toBe('done')
    })

    it('PATCH /api/mobile/v1/activities/logs/:id enforces ownership before update', async () => {
      // Log owned by Bob
      db.activityLog.findUnique = mock(() =>
        Promise.resolve({
          id: 'log-bob-99',
          userId: bobId,
          status: 'done',
        } as ActivityLog)
      ) as unknown as typeof db.activityLog.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs/log-bob-99', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'skipped' }),
      })

      const res = await logPatchRoute(req, {
        params: Promise.resolve({ id: 'log-bob-99' }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('DELETE /api/mobile/v1/activities/logs/:id soft-deletes record with deletedAt', async () => {
      db.activityLog.findUnique = mock(() =>
        Promise.resolve({
          id: 'log-alice-101',
          userId: aliceId,
          weightRecordId: null,
          leaveRecordId: null,
          workSessionId: null,
        } as ActivityLog)
      ) as unknown as typeof db.activityLog.findUnique

      let updatedData: unknown = null
      db.activityLog.update = mock((args?: { data?: unknown }) => {
        updatedData = args?.data
        return Promise.resolve({ id: 'log-alice-101' } as ActivityLog)
      }) as unknown as typeof db.activityLog.update

      const req = new Request('http://localhost/api/mobile/v1/activities/logs/log-alice-101', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` },
      })

      const res = await logDeleteRoute(req, {
        params: Promise.resolve({ id: 'log-alice-101' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.deleted).toBe(true)
      expect((updatedData as { deletedAt: Date }).deletedAt).toBeDefined()
    })

    it('POST /api/mobile/v1/activities/logs: first POST with client ID creates log, repeated POST returns 200 OK without duplicate', async () => {
      db.activityTemplate.findUnique = mock(() =>
        Promise.resolve({
          id: 'tmpl-alice',
          userId: aliceId,
        } as ActivityTemplate)
      ) as unknown as typeof db.activityTemplate.findUnique

      const logStore: Record<string, ActivityLog> = {}

      db.activityLog.findUnique = mock((args?: { where?: { id?: string } }) => {
        const found = args?.where?.id ? logStore[args.where.id] || null : null
        return Promise.resolve(found)
      }) as unknown as typeof db.activityLog.findUnique

      db.activityLog.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findFirst

      let createCallCount = 0
      db.activityLog.create = mock((args?: { data?: { id?: string; activityId: string; logDate: Date; status: string; note?: string | null; amount?: number | null; payload?: unknown } }) => {
        createCallCount++
        const newLog: ActivityLog = {
          id: args?.data?.id || 'gen-id',
          activityId: args?.data?.activityId || 'tmpl-alice',
          userId: aliceId,
          logDate: args?.data?.logDate || new Date('2026-09-17T12:00:00.000Z'),
          status: args?.data?.status || 'done',
          note: args?.data?.note || null,
          amount: args?.data?.amount || null,
          payload: (args?.data?.payload ?? null) as import('@prisma/client').Prisma.JsonValue,
          weightRecordId: null,
          leaveRecordId: null,
          journalEntryId: null,
          workSessionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }
        logStore[newLog.id] = newLog
        return Promise.resolve(newLog)
      }) as unknown as typeof db.activityLog.create

      const clientLogId = 'client-uuid-1234'
      const postPayload = {
        id: clientLogId,
        activityId: 'tmpl-alice',
        date: '2026-09-17',
        status: 'done',
        note: 'Completed first session',
      }

      // First POST
      const req1 = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postPayload),
      })
      const res1 = await logsPostRoute(req1)
      expect(res1.status).toBe(201)
      const data1 = await res1.json()
      expect(data1.success).toBe(true)
      expect(data1.data.log.id).toBe(clientLogId)
      expect(createCallCount).toBe(1)

      // Repeated identical POST (retry scenario)
      const req2 = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postPayload),
      })
      const res2 = await logsPostRoute(req2)
      expect(res2.status).toBe(200) // Idempotent 200 return
      const data2 = await res2.json()
      expect(data2.success).toBe(true)
      expect(data2.data.log.id).toBe(clientLogId)
      expect(data2.data.log.note).toBe('Completed first session')
      // Ensure create was NOT called a second time
      expect(createCallCount).toBe(1)
    })

    it('POST /api/mobile/v1/activities/logs: same ID with materially different data returns 409 CONFLICT', async () => {
      const existingLog: ActivityLog = {
        id: 'client-uuid-fixed',
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: 'Original note',
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.findUnique = mock(() =>
        Promise.resolve(existingLog)
      ) as unknown as typeof db.activityLog.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'client-uuid-fixed',
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'skipped', // Different status!
          note: 'Conflicting note',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('CONFLICT')
      expect(data.error.message).toContain('different data')
    })

    it('POST /api/mobile/v1/activities/logs: client ID belonging to another user returns 403 FORBIDDEN', async () => {
      const bobLog: ActivityLog = {
        id: 'bob-log-id',
        activityId: 'tmpl-bob',
        userId: bobId, // Belongs to Bob!
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.findUnique = mock(() =>
        Promise.resolve(bobLog)
      ) as unknown as typeof db.activityLog.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'bob-log-id',
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'done',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('POST /api/mobile/v1/activities/logs: client ID of soft-deleted record returns 409 CONFLICT', async () => {
      const deletedLog: ActivityLog = {
        id: 'deleted-log-id',
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // Soft-deleted!
      }

      db.activityLog.findUnique = mock(() =>
        Promise.resolve(deletedLog)
      ) as unknown as typeof db.activityLog.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'deleted-log-id',
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'done',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('CONFLICT')
      expect(data.error.message).toContain('deleted')
    })

    it('DELETE /api/mobile/v1/activities/logs/:id: repeated DELETE on already soft-deleted log is safe and returns 200 OK', async () => {
      const alreadyDeletedLog: ActivityLog = {
        id: 'already-deleted-1',
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // Already deleted!
      }

      db.activityLog.findUnique = mock(() =>
        Promise.resolve(alreadyDeletedLog)
      ) as unknown as typeof db.activityLog.findUnique

      let updateCalled = false
      db.activityLog.update = mock(() => {
        updateCalled = true
        return Promise.resolve(alreadyDeletedLog)
      }) as unknown as typeof db.activityLog.update

      const req = new Request('http://localhost/api/mobile/v1/activities/logs/already-deleted-1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` },
      })

      const res = await logDeleteRoute(req, {
        params: Promise.resolve({ id: 'already-deleted-1' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.deleted).toBe(true)
      expect(data.data.id).toBe('already-deleted-1')
      // Does not re-run database update
      expect(updateCalled).toBe(false)
    })

    it('DELETE /api/mobile/v1/activities/logs/:id: cross-user DELETE is rejected with 403 FORBIDDEN', async () => {
      const bobLog: ActivityLog = {
        id: 'bob-log-delete',
        activityId: 'tmpl-bob',
        userId: bobId, // Bob's log
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.findUnique = mock(() =>
        Promise.resolve(bobLog)
      ) as unknown as typeof db.activityLog.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs/bob-log-delete', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` }, // Alice tries to delete Bob's log
      })

      const res = await logDeleteRoute(req, {
        params: Promise.resolve({ id: 'bob-log-delete' }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('PATCH /api/mobile/v1/activities/logs/:id: rejects modifying soft-deleted record with 403 FORBIDDEN', async () => {
      const softDeletedLog: ActivityLog = {
        id: 'soft-del-log',
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // Soft-deleted
      }

      db.activityLog.findUnique = mock(() =>
        Promise.resolve(softDeletedLog)
      ) as unknown as typeof db.activityLog.findUnique

      const req = new Request('http://localhost/api/mobile/v1/activities/logs/soft-del-log', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'done', note: 'Attempted resurrection' }),
      })

      const res = await logPatchRoute(req, {
        params: Promise.resolve({ id: 'soft-del-log' }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('POST concurrent race: P2002 followed by successful re-fetch and equivalent payload returns 200 OK', async () => {
      const concurrentLogId = 'concurrent-log-uuid-1'
      const existingRecord: ActivityLog = {
        id: concurrentLogId,
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: 'Concurrent test note',
        amount: 25,
        payload: { distance: 10, unit: 'km' },
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      // Step 1: Initial findUnique in route.ts returns null (Request B checked before Request A committed)
      // Step 2: Internal findUnique in ActivityService.logActivity returns null
      // Step 3: create throws P2002
      // Step 4: Re-fetch findUnique in route.ts catch block returns existingRecord
      db.activityLog.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findFirst
      let findCallCount = 0
      db.activityLog.findUnique = mock((args?: { where?: { id?: string } }) => {
        if (args?.where?.id === concurrentLogId) {
          findCallCount++
          if (findCallCount <= 2) {
            return Promise.resolve(null)
          }
          return Promise.resolve(existingRecord)
        }
        return Promise.resolve(null)
      }) as unknown as typeof db.activityLog.findUnique

      // Step 2: create throws P2002 unique constraint error (Request A created it first)
      db.activityLog.create = mock(() => {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`id`)',
          {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['id'] },
          }
        )
      }) as unknown as typeof db.activityLog.create

      // Request B sends equivalent payload (with different key order in payload to test both)
      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: concurrentLogId,
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'done',
          note: 'Concurrent test note',
          amount: 25,
          payload: { unit: 'km', distance: 10 }, // Key order reversed!
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.log.id).toBe(concurrentLogId)
      expect(data.data.log.status).toBe('done')
      expect(findCallCount).toBe(3) // Route check + ActivityService check + P2002 recovery re-fetch
    })

    it('POST concurrent race: P2002 followed by conflicting payload returns 409 CONFLICT', async () => {
      const concurrentLogId = 'concurrent-log-uuid-2'
      const existingRecord: ActivityLog = {
        id: concurrentLogId,
        activityId: 'tmpl-alice',
        userId: aliceId,
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: 'Original note',
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findFirst
      let findCallCount = 0
      db.activityLog.findUnique = mock((args?: { where?: { id?: string } }) => {
        if (args?.where?.id === concurrentLogId) {
          findCallCount++
          if (findCallCount <= 2) return Promise.resolve(null)
          return Promise.resolve(existingRecord)
        }
        return Promise.resolve(null)
      }) as unknown as typeof db.activityLog.findUnique

      db.activityLog.create = mock(() => {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`id`)',
          {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['id'] },
          }
        )
      }) as unknown as typeof db.activityLog.create

      // Request sends different status
      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: concurrentLogId,
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'skipped', // Conflict!
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('CONFLICT')
      expect(data.error.message).toContain('different data')
    })

    it('POST concurrent race: P2002 followed by foreign-user record returns 403 FORBIDDEN', async () => {
      const concurrentLogId = 'concurrent-log-uuid-3'
      const foreignRecord: ActivityLog = {
        id: concurrentLogId,
        activityId: 'tmpl-bob',
        userId: bobId, // Belongs to Bob!
        logDate: new Date('2026-09-17T12:00:00.000Z'),
        status: 'done',
        note: null,
        amount: null,
        payload: null,
        weightRecordId: null,
        leaveRecordId: null,
        journalEntryId: null,
        workSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.activityLog.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findFirst
      let findCallCount = 0
      db.activityLog.findUnique = mock((args?: { where?: { id?: string } }) => {
        if (args?.where?.id === concurrentLogId) {
          findCallCount++
          if (findCallCount <= 2) return Promise.resolve(null)
          return Promise.resolve(foreignRecord)
        }
        return Promise.resolve(null)
      }) as unknown as typeof db.activityLog.findUnique

      db.activityLog.create = mock(() => {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`id`)',
          {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['id'] },
          }
        )
      }) as unknown as typeof db.activityLog.create

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: concurrentLogId,
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'done',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('POST concurrent race: database error other than P2002 is not treated as idempotency and returns 500', async () => {
      const testId = 'unrelated-error-uuid'

      db.activityLog.findUnique = mock(() => Promise.resolve(null)) as unknown as typeof db.activityLog.findUnique

      db.activityLog.create = mock(() => {
        throw new Error('Database connection terminated unexpectedly')
      }) as unknown as typeof db.activityLog.create

      const req = new Request('http://localhost/api/mobile/v1/activities/logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: testId,
          activityId: 'tmpl-alice',
          date: '2026-09-17',
          status: 'done',
        }),
      })

      const res = await logsPostRoute(req)
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('INTERNAL_ERROR')
    })

    describe('Deep Payload Equality & Canonicalization', () => {
      it('arePayloadsEquivalent: treats objects with different key ordering as equivalent', () => {
        const objA = { distance: 10, unit: 'km', speed: 5.5 }
        const objB = { speed: 5.5, unit: 'km', distance: 10 }
        expect(arePayloadsEquivalent(objA, objB)).toBe(true)

        const nestedA = { workout: { sets: 3, reps: 10 }, notes: 'good' }
        const nestedB = { notes: 'good', workout: { reps: 10, sets: 3 } }
        expect(arePayloadsEquivalent(nestedA, nestedB)).toBe(true)
      })

      it('arePayloadsEquivalent: treats arrays with different order as non-equivalent', () => {
        expect(arePayloadsEquivalent([1, 2], [2, 1])).toBe(false)
        expect(arePayloadsEquivalent(['a', 'b'], ['b', 'a'])).toBe(false)
        expect(arePayloadsEquivalent({ tags: ['cardio', 'morning'] }, { tags: ['morning', 'cardio'] })).toBe(false)
        // Same order returns true
        expect(arePayloadsEquivalent({ tags: ['cardio', 'morning'] }, { tags: ['cardio', 'morning'] })).toBe(true)
      })

      it('arePayloadsEquivalent: handles null, undefined, and empty object normalization correctly', () => {
        expect(arePayloadsEquivalent(null, undefined)).toBe(true)
        expect(arePayloadsEquivalent({}, null)).toBe(true)
        expect(arePayloadsEquivalent(undefined, {})).toBe(true)
        expect(arePayloadsEquivalent({}, {})).toBe(true)
        expect(arePayloadsEquivalent([], [])).toBe(true)
        // Array vs empty object must NOT be equal
        expect(arePayloadsEquivalent([], {})).toBe(false)
        expect(arePayloadsEquivalent({ val: 1 }, {})).toBe(false)
      })
    })
  })
})
