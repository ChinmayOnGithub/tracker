import { env } from '@/lib/env'

/**
 * Resolves the canonical public origin for OAuth redirects and server callbacks.
 * Guarantees that Google Login and Google Calendar OAuth always resolve to the exact
 * same canonical host and protocol, preventing domain mismatch and redirect_uri_mismatch.
 *
 * Precedence:
 * 1. Production: Explicit configured canonical production origin (NEXT_PUBLIC_SITE_URL).
 * 2. Production: Trusted platform-forwarded origin (e.g. VERCEL_URL for preview deployments).
 * 3. Development/Test: Standard reverse-proxy headers from request (x-forwarded-host, x-forwarded-proto).
 * 4. Development/Test: Incoming request's parsed URL origin.
 * 5. Development/Test: Safe local default (http://localhost:3000).
 */
export function getCanonicalOrigin(request?: Request): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const rawConfigured = process.env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL

  // 1. Explicit configured canonical production origin (authoritative in production)
  if (rawConfigured && !rawConfigured.includes('localhost')) {
    try {
      const url = new URL(rawConfigured)
      // Vercel terminates TLS before the application; OAuth must always use public HTTPS
      if (url.protocol === 'http:' || isProduction) {
        url.protocol = 'https:'
      }
      return url.origin
    } catch {
      // Invalid URL string
    }
  }

  // 2. Trusted platform preview environment (e.g. Vercel deployment preview)
  if (isProduction && process.env.VERCEL_URL) {
    const cleanHost = process.env.VERCEL_URL.replace(/^https?:\/\//, '')
    return `https://${cleanHost}`
  }

  // 3. Evaluate request origin or forwarded headers (enforcing https in production)
  if (request) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto =
      request.headers.get('x-forwarded-proto') || (isProduction ? 'https' : 'http')

    if (forwardedHost) {
      const scheme = isProduction ? 'https' : forwardedProto
      return `${scheme}://${forwardedHost}`
    }

    try {
      const origin = new URL(request.url).origin
      if (origin && !origin.includes('0.0.0.0')) {
        if (isProduction && origin.startsWith('http://')) {
          return origin.replace('http://', 'https://')
        }
        return origin
      }
    } catch {
      // Fall through
    }
  }

  // 4. Fallback to configured dev URL or localhost default
  if (rawConfigured) {
    try {
      const url = new URL(rawConfigured)
      return url.origin
    } catch {
      // Fall through
    }
  }

  if (isProduction) {
    throw new Error('NEXT_PUBLIC_SITE_URL is required in production.')
  }

  return 'http://localhost:3000'
}
