import { db } from '@/lib/db'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimiter {
  check(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult>
}

export class DatabaseRateLimiter implements RateLimiter {
  constructor(private dbClient = db) {}

  async check(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const now = new Date()
    const windowMs = windowSeconds * 1000

    try {
      const record = await this.dbClient.rateLimit.findUnique({
        where: { key }
      })

      if (!record || record.resetAt <= now) {
        const resetAt = new Date(now.getTime() + windowMs)
        await this.dbClient.rateLimit.upsert({
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

      const updated = await this.dbClient.rateLimit.update({
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
    } catch (err) {
      // In isolated mock environments without rateLimit table, fallback to safe allow
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
 * Extracts a normalized, sanitized client IP address from a Request or Headers.
 */
export function getClientIp(input: Request | Headers): string {
  const headers = 'headers' in input ? input.headers : input

  // Cloudflare Connecting IP is set directly by Cloudflare edge
  const cfIp = headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  // Standard reverse proxy Real IP
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // X-Forwarded-For: client, proxy1, proxy2...
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]
    if (first) return first.trim()
  }

  return '127.0.0.1'
}
