import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signSession } from '@/lib/session'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import { GoogleCredentialService } from '@/modules/sync/google-calendar/services/GoogleCredentialService'
import { GOOGLE_OAUTH, COOKIES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

interface GoogleJWK {
  kid: string
  n: string
  e: string
  kty: string
  alg: string
}

/**
 * Fetches Google's public JSON Web Key Set for ID token verification.
 */
async function getGooglePublicKeys(): Promise<GoogleJWK[]> {
  try {
    const res = await fetch(GOOGLE_OAUTH.JWKS_URI, {
      next: { revalidate: 3600 } // Cache JWKS for 1 hour
    })
    if (!res.ok) {
      logger.error('OAuthCallback', `Failed to fetch Google JWKS: ${res.status}`)
      return []
    }
    const data = await res.json()
    return data.keys || []
  } catch (err) {
    logger.error('OAuthCallback', 'Error fetching Google JWKS', err)
    return []
  }
}

/**
 * Verifies the Google ID token signature using RS256 and Google's public keys.
 * Returns the decoded payload if valid, null if verification fails.
 */
async function verifyGoogleIdToken(idToken: string): Promise<Record<string, unknown> | null> {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    logger.error('OAuthCallback', 'Invalid ID token format: expected 3 parts')
    return null
  }

  const [headerB64, payloadB64, signatureB64] = parts

  // Decode header to find the key ID
  let header: { kid?: string; alg?: string }
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'))
  } catch {
    logger.error('OAuthCallback', 'Failed to decode ID token header')
    return null
  }

  if (header.alg !== 'RS256') {
    logger.error('OAuthCallback', `Unexpected ID token algorithm: ${header.alg}`)
    return null
  }

  // Fetch Google's public keys
  const keys = await getGooglePublicKeys()
  const matchingKey = keys.find((k: GoogleJWK) => k.kid === header.kid)

  if (!matchingKey) {
    logger.error('OAuthCallback', `No matching Google public key found for kid: ${header.kid}`)
    return null
  }

  // Build the RSA public key from JWK components
  try {
    const publicKey = crypto.createPublicKey({
      key: {
        kty: matchingKey.kty,
        n: matchingKey.n,
        e: matchingKey.e,
      },
      format: 'jwk'
    })

    // Verify the signature
    const signedData = `${headerB64}.${payloadB64}`
    const signature = Buffer.from(signatureB64, 'base64url')
    const isValid = crypto.createVerify('RSA-SHA256')
      .update(signedData)
      .verify(publicKey, signature)

    if (!isValid) {
      logger.error('OAuthCallback', 'ID token signature verification failed')
      return null
    }

    // Decode and return payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))

    // Validate issuer and audience
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com']
    if (!validIssuers.includes(payload.iss)) {
      logger.error('OAuthCallback', `Invalid ID token issuer: ${payload.iss}`)
      return null
    }

    if (payload.aud !== env.GOOGLE_CLIENT_ID) {
      logger.error('OAuthCallback', 'ID token audience does not match client ID')
      return null
    }

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      logger.error('OAuthCallback', 'ID token has expired')
      return null
    }

    logger.debug('OAuthCallback', 'ID token signature verified successfully', {
      iss: payload.iss,
      email: logger.sensitive(payload.email),
      sub: logger.sensitive(payload.sub)
    })

    return payload
  } catch (err) {
    logger.error('OAuthCallback', 'ID token verification exception', err)
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const stateFromGoogle = searchParams.get('state')

  const siteUrl = env.NEXT_PUBLIC_SITE_URL

  // Step 1: Check for error or missing code
  if (error || !code) {
    logger.error('OAuthCallback', 'OAuth error or missing code', { error, hasCode: !!code })
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-failed&details=${encodeURIComponent(error || 'Authorization code missing')}`)
  }

  const cookieStore = await cookies()

  // Step 2: Validate CSRF state parameter
  const storedState = cookieStore.get(COOKIES.OAUTH_STATE)?.value
  cookieStore.delete(COOKIES.OAUTH_STATE) // Consume the state cookie regardless

  if (!storedState || !stateFromGoogle || storedState !== stateFromGoogle) {
    logger.error('OAuthCallback', 'State parameter validation failed (CSRF protection)', {
      hasStoredState: !!storedState,
      hasGoogleState: !!stateFromGoogle,
      match: storedState === stateFromGoogle
    })
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-csrf-failed`)
  }

  logger.debug('OAuthCallback', 'State parameter validated successfully')

  // Step 3: Retrieve PKCE code verifier
  const codeVerifier = cookieStore.get(COOKIES.OAUTH_CODE_VERIFIER)?.value
  cookieStore.delete(COOKIES.OAUTH_CODE_VERIFIER) // Consume

  if (!codeVerifier) {
    logger.error('OAuthCallback', 'PKCE code verifier cookie missing')
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-pkce-failed`)
  }

  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${siteUrl}/api/auth/callback/google`

  try {
    // Step 4: Exchange authorization code for tokens (with PKCE verifier)
    logger.debug('OAuthCallback', 'Exchanging authorization code for tokens', {
      redirectUri,
      clientId: logger.sensitive(clientId),
      hasPKCE: true
    })

    const tokenResponse = await fetch(GOOGLE_OAUTH.TOKEN_URI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      logger.error('OAuthCallback', 'Token exchange failed', {
        status: tokenResponse.status,
        error: errText.substring(0, 500) // Truncate to avoid logging huge payloads
      })
      let detailMsg = 'Token exchange failed'
      try {
        const parsed = JSON.parse(errText)
        detailMsg = parsed.error_description || parsed.error || detailMsg
      } catch { /* ignore parse errors */ }
      return NextResponse.redirect(`${siteUrl}/?error=google-token-failed&details=${encodeURIComponent(detailMsg)}`)
    }

    const tokens = await tokenResponse.json()

    logger.debug('OAuthCallback', 'Token exchange successful', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasIdToken: !!tokens.id_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope
    })

    // Step 5: Verify and decode ID token
    const idToken = tokens.id_token
    if (!idToken) {
      logger.error('OAuthCallback', 'No ID token returned by Google')
      return NextResponse.redirect(`${siteUrl}/?error=google-no-id-token`)
    }

    const payload = await verifyGoogleIdToken(idToken)
    if (!payload) {
      logger.error('OAuthCallback', 'ID token verification failed')
      return NextResponse.redirect(`${siteUrl}/?error=google-invalid-token`)
    }

    const googleId = payload.sub as string
    const email = (payload.email as string)?.toLowerCase()

    if (!email) {
      logger.error('OAuthCallback', 'No email in verified ID token payload')
      return NextResponse.redirect(`${siteUrl}/?error=google-no-email`)
    }

    // Step 6: Find or Create User
    logger.debug('OAuthCallback', 'Looking up user by Google ID or email', {
      email: logger.sensitive(email),
      googleId: logger.sensitive(googleId)
    })

    let user = await db.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    })

    if (!user) {
      let username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')
      if (username.length < 2) username = 'user'

      const existingUser = await db.user.findUnique({
        where: { username }
      })

      if (existingUser) {
        username = `${username}${crypto.randomBytes(3).toString('hex')}`
      }

      user = await db.user.create({
        data: {
          username,
          email,
          googleId,
        }
      })

      logger.info('OAuthCallback', 'Created new user via Google OAuth', {
        userId: user.id,
        username: user.username
      })

      // Add default starter activities for Google users
      await db.activityTemplate.createMany({
        data: [
          {
            userId: user.id,
            name: 'Reading Book',
            category: 'personal',
            icon: 'BookOpen',
            color: 'green',
            recurrenceType: 'daily',
            sortOrder: 1,
            notes: 'Read at least 15 pages',
          },
          {
            userId: user.id,
            name: 'Wash Hairs',
            category: 'personal',
            icon: 'ShowerHead',
            color: 'blue',
            recurrenceType: 'custom',
            recurrenceInterval: 3,
            sortOrder: 2,
            notes: 'Wash and condition hair',
          },
          {
            userId: user.id,
            name: 'Netflix Subscription',
            category: 'finance',
            icon: 'Tv',
            color: 'red',
            recurrenceType: 'monthly',
            recurrenceDayOfMonth: 15,
            amount: 199.00,
            sortOrder: 3,
            notes: 'Monthly standard stream plan',
          }
        ]
      })
    } else {
      if (!user.googleId) {
        user = await db.user.update({
          where: { id: user.id },
          data: { googleId }
        })
        logger.info('OAuthCallback', 'Linked Google ID to existing user', { userId: user.id })
      }
    }

    // Step 7: Save refresh token securely
    if (tokens.refresh_token) {
      await GoogleCredentialService.saveCredentials(user.id, tokens.refresh_token)
      logger.info('OAuthCallback', 'Refresh token saved for user', { userId: user.id })
    } else {
      logger.warn('OAuthCallback', 'No refresh token returned by Google — user may need to re-consent', {
        userId: user.id
      })
    }

    // Step 8: Set session and redirect
    const isMobile = cookieStore.get(COOKIES.AUTH_SOURCE)?.value === 'mobile'

    const sessionToken = signSession(user.id, user.username)
    cookieStore.set(COOKIES.SESSION_TOKEN, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    })

    logger.info('OAuthCallback', 'OAuth flow completed successfully', {
      userId: user.id,
      username: user.username,
      isMobile,
      hasRefreshToken: !!tokens.refresh_token
    })

    if (isMobile) {
      cookieStore.delete(COOKIES.AUTH_SOURCE)
      return NextResponse.redirect(`tracker://auth-callback?token=${sessionToken}&username=${encodeURIComponent(user.username)}`)
    }

    return NextResponse.redirect(siteUrl)
  } catch (err) {
    logger.error('OAuthCallback', 'Unhandled exception in OAuth callback', err)
    return NextResponse.redirect(`${siteUrl}/?error=google-callback-exception`)
  }
}
