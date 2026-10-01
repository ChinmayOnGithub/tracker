import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { GET, POST } from '@/app/api/mobile/v1/bin/route'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { User } from '@prisma/client'

describe('Mobile API Bin Suite (/api/mobile/v1/bin)', () => {
  const testUserId = 'user-bin-test-789'
  const mockUser: User = {
    id: testUserId,
    username: 'test_binner',
    email: 'bin@example.com',
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
    validToken = `Bearer ${signSession(testUserId, 'test_binner', 1)}`
    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'test_binner' || args?.where?.id === testUserId) {
        return Promise.resolve(mockUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  afterEach(() => {
    db.user.findUnique = originalFindUnique
  })

  it('GET rejects unauthenticated requests with 401', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/bin')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('UNAUTHENTICATED')
  })

  it('GET returns aggregate list of deleted items for user', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/bin', {
      headers: { Authorization: validToken },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(Array.isArray(json.data.items)).toBe(true)
  })

  it('POST rejects missing entityType or id', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/bin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: validToken },
      body: JSON.stringify({ action: 'restore' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST rejects invalid action', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/bin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: validToken },
      body: JSON.stringify({ entityType: 'note', id: '123', action: 'explode' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })
})
