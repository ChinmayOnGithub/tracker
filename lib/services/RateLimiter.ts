import { db } from '@/lib/db'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimitOptions {
  failClosed?: boolean
  increment?: boolean
}

export interface RateLimiter {
  check(
    key: string,
    limit: number,
    windowSeconds: number,
    options?: RateLimitOptions
  ): Promise<RateLimitResult>
}

function isSecuritySensitiveKey(key: string): boolean {
  return (
    key.startsWith('login:') ||
    key.startsWith('auth:') ||
    key.startsWith('admin:') ||
    key.startsWith('password-reset:') ||
    key.startsWith('reset:') ||
    key.startsWith('turnstile:')
  )
}

type RateLimitTx = {
  rateLimit: {
    findUnique(args: { where: { key: string } }): Promise<{ count: number; resetAt: Date } | null>
    upsert(args: { where: { key: string }; create: { key: string; count: number; resetAt: Date }; update: { count: number; resetAt: Date } }): Promise<unknown>
    update(args: { where: { key: string }; data: { count: { increment: number } } }): Promise<{ count: number; resetAt: Date }>
  }
}

export class DatabaseRateLimiter implements RateLimiter {
  constructor(private dbClient = db) {}

  async check(
    key: string,
    limit: number,
    windowSeconds: number,
    options?: RateLimitOptions
  ): Promise<RateLimitResult> {
    const now = new Date()
    const windowMs = windowSeconds * 1000
    const shouldFailClosed = options?.failClosed ?? isSecuritySensitiveKey(key)
    const shouldIncrement = options?.increment ?? true

    try {
      const executeInTx = typeof this.dbClient.$transaction === 'function'
        ? (cb: (tx: RateLimitTx) => Promise<RateLimitResult>) => (this.dbClient as unknown as { $transaction: (cb: (tx: RateLimitTx) => Promise<RateLimitResult>) => Promise<RateLimitResult> }).$transaction(cb)
        : (cb: (tx: RateLimitTx) => Promise<RateLimitResult>) => cb(this.dbClient as unknown as RateLimitTx)

      return await executeInTx(async (tx: RateLimitTx) => {
        // Concurrency safety: acquire PostgreSQL advisory lock on key if supported
        const rawClient = tx as unknown as { $executeRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }
        if (typeof rawClient.$executeRaw === 'function') {
          try {
            await rawClient.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rate-limit:' || ${key}))`
          } catch {
            // Non-fatal if advisory lock not supported in mock environment
          }
        }

        const record = await tx.rateLimit.findUnique({
          where: { key }
        })

        // 1. If checking only (no increment): inspect state without mutating counter
        if (!shouldIncrement) {
          if (!record || record.resetAt <= now) {
            return {
              allowed: true,
              remaining: limit,
              retryAfterSeconds: 0
            }
          }
          if (record.count >= limit) {
            const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt.getTime() - now.getTime()) / 1000))
            return {
              allowed: false,
              remaining: 0,
              retryAfterSeconds
            }
          }
          return {
            allowed: true,
            remaining: Math.max(0, limit - record.count),
            retryAfterSeconds: 0
          }
        }

        // 2. Incremental check: update or initialize window
        if (!record || record.resetAt <= now) {
          const resetAt = new Date(now.getTime() + windowMs)
          await tx.rateLimit.upsert({
            where: { key },
            create: {
              key,
              count: 1,
              resetAt,
            },
            update: {
              count: 1,
              resetAt,
            }
          })

          return {
            allowed: true,
            remaining: Math.max(0, limit - 1),
            retryAfterSeconds: 0
          }
        }

        if (record.count >= limit) {
          const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt.getTime() - now.getTime()) / 1000))
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds
          }
        }

        const updated = await tx.rateLimit.update({
          where: { key },
          data: {
            count: { increment: 1 }
          }
        })

        return {
          allowed: true,
          remaining: Math.max(0, limit - updated.count),
          retryAfterSeconds: 0
        }
      })
    } catch (err) {
      if (shouldFailClosed) {
        console.error('[RateLimiter] Database rate limit lookup failed (fail-closed):', err instanceof Error ? err.message : String(err))
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 60,
        }
      }

      // In isolated mock environments without rateLimit table, fallback to safe allow for non-security paths
      console.warn('[RateLimiter] Database rate limit lookup failed, falling back:', err)
      return {
        allowed: true,
        remaining: limit - 1,
        retryAfterSeconds: 0
      }
    }
  }

  /**
   * Resets rate limit for a specific key (e.g. after successful login).
   */
  async reset(key: string): Promise<void> {
    try {
      await this.dbClient.rateLimit.deleteMany({
        where: { key }
      })
    } catch {
      // Ignore cleanup error
    }
  }
}

export const rateLimiter = new DatabaseRateLimiter()

/**
 * Extracts a normalized, sanitized client IP address from a Request, Headers, or ReadonlyHeaders object.
 */
export function getClientIp(input?: unknown): string {
  if (!input) return '127.0.0.1'

  const getHeader = (name: string): string | null => {
    try {
      const target = input as Record<string, unknown>
      if (typeof (input as { get?: unknown }).get === 'function') {
        return (input as { get: (n: string) => string | null }).get(name)
      }
      if (target.headers && typeof (target.headers as { get?: unknown }).get === 'function') {
        return (target.headers as { get: (n: string) => string | null }).get(name)
      }
      if (target.headers && typeof target.headers === 'object') {
        const h = target.headers as Record<string, string>
        return h[name] || h[name.toLowerCase()] || null
      }
      if (typeof target === 'object') {
        return (target[name] as string) || (target[name.toLowerCase()] as string) || null
      }
    } catch {
      return null
    }
    return null
  }

  // Cloudflare Connecting IP is set directly by Cloudflare edge
  const cfIp = getHeader('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  // Standard reverse proxy Real IP
  const realIp = getHeader('x-real-ip')
  if (realIp) return realIp.trim()

  // X-Forwarded-For: client, proxy1, proxy2...
  const forwardedFor = getHeader('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]
    if (first) return first.trim()
  }

  return '127.0.0.1'
}
