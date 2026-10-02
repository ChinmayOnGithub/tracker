import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { db } from '@/lib/db'
import { signSession } from '@/lib/session'
import { GET as meRoute } from '@/app/api/mobile/v1/auth/me/route'
import { GET as billingRoute } from '@/app/api/mobile/v1/billing/route'
import { User } from '@prisma/client'

describe('Mobile Billing & Entitlements API', () => {
  const aliceId = 'user-alice-billing'
  const aliceUser: User = {
    id: aliceId,
    username: 'alice',
    email: 'alice@example.com',
    googleId: null,
    passwordHash: 'hash',
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

    db.subscription.findMany = mock(() => {
      return Promise.resolve([])
    }) as unknown as typeof db.subscription.findMany
  })

  it('rejects unauthenticated request with 401', async () => {
    const req = new Request('http://localhost/api/mobile/v1/billing')
    const res = await billingRoute(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('UNAUTHENTICATED')
  })

  it('returns valid entitlements envelope for authenticated user', async () => {
    const req = new Request('http://localhost/api/mobile/v1/billing', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    const res = await billingRoute(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.tier).toBe('FREE')
    expect(json.data.plan).toBe('FREE')
    expect(json.data.isPro).toBe(false)
    expect(json.data.limits).toBeDefined()
    expect(json.data.features).toBeDefined()
  })

  it('GET /api/mobile/v1/auth/me includes isPro and plan metadata', async () => {
    const req = new Request('http://localhost/api/mobile/v1/auth/me', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    const res = await meRoute(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.id).toBe(aliceId)
    expect(json.data.isPro).toBe(false)
    expect(json.data.plan).toBe('FREE')
  })
})
