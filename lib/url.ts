import { env } from '@/lib/env'

/**
 * Resolves the canonical public origin for OAuth redirects and server callbacks.
 * Guarantees that Google Login and Google Calendar OAuth always resolve to the exact
 * same canonical host and protocol, preventing domain mismatch and redirect_uri_mismatch.
 *
 * Precedence:
 * 1. Production: Configured NEXT_PUBLIC_SITE_URL is authoritative to prevent host-header injection.
 * 2. Development/Test: Standard reverse-proxy headers from request (x-forwarded-host, x-forwarded-proto).
 * 3. Incoming request's parsed URL origin.
 * 4. Fallback default.
 */
export function getCanonicalOrigin(request?: Request): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const configured = process.env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL

  // 1. In production, configured NEXT_PUBLIC_SITE_URL is strictly authoritative when configured
  // to prevent host header injection or spoofed OAuth callback targets.
  if (isProduction && configured && !configured.includes('localhost')) {
    const url = new URL(configured)

    // Vercel terminates TLS before the application. A legacy production
    // NEXT_PUBLIC_SITE_URL may still be stored as http://, but OAuth must
    // always use the public HTTPS origin. Normalize it instead of crashing
    // the login route.
    if (url.protocol === 'http:') {
      url.protocol = 'https:'
    } else if (url.protocol !== 'https:') {
      throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS or HTTP in production.')
    }

    return url.origin
  }

  // 2. Evaluate request origin or forwarded headers (enforcing https in production)
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

  // 3. Fallback to configured URL in dev/test if available
  if (configured && !configured.includes('localhost')) {
    try {
      const url = new URL(configured)
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
