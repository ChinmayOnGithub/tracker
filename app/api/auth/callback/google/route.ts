import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signSession } from '@/lib/session'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  if (error || !code) {
    console.error('Google OAuth error callback:', error)
    return NextResponse.redirect(`${siteUrl}/?error=google-auth-failed&details=${encodeURIComponent(error || 'Authorization code missing')}`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${siteUrl}/api/auth/callback/google`

  try {
    // Exchange Auth Code for Tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      console.error('Google Token Exchange failed:', errText)
      let detailMsg = errText
      try {
        const parsed = JSON.parse(errText)
        detailMsg = parsed.error_description || parsed.error || errText
      } catch (_) {}
      return NextResponse.redirect(`${siteUrl}/?error=google-token-failed&details=${encodeURIComponent(detailMsg)}`)
    }

    const tokens = await tokenResponse.json()
    const idToken = tokens.id_token

    if (!idToken) {
      console.error('No ID Token returned by Google')
      return NextResponse.redirect(`${siteUrl}/?error=google-no-id-token`)
    }

    // Decode ID Token (JWT)
    const parts = idToken.split('.')
    if (parts.length !== 3) {
      console.error('Invalid ID Token format')
      return NextResponse.redirect(`${siteUrl}/?error=google-invalid-token`)
    }

    const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8')
    const payload = JSON.parse(payloadStr)

    const googleId = payload.sub
    const email = payload.email?.toLowerCase()
    const name = payload.name || email.split('@')[0]

    if (!email) {
      console.error('No email address in Google profile')
      return NextResponse.redirect(`${siteUrl}/?error=google-no-email`)
    }

    // Find or Create User
    let user = await db.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    })

    if (!user) {
      // Create a unique username starting with Google name prefix
      let username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')
      if (username.length < 2) username = 'user'
      
      const existingUser = await db.user.findUnique({
        where: { username }
      })

      if (existingUser) {
        // Append a short random string if username is already taken
        username = `${username}${Math.random().toString(36).substring(2, 6)}`
      }

      user = await db.user.create({
        data: {
          username,
          email,
          googleId,
        }
      })

      // Add the 3 default starter activities for Google users
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
      // Link Google ID if only email matched
      if (!user.googleId) {
        user = await db.user.update({
          where: { id: user.id },
          data: { googleId }
        })
      }
    }

    // Set signed cookie
    const token = signSession(user.id, user.username)
    const cookieStore = await cookies()
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    })

    return NextResponse.redirect(siteUrl)
  } catch (err) {
    console.error('Google auth processing error:', err)
    return NextResponse.redirect(`${siteUrl}/?error=google-callback-exception`)
  }
}
