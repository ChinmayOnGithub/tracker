import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { env } from '@/lib/env'
import { COOKIES, GOOGLE_OAUTH } from '@/lib/constants'
import { SessionService } from '@/lib/services/SessionService'
import { logger } from '@/lib/logger'

const DEFAULT_RETURN_TO = '/onboarding'

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return DEFAULT_RETURN_TO
  return value
}

export async function GET(request: Request) {
  const user = await SessionService.getSessionUser()
  const siteUrl = new URL(env.NEXT_PUBLIC_SITE_URL).origin

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/?error=calendar-auth-required`)
  }

  const clientId = env.GOOGLE_CLIENT_ID
  if (!clientId || clientId === 'test-client-id') {
    logger.error('GoogleCalendarOAuth', 'Google OAuth client ID is not configured')
    return NextResponse.redirect(`${siteUrl}/onboarding?calendar=error&reason=config`)
  }

  const requestUrl = new URL(request.url)
  const returnTo = safeReturnTo(requestUrl.searchParams.get('returnTo'))
  const redirectUri = new URL('/api/integrations/google-calendar/callback', siteUrl).toString()

  const state = crypto.randomUUID()
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  const googleAuthUrl = new URL(GOOGLE_OAUTH.AUTH_URI)
  googleAuthUrl.searchParams.set('client_id', clientId)
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
  googleAuthUrl.searchParams.set('response_type', 'code')
  googleAuthUrl.searchParams.set('scope', GOOGLE_OAUTH.CALENDAR_SCOPE)
  googleAuthUrl.searchParams.set('state', state)
  googleAuthUrl.searchParams.set('access_type', 'offline')
  googleAuthUrl.searchParams.set('prompt', 'consent')
  googleAuthUrl.searchParams.set('include_granted_scopes', 'true')
  googleAuthUrl.searchParams.set('code_challenge', codeChallenge)
  googleAuthUrl.searchParams.set('code_challenge_method', 'S256')

  const response = NextResponse.redirect(googleAuthUrl.toString())
  const cookieStore = await cookies()

  cookieStore.set(COOKIES.GOOGLE_CALENDAR_STATE, state, {
    maxAge: 10 * 60,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  cookieStore.set(COOKIES.GOOGLE_CALENDAR_CODE_VERIFIER, codeVerifier, {
    maxAge: 10 * 60,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  cookieStore.set(COOKIES.GOOGLE_CALENDAR_RETURN_TO, returnTo, {
    maxAge: 10 * 60,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  logger.info('GoogleCalendarOAuth', 'Starting Google Calendar authorization', {
    userId: user.id,
    redirectUri,
    returnTo,
    hasPKCE: true,
  })

  return response
}
