import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { env } from '@/lib/env'
import { GOOGLE_OAUTH, COOKIES } from '@/lib/constants'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')

  const clientId = env.GOOGLE_CLIENT_ID
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const redirectUri = `${siteUrl}${'/api/auth/callback/google'}`

  if (!clientId || clientId === 'test-client-id') {
    logger.error('OAuthInitiator', 'Google OAuth client ID is not configured')
    return NextResponse.redirect(`${siteUrl}/?error=google-config-missing`)
  }

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
  googleAuthUrl.searchParams.set('scope', GOOGLE_OAUTH.USER_INFO_SCOPE)
  googleAuthUrl.searchParams.set('state', state)
  googleAuthUrl.searchParams.set('access_type', 'offline')
  googleAuthUrl.searchParams.set('prompt', 'select_account')
  googleAuthUrl.searchParams.set('include_granted_scopes', 'true')
  googleAuthUrl.searchParams.set('code_challenge', codeChallenge)
  googleAuthUrl.searchParams.set('code_challenge_method', 'S256')

  logger.debug('OAuthInitiator', 'Redirecting to Google OAuth for authentication', {
    redirectUri,
    scopes: GOOGLE_OAUTH.USER_INFO_SCOPE,
    clientId: logger.sensitive(clientId),
    hasPKCE: true
  })

  const response = NextResponse.redirect(googleAuthUrl.toString())
  const cookieStore = await cookies()

  cookieStore.set(COOKIES.GOOGLE_AUTH_STATE, state, {
    maxAge: 10 * 60,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  cookieStore.set(COOKIES.GOOGLE_AUTH_CODE_VERIFIER, codeVerifier, {
    maxAge: 10 * 60,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  if (source === 'mobile') {
    cookieStore.set(COOKIES.AUTH_SOURCE, 'mobile', {
      maxAge: 5 * 60,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })
  }

  return response
}
