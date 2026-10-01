import { describe, it, expect, beforeEach } from 'bun:test'
import { DatabaseRateLimiter } from '@/lib/services/RateLimiter'

describe('DatabaseRateLimiter Security Lifecycle & Fail-Closed Invariants (#Blocker-D)', () => {
  let store: Map<string, { count: number; resetAt: Date }>
  let shouldDbThrow: boolean

  const createMockDb = () => {
    return {
      $transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
        if (shouldDbThrow) {
          throw new Error('Database connection timeout or table RateLimit does not exist')
        }
        return await cb(fakeTx)
      },
      rateLimit: {
        deleteMany: async ({ where }: { where: { key: string } }) => {
          if (shouldDbThrow) {
            throw new Error('Database error on deleteMany')
          }
          store.delete(where.key)
          return { count: 1 }
        },
      },
    }
  }

  const fakeTx = {
    $executeRaw: async () => 1,
    rateLimit: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        const item = store.get(where.key)
        return item ? { key: where.key, count: item.count, resetAt: item.resetAt } : null
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { key: string }
        create: { key: string; count: number; resetAt: Date }
        update: { count: number; resetAt: Date }
      }) => {
        const existing = store.get(where.key)
        if (existing) {
          store.set(where.key, { count: update.count, resetAt: update.resetAt })
          return { key: where.key, count: update.count, resetAt: update.resetAt }
        }
        store.set(where.key, { count: create.count, resetAt: create.resetAt })
        return { key: where.key, count: create.count, resetAt: create.resetAt }
      },
      update: async ({
        where,
        data,
      }: {
        where: { key: string }
        data: { count: { increment: number } }
      }) => {
        const existing = store.get(where.key)
        if (!existing) throw new Error('Record not found')
        const newCount = existing.count + data.count.increment
        store.set(where.key, { count: newCount, resetAt: existing.resetAt })
        return { key: where.key, count: newCount, resetAt: existing.resetAt }
      },
    },
  }

  beforeEach(() => {
    store = new Map()
    shouldDbThrow = false
  })

  it('fails closed when database is unavailable on security-sensitive keys', async () => {
    shouldDbThrow = true
    const limiter = new DatabaseRateLimiter(createMockDb() as unknown as typeof import('@/lib/db').db)

    const res = await limiter.check('login:account:alice', 5, 60)

    expect(res.allowed).toBe(false)
    expect(res.remaining).toBe(0)
    expect(res.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('fails closed when rateLimit table is missing', async () => {
    shouldDbThrow = true
    const limiter = new DatabaseRateLimiter(createMockDb() as unknown as typeof import('@/lib/db').db)

    const res = await limiter.check('auth:verify:127.0.0.1', 10, 60, { failClosed: true })

    expect(res.allowed).toBe(false)
    expect(res.remaining).toBe(0)
  })

  it('allows inspect-only checks without incrementing attempt counter', async () => {
    const limiter = new DatabaseRateLimiter(createMockDb() as unknown as typeof import('@/lib/db').db)

    // Check with increment: false
    const check1 = await limiter.check('login:account:bob', 5, 60, { increment: false })
    expect(check1.allowed).toBe(true)
    expect(check1.remaining).toBe(5)
    expect(store.has('login:account:bob')).toBe(false)

    // Now record a real failure with increment: true
    const check2 = await limiter.check('login:account:bob', 5, 60, { increment: true })
    expect(check2.allowed).toBe(true)
    expect(check2.remaining).toBe(4)
    expect(store.get('login:account:bob')?.count).toBe(1)
  })

  it('enforces lockout when attempt count reaches limit', async () => {
    const limiter = new DatabaseRateLimiter(createMockDb() as unknown as typeof import('@/lib/db').db)

    for (let i = 1; i <= 5; i++) {
      const res = await limiter.check('login:account:carol', 5, 60)
      if (i < 5) {
        expect(res.allowed).toBe(true)
      } else {
        expect(res.allowed).toBe(true) // 5th attempt allowed
      }
    }

    // 6th attempt should be blocked
    const blocked = await limiter.check('login:account:carol', 5, 60)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('resets window when resetAt expires', async () => {
    const limiter = new DatabaseRateLimiter(createMockDb() as unknown as typeof import('@/lib/db').db)

    // Seed expired entry
    store.set('login:account:dave', {
      count: 5,
      resetAt: new Date(Date.now() - 5000), // 5 seconds in the past
    })

    const res = await limiter.check('login:account:dave', 5, 60)
    expect(res.allowed).toBe(true)
    expect(res.remaining).toBe(4)
    expect(store.get('login:account:dave')?.count).toBe(1)
  })

  it('clears rate limits properly upon reset call', async () => {
    const limiter = new DatabaseRateLimiter(createMockDb() as unknown as typeof import('@/lib/db').db)

    await limiter.check('login:account:eve', 5, 60)
    expect(store.has('login:account:eve')).toBe(true)

    await limiter.reset('login:account:eve')
    expect(store.has('login:account:eve')).toBe(false)
  })
})
