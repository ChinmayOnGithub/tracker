import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { GET, POST, DELETE } from '@/app/api/mobile/v1/journal/route'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { User } from '@prisma/client'

describe('Mobile API Journal Suite (/api/mobile/v1/journal)', () => {
  const testUserId = 'user-journal-test-123'
  const mockUser: User = {
    id: testUserId,
    username: 'test_journaler',
    email: 'journal@example.com',
    googleId: null,
    passwordHash: 'scrypt:test',
    isSuspended: false,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let validToken: string
  const originalFindUnique = db.user.findUnique

  beforeEach(() => {
    validToken = `Bearer ${signSession(testUserId, 'test_journaler', 1)}`
    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'test_journaler' || args?.where?.id === testUserId) {
        return Promise.resolve(mockUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  afterEach(() => {
    db.user.findUnique = originalFindUnique
  })

  it('GET rejects unauthenticated requests with 401', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/journal')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('UNAUTHENTICATED')
  })

  it('GET rejects invalid date format with VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/journal?date=invalid-date', {
      headers: { Authorization: validToken },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('GET returns null entry if not found', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/journal?date=2026-10-02', {
      headers: { Authorization: validToken },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.entry).toBeNull()
  })

  it('POST rejects invalid date format with VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: validToken },
      body: JSON.stringify({ date: 'bad-date', content: 'hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('DELETE rejects request without ID parameter', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/journal', {
      method: 'DELETE',
      headers: { Authorization: validToken },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })
})
