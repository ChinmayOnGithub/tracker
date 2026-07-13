import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GoogleCalendarService } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

/**
 * GET handler to warm up Google Calendar cache for all connected users.
 * Triggered by cron job or system scheduler.
 * 
 * Security: Requires SYNC_SECRET to be configured and passed as ?secret= query param.
 * If SYNC_SECRET is not configured, the endpoint is disabled (fail-closed).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    const configSecret = env.SYNC_SECRET

    // Fail-closed: if SYNC_SECRET is not configured, reject all requests
    if (!configSecret) {
      logger.error('BackgroundSyncApi', 'SYNC_SECRET is not configured — endpoint is disabled')
      return NextResponse.json(
        { error: 'Sync endpoint is not configured. Set SYNC_SECRET in environment.' },
        { status: 503 }
      )
    }

    const secretHash = crypto.createHash('sha256').update(secret || '').digest()
    const configSecretHash = crypto.createHash('sha256').update(configSecret || '').digest()

    if (!crypto.timingSafeEqual(secretHash, configSecretHash)) {
      logger.warn('BackgroundSyncApi', 'Unauthorized access attempt to sync route')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const credentials = await db.googleCredential.findMany({
      select: { userId: true }
    })

    if (credentials.length === 0) {
      logger.info('BackgroundSyncApi', 'No connected users found')
      return NextResponse.json({ message: 'No connected users found', synced: 0 })
    }

    logger.info('BackgroundSyncApi', `Starting sync for ${credentials.length} users`)

    // Warm up cache for each user in chunks (concurrency limit = 5) to prevent API rate limiting and connection starvation
    const concurrencyLimit = 5
    const results = []

    for (let i = 0; i < credentials.length; i += concurrencyLimit) {
      const chunk = credentials.slice(i, i + concurrencyLimit)
      const chunkResults = await Promise.all(
        chunk.map(async ({ userId }) => {
          try {
            const timeMin = new Date()
            const timeMax = new Date(timeMin.getTime() + 8 * 24 * 60 * 60 * 1000)

            GoogleCalendarService.clearCache(userId)
            const events = await GoogleCalendarService.getEvents(userId, timeMin, timeMax, true)

            logger.info('BackgroundSyncApi', `Sync successful for user`, {
              userId,
              eventCount: events.length
            })
            return { userId, success: true, eventCount: events.length }
          } catch (err) {
            logger.error('BackgroundSyncApi', `Sync failed for user`, {
              userId,
              error: err instanceof Error ? err.message : String(err)
            })
            return { userId, success: false, error: err instanceof Error ? err.message : String(err) }
          }
        })
      )
      results.push(...chunkResults)
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    logger.info('BackgroundSyncApi', 'Sync completed', { successCount, failCount })

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${successCount} succeeded, ${failCount} failed`,
      results
    })
  } catch (error) {
    logger.error('BackgroundSyncApi', 'Background sync handler failed', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
