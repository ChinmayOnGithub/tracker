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

  // 1. In production, configured NEXT_PUBLIC_SITE_URL is the authoritative source
  // to prevent host header injection or spoofed OAuth callback targets.
  if (isProduction && configured && !configured.includes('localhost')) {
    try {
      const url = new URL(configured)
      url.protocol = 'https:'
      return url.origin
    } catch {
      // Fall through if misconfigured
    }
  }

  // 2. In development or test, evaluate request origin or forwarded headers
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
  if (configured) {
    try {
      const url = new URL(configured)
      return url.origin
    } catch {
      // Fall through
    }
  }

  return isProduction ? 'https://tracker.vercel.app' : 'http://localhost:3000'
}
