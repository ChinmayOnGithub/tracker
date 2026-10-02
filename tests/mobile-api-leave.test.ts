import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { GET, POST, PATCH, DELETE } from '@/app/api/mobile/v1/leave/route'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { User, LeaveType, LeaveStatus } from '@prisma/client'

describe('Mobile API Leave Suite (/api/mobile/v1/leave)', () => {
  const testUserId = 'user-leave-test-789'
  const mockUser: User = {
    id: testUserId,
    username: 'admin',
    email: 'admin@example.com',
    googleId: null,
    passwordHash: 'scrypt:test',
    isSuspended: false,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let validToken: string
  const originalFindUnique = db.user.findUnique
  const originalLeaveAllowanceUpsert = db.leaveAllowance.upsert
  const originalLeaveAllowanceFindMany = db.leaveAllowance.findMany
  const originalLeaveRecordFindMany = db.leaveRecord.findMany

  beforeEach(() => {
    validToken = `Bearer ${signSession(testUserId, 'admin', 1)}`
    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'admin' || args?.where?.id === testUserId) {
        return Promise.resolve(mockUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  afterEach(() => {
    db.user.findUnique = originalFindUnique
    db.leaveAllowance.upsert = originalLeaveAllowanceUpsert
    db.leaveAllowance.findMany = originalLeaveAllowanceFindMany
    db.leaveRecord.findMany = originalLeaveRecordFindMany
  })

  it('GET rejects unauthenticated requests with 401', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/leave')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('UNAUTHENTICATED')
  })

  it('GET returns allowances and records for authenticated user', async () => {
    db.leaveAllowance.upsert = mock(() => Promise.resolve({} as never)) as unknown as typeof db.leaveAllowance.upsert
    db.leaveAllowance.findMany = mock(() =>
      Promise.resolve([
        {
          id: 'allow-1',
          userId: testUserId,
          year: 2026,
          leaveType: LeaveType.CASUAL,
          allowance: 12,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    ) as unknown as typeof db.leaveAllowance.findMany
    db.leaveRecord.findMany = mock(() =>
      Promise.resolve([
        {
          id: 'rec-1',
          userId: testUserId,
          leaveType: LeaveType.CASUAL,
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-02T00:00:00.000Z'),
          totalDays: 2,
          status: LeaveStatus.APPROVED,
          notes: 'Family trip',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    ) as unknown as typeof db.leaveRecord.findMany

    const req = new Request('http://localhost:3000/api/mobile/v1/leave?year=2026', {
      headers: { Authorization: validToken },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.year).toBe(2026)
    expect(json.data.allowances.length).toBe(1)
    expect(json.data.records.length).toBe(1)
    expect(json.data.records[0].leaveType).toBe('CASUAL')
    expect(json.data.records[0].startDate).toBe('2026-06-01')
  })

  it('POST rejects invalid JSON payload', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/leave', {
      method: 'POST',
      headers: {
        Authorization: validToken,
        'Content-Type': 'application/json',
      },
      body: 'invalid-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST rejects invalid date ordering (endDate before startDate)', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/leave', {
      method: 'POST',
      headers: {
        Authorization: validToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leaveType: 'CASUAL',
        startDate: '2026-08-10',
        endDate: '2026-08-08',
        totalDays: 2,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('DELETE requires id parameter', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/leave', {
      method: 'DELETE',
      headers: { Authorization: validToken },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('PATCH updates leave allowance', async () => {
    db.leaveAllowance.upsert = mock(() =>
      Promise.resolve({
        id: 'allow-1',
        userId: testUserId,
        year: 2026,
        leaveType: LeaveType.PTO,
        allowance: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ) as unknown as typeof db.leaveAllowance.upsert

    const req = new Request('http://localhost:3000/api/mobile/v1/leave', {
      method: 'PATCH',
      headers: {
        Authorization: validToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leaveType: 'PTO',
        year: 2026,
        allowance: 20,
      }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.allowance.allowance).toBe(20)
  })
})
