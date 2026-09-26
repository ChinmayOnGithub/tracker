import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import { COOKIES, GOOGLE_OAUTH } from '@/lib/constants'
import { SessionService } from '@/lib/services/SessionService'
import { GoogleCredentialService } from '@/modules/sync/google-calendar/services/GoogleCredentialService'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { OnboardingService } from '@/lib/services/OnboardingService'
import { GoogleApiError } from '@/lib/errors'
import { logger } from '@/lib/logger'

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/onboarding'
  return value
}

export async function GET(request: Request) {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const stateFromGoogle = requestUrl.searchParams.get('state')

  const cookieStore = await cookies()
  const returnTo = safeReturnTo(cookieStore.get(COOKIES.GOOGLE_CALENDAR_RETURN_TO)?.value)
  cookieStore.delete(COOKIES.GOOGLE_CALENDAR_RETURN_TO)

  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}${returnTo}?calendar=error&reason=${encodeURIComponent(reason)}`)

  if (error || !code) {
    logger.warn('GoogleCalendarOAuth', 'Google Calendar authorization was not completed', { error })
    return fail(error || 'missing_code')
  }

  const storedState = cookieStore.get(COOKIES.GOOGLE_CALENDAR_STATE)?.value
  cookieStore.delete(COOKIES.GOOGLE_CALENDAR_STATE)

  if (!storedState || !stateFromGoogle || storedState !== stateFromGoogle) {
    logger.error('GoogleCalendarOAuth', 'Calendar OAuth state validation failed')
    return fail('csrf')
  }

  const codeVerifier = cookieStore.get(COOKIES.GOOGLE_CALENDAR_CODE_VERIFIER)?.value
  cookieStore.delete(COOKIES.GOOGLE_CALENDAR_CODE_VERIFIER)

  if (!codeVerifier) {
    logger.error('GoogleCalendarOAuth', 'Calendar OAuth PKCE verifier is missing')
    return fail('pkce')
  }

  const user = await SessionService.getSessionUser()
  if (!user) {
    return NextResponse.redirect(`${siteUrl}/?error=calendar-auth-required`)
  }

  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${siteUrl}/api/integrations/google-calendar/callback`

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
      const errorText = await tokenResponse.text()
      logger.error('GoogleCalendarOAuth', 'Calendar token exchange failed', {
        userId: user.id,
        status: tokenResponse.status,
        error: errorText.substring(0, 500),
      })
      return fail('token_exchange')
    }

    const tokens = await tokenResponse.json()
    const grantedScopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : []

    if (!grantedScopes.includes(GOOGLE_OAUTH.CALENDAR_SCOPE)) {
      logger.warn('GoogleCalendarOAuth', 'Calendar scope was not granted', {
        userId: user.id,
        grantedScopes,
      })
      return fail('calendar_scope')
    }

    if (tokens.refresh_token) {
      await GoogleCredentialService.saveCredentials(user.id, tokens.refresh_token)
    } else if (!(await GoogleCredentialService.isConnected(user.id))) {
      logger.error('GoogleCalendarOAuth', 'No refresh token was returned for a new calendar connection', {
        userId: user.id,
      })
      return fail('refresh_token')
    }

    const currentOnboarding = await OnboardingService.getState(user.id)
    if (currentOnboarding) {
      await OnboardingService.saveState(user.id, {
        ...currentOnboarding,
        calendarProvider: 'google',
      })
    }

    let created = 0
    let updated = 0
    let deleted = 0

    try {
      const syncResult = await CalendarService.sync(user.id)
      created = syncResult.eventsCreated
      updated = syncResult.eventsUpdated
      deleted = syncResult.eventsDeleted
    } catch (syncError) {
      logger.warn('GoogleCalendarOAuth', 'Calendar credential saved but initial sync failed', {
        userId: user.id,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      })
    }

    try {
      await CalendarService.ensureWatchChannel(user.id)
    } catch (watchError) {
      logger.warn('GoogleCalendarOAuth', 'Calendar connected but watch channel setup failed', {
        userId: user.id,
        error: watchError instanceof Error ? watchError.message : String(watchError),
      })
    }

    logger.info('GoogleCalendarOAuth', 'Google Calendar connected successfully', {
      userId: user.id,
      created,
      updated,
      deleted,
    })

    return NextResponse.redirect(
      `${siteUrl}${returnTo}?calendar=connected&created=${created}&updated=${updated}&deleted=${deleted}`
    )
  } catch (error) {
    if (error instanceof GoogleApiError) {
      logger.error('GoogleCalendarOAuth', 'Google Calendar authorization failed', {
        userId: user.id,
        statusCode: error.statusCode,
        message: error.message,
      })
    } else {
      logger.error('GoogleCalendarOAuth', 'Unhandled calendar OAuth error', error)
    }
    return fail('callback')
  }
}
