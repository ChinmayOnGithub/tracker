import { env } from '@/lib/env'

/**
 * Resolves the canonical public origin for OAuth redirects and server callbacks.
 * Guarantees that Google Login and Google Calendar OAuth always resolve to the exact
 * same canonical host and protocol, preventing domain mismatch and redirect_uri_mismatch.
 *
 * Precedence:
 * 1. Standard reverse-proxy headers from incoming request (x-forwarded-host, x-forwarded-proto)
 * 2. Incoming request's parsed URL origin
 * 3. Configured NEXT_PUBLIC_SITE_URL
 * 4. Safe environment fallback
 */
export function getCanonicalOrigin(request?: Request): string {
  if (request) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto =
      request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')

    if (forwardedHost) {
      // In production behind HTTPS proxy, always ensure https scheme
      const scheme = process.env.NODE_ENV === 'production' ? 'https' : forwardedProto
      return `${scheme}://${forwardedHost}`
    }

    try {
      const origin = new URL(request.url).origin
      if (origin && !origin.includes('0.0.0.0')) {
        if (process.env.NODE_ENV === 'production' && origin.startsWith('http://')) {
          return origin.replace('http://', 'https://')
        }
        return origin
      }
    } catch {
      // Fall through to configured NEXT_PUBLIC_SITE_URL
    }
  }

  const configured = env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    try {
      const url = new URL(configured)
      if (process.env.NODE_ENV === 'production') {
        url.protocol = 'https:'
      }
      return url.origin
    } catch {
      // Fall through
    }
  }

  return process.env.NODE_ENV === 'production' ? 'https://tracker.vercel.app' : 'http://localhost:3000'
}
