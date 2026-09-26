export const ROUTES = {
  HOME: '/',
  AUTH_GOOGLE: '/api/auth/google',
  AUTH_CALLBACK_GOOGLE: '/api/auth/callback/google',
  GOOGLE_CALENDAR_CONNECT: '/api/integrations/google-calendar',
  GOOGLE_CALENDAR_CALLBACK: '/api/integrations/google-calendar/callback',
  SYNC_CALENDAR: '/api/sync/calendar',
  MOBILE_SYNC: '/api/mobile/sync'
} as const

export const COOKIES = {
  SESSION_TOKEN: 'session_token',
  AUTH_SOURCE: 'auth_source',
  GOOGLE_AUTH_STATE: 'google_auth_state',
  GOOGLE_AUTH_CODE_VERIFIER: 'google_auth_code_verifier',
  GOOGLE_CALENDAR_STATE: 'google_calendar_state',
  GOOGLE_CALENDAR_CODE_VERIFIER: 'google_calendar_code_verifier',
  GOOGLE_CALENDAR_RETURN_TO: 'google_calendar_return_to'
} as const

export const GOOGLE_OAUTH = {
  AUTH_URI: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URI: 'https://oauth2.googleapis.com/token',
  JWKS_URI: 'https://www.googleapis.com/oauth2/v3/certs',
  REVOKE_URI: 'https://oauth2.googleapis.com/revoke',
  CALENDAR_SCOPE: 'https://www.googleapis.com/auth/calendar',
  USER_INFO_SCOPE: 'openid email profile'
} as const

export const ALLOWED_USER_EMAILS = [
  'chinmaydpatil09@gmail.com'
] as const

export function isAuthorizedUserEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  // Check env override if configured or hard whitelist
  const envAllowed = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase()
  if (envAllowed && envAllowed.split(',').map(e => e.trim()).includes(normalized)) {
    return true
  }
  return (ALLOWED_USER_EMAILS as readonly string[]).includes(normalized)
}

export const CACHE_TTL = {
  CALENDAR_EVENTS_MS: 30 * 1000, // 30 seconds for fast refresh of deleted/completed events
  ACCESS_TOKEN_THRESHOLD_MS: 60 * 1000 // 1 minute buffer before expiry
} as const
