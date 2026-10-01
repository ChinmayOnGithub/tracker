import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import {
  GET as workGetRoute,
  POST as workPostRoute,
  PATCH as workPatchRoute,
  DELETE as workDeleteRoute,
} from '@/app/api/mobile/v1/work/session/route'
import {
  GET as weightGetRoute,
  POST as weightPostRoute,
  DELETE as weightDeleteRoute,
} from '@/app/api/mobile/v1/weight/route'
import { User, WorkSession, WeightRecord } from '@prisma/client'

describe('Mobile API Work Session & Weight Tracking Suite', () => {
  const aliceId = 'user-alice-mobile'
  const aliceUser: User = {
    id: aliceId,
    username: 'alice',
    email: 'alice@example.com',
    googleId: null,
    passwordHash: 'scrypt:test',
    isSuspended: false,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let aliceToken: string

  beforeEach(() => {
    aliceToken = signSession(aliceId, 'alice', 1)

    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'alice' || args?.where?.id === aliceId) {
        return Promise.resolve(aliceUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  describe('1. Work Session Endpoints (/api/mobile/v1/work/session)', () => {
    it('GET rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost/api/mobile/v1/work/session')
      const res = await workGetRoute(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('UNAUTHENTICATED')
    })

    it('GET resolves activeSession and sessionForDate for authenticated user', async () => {
      const mockSession: WorkSession = {
        id: 'ws-123',
        userId: aliceId,
        date: '2026-10-02',
        mode: 'office',
        status: 'ACTIVE',
        startedAt: new Date(),
        endedAt: null,
        durationMinutes: 45,
        durationSeconds: 2700,
        loggingMode: 'timer',
        manualMinutes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.workSession.findFirst = mock(() => Promise.resolve(mockSession)) as unknown as typeof db.workSession.findFirst

      const req = new Request('http://localhost/api/mobile/v1/work/session?date=2026-10-02', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      })
      const res = await workGetRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.activeSession?.id).toBe('ws-123')
    })

    it('POST rejects invalid date format with VALIDATION_ERROR', async () => {
      const req = new Request('http://localhost/api/mobile/v1/work/session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start', date: 'invalid-date', mode: 'office' }),
      })
      const res = await workPostRoute(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })

    it('PATCH rejects request without session ID with VALIDATION_ERROR', async () => {
      const req = new Request('http://localhost/api/mobile/v1/work/session', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: '', action: 'pause' }),
      })
      const res = await workPatchRoute(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
    })

    it('DELETE rejects request without session ID query param with VALIDATION_ERROR', async () => {
      const req = new Request('http://localhost/api/mobile/v1/work/session', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` },
      })
      const res = await workDeleteRoute(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
    })
  })

  describe('2. Weight Tracking Endpoints (/api/mobile/v1/weight)', () => {
    it('GET rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost/api/mobile/v1/weight')
      const res = await weightGetRoute(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.success).toBe(false)
    })

    it('GET returns weight records for authenticated user', async () => {
      const mockRecord: WeightRecord = {
        id: 'weight-1',
        userId: aliceId,
        date: new Date('2026-10-02T12:00:00.000Z'),
        weight: 72.5,
        notes: 'Morning weight',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }

      db.weightRecord.findMany = mock(() => Promise.resolve([mockRecord])) as unknown as typeof db.weightRecord.findMany

      const req = new Request('http://localhost/api/mobile/v1/weight?days=30', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      })
      const res = await weightGetRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data.records).toHaveLength(1)
      expect(data.data.records[0].weight).toBe(72.5)
    })

    it('POST rejects weight values below minimum bound (20kg)', async () => {
      const req = new Request('http://localhost/api/mobile/v1/weight', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-10-02', weight: 10 }),
      })
      const res = await weightPostRoute(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })

    it('DELETE rejects request without ID parameter', async () => {
      const req = new Request('http://localhost/api/mobile/v1/weight', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${aliceToken}` },
      })
      const res = await weightDeleteRoute(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
    })
  })
})
