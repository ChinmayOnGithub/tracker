export const ROUTES = {
  HOME: '/',
  AUTH_GOOGLE: '/api/auth/google',
  AUTH_CALLBACK_GOOGLE: '/api/auth/callback/google',
  SYNC_CALENDAR: '/api/sync/calendar',
  MOBILE_SYNC: '/api/mobile/sync'
} as const

export const COOKIES = {
  SESSION_TOKEN: 'session_token',
  AUTH_SOURCE: 'auth_source',
  OAUTH_STATE: 'oauth_state',
  OAUTH_CODE_VERIFIER: 'oauth_code_verifier'
} as const

export const GOOGLE_OAUTH = {
  AUTH_URI: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URI: 'https://oauth2.googleapis.com/token',
  JWKS_URI: 'https://www.googleapis.com/oauth2/v3/certs',
  REVOKE_URI: 'https://oauth2.googleapis.com/revoke',
  CALENDAR_SCOPE: 'https://www.googleapis.com/auth/calendar',
  USER_INFO_SCOPE: 'openid email profile'
} as const

export const CACHE_TTL = {
  CALENDAR_EVENTS_MS: 10 * 60 * 1000, // 10 minutes
  ACCESS_TOKEN_THRESHOLD_MS: 60 * 1000 // 1 minute buffer before expiry
} as const
