import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { GET, POST, PATCH, DELETE } from '@/app/api/mobile/v1/notes/route'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { User } from '@prisma/client'

describe('Mobile API Notes Suite (/api/mobile/v1/notes)', () => {
  const testUserId = 'user-notes-test-456'
  const mockUser: User = {
    id: testUserId,
    username: 'test_noter',
    email: 'notes@example.com',
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
    validToken = `Bearer ${signSession(testUserId, 'test_noter', 1)}`
    db.user.findUnique = mock((args?: { where?: { username?: string; id?: string } }) => {
      if (args?.where?.username === 'test_noter' || args?.where?.id === testUserId) {
        return Promise.resolve(mockUser)
      }
      return Promise.resolve(null)
    }) as unknown as typeof db.user.findUnique
  })

  afterEach(() => {
    db.user.findUnique = originalFindUnique
  })

  it('GET rejects unauthenticated requests with 401', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/notes')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('UNAUTHENTICATED')
  })

  it('GET returns list of notes for authenticated user', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/notes', {
      headers: { Authorization: validToken },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(Array.isArray(json.data.notes)).toBe(true)
  })

  it('POST rejects invalid JSON payload with VALIDATION_ERROR', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: validToken },
      body: 'invalid-json{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('PATCH rejects request without ID parameter', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: validToken },
      body: JSON.stringify({ content: 'new content' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('DELETE rejects request without ID parameter', async () => {
    const req = new Request('http://localhost:3000/api/mobile/v1/notes', {
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
