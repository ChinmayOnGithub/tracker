import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signSession } from '@/lib/session'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import { COOKIES, GOOGLE_OAUTH } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { OnboardingService } from '@/lib/services/OnboardingService'
import crypto from 'crypto'

interface GoogleJWK {
  kid: string
  n: string
  e: string
  kty: string
  alg: string
}

async function getGooglePublicKeys(): Promise<GoogleJWK[]> {
  try {
    const res = await fetch(GOOGLE_OAUTH.JWKS_URI, {
      next: { revalidate: 3600 }
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

async function verifyGoogleIdToken(idToken: string): Promise<Record<string, unknown> | null> {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    logger.error('OAuthCallback', 'Invalid ID token format: expected 3 parts')
    return null
  }

  const [headerB64, payloadB64, signatureB64] = parts

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

  const keys = await getGooglePublicKeys()
  const matchingKey = keys.find((k: GoogleJWK) => k.kid === header.kid)

  if (!matchingKey) {
    logger.error('OAuthCallback', `No matching Google public key found for kid: ${header.kid}`)
    return null
  }

  try {
    const publicKey = crypto.createPublicKey({
      key: {
        kty: matchingKey.kty,
        n: matchingKey.n,
        e: matchingKey.e,
      },
      format: 'jwk'
    })

    const signedData = `${headerB64}.${payloadB64}`
    const signature = Buffer.from(signatureB64, 'base64url')
    const isValid = crypto.createVerify('RSA-SHA256')
      .update(signedData)
      .verify(publicKey, signature)

    if (!isValid) {
      logger.error('OAuthCallback', 'ID token signature verification failed')
      return null
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com']

    if (!validIssuers.includes(payload.iss)) {
      logger.error('OAuthCallback', `Invalid ID token issuer: ${payload.iss}`)
      return null
    }

    if (payload.aud !== env.GOOGLE_CLIENT_ID) {
      logger.error('OAuthCallback', 'ID token audience does not match client ID')
      return null
    }

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      logger.error('OAuthCallback', 'ID token has expired')
      return null
    }

    if (payload.email_verified !== true) {
      logger.error('OAuthCallback', 'Google email is not verified')
      return null
    }

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

  const siteUrl = new URL(env.NEXT_PUBLIC_SITE_URL).origin

  if (error || !code) {
    logger.error('OAuthCallback', 'OAuth error or missing code', { error, hasCode: !!code })
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-failed&details=${encodeURIComponent(error || 'Authorization code missing')}`)
  }

  const cookieStore = await cookies()
  const storedState = cookieStore.get(COOKIES.GOOGLE_AUTH_STATE)?.value
  cookieStore.delete(COOKIES.GOOGLE_AUTH_STATE)

  if (!storedState || !stateFromGoogle || storedState !== stateFromGoogle) {
    logger.error('OAuthCallback', 'State parameter validation failed (CSRF protection)', {
      hasStoredState: !!storedState,
      hasGoogleState: !!stateFromGoogle,
      match: storedState === stateFromGoogle
    })
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-csrf-failed`)
  }

  const codeVerifier = cookieStore.get(COOKIES.GOOGLE_AUTH_CODE_VERIFIER)?.value
  cookieStore.delete(COOKIES.GOOGLE_AUTH_CODE_VERIFIER)

  if (!codeVerifier) {
    logger.error('OAuthCallback', 'PKCE code verifier cookie missing')
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-pkce-failed`)
  }

  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const redirectUri = new URL('/api/auth/callback/google', siteUrl).toString()

  try {
    const tokenResponse = await fetch(GOOGLE_OAUTH.TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
        error: errText.substring(0, 500)
      })
      let detailMsg = 'Token exchange failed'
      try {
        const parsed = JSON.parse(errText)
        detailMsg = parsed.error_description || parsed.error || detailMsg
      } catch {
        // Ignore non-JSON error responses.
      }
      return NextResponse.redirect(`${siteUrl}/?error=google-token-failed&details=${encodeURIComponent(detailMsg)}`)
    }

    const tokens = await tokenResponse.json()
    const idToken = tokens.id_token

    if (!idToken) {
      logger.error('OAuthCallback', 'No ID token returned by Google')
      return NextResponse.redirect(`${siteUrl}/?error=google-no-id-token`)
    }

    const payload = await verifyGoogleIdToken(idToken)
    if (!payload) {
      return NextResponse.redirect(`${siteUrl}/?error=google-invalid-token`)
    }

    const googleId = payload.sub as string
    const email = (payload.email as string)?.toLowerCase()

    if (!googleId || !email) {
      logger.error('OAuthCallback', 'Verified Google ID token is missing subject or email')
      return NextResponse.redirect(`${siteUrl}/?error=google-no-email`)
    }

    let user = await db.user.findFirst({
      where: {
        OR: [{ googleId }, { email }]
      }
    })

    const isNewUser = !user

    if (!user) {
      let username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')
      if (username.length < 2) username = 'user'

      const existingUser = await db.user.findUnique({ where: { username } })
      if (existingUser) {
        username = `${username}${crypto.randomBytes(3).toString('hex')}`
      }

      user = await db.user.create({
        data: { username, email, googleId }
      })

      logger.info('OAuthCallback', 'Created new user via Google OAuth', {
        userId: user.id,
        username: user.username
      })
    } else if (!user.googleId) {
      user = await db.user.update({
        where: { id: user.id },
        data: { googleId }
      })
      logger.info('OAuthCallback', 'Linked Google ID to existing user', { userId: user.id })
    }

    // Development rollout: every successful Google login re-enters the gamified onboarding,
    // including existing users who have completed it before.
    await OnboardingService.resetForDevelopmentLogin(user.id)

    const picture = payload.picture as string | undefined
    if (picture) {
      try {
        const existingProfileSetting = await db.userSetting.findUnique({
          where: { userId_module: { userId: user.id, module: 'PROFILE' } }
        })
        const currentConfig = (existingProfileSetting?.config as Record<string, unknown>) || {}

        await db.userSetting.upsert({
          where: { userId_module: { userId: user.id, module: 'PROFILE' } },
          create: {
            userId: user.id,
            module: 'PROFILE',
            config: { ...currentConfig, avatarUrl: picture, picture }
          },
          update: {
            config: { ...currentConfig, avatarUrl: picture, picture }
          }
        })
      } catch (avatarErr) {
        logger.warn('OAuthCallback', 'Failed to save Google profile picture setting', avatarErr)
      }
    }

    const isMobile = cookieStore.get(COOKIES.AUTH_SOURCE)?.value === 'mobile'
    const sessionToken = signSession(user.id, user.username)

    cookieStore.set(COOKIES.SESSION_TOKEN, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/'
    })

    if (isMobile) {
      cookieStore.delete(COOKIES.AUTH_SOURCE)
      return NextResponse.redirect(`tracker://auth-callback?token=${sessionToken}&username=${encodeURIComponent(user.username)}`)
    }

    logger.info('OAuthCallback', 'Google authentication completed', {
      userId: user.id,
      username: user.username,
      isNewUser
    })

    return NextResponse.redirect(siteUrl)
  } catch (err) {
    logger.error('OAuthCallback', 'Unhandled exception in OAuth callback', err)
    return NextResponse.redirect(`${siteUrl}/?error=google-callback-exception`)
  }
}
