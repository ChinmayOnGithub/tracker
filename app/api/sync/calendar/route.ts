import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GoogleCalendarService } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
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

/**
 * POST handler for Google Calendar webhook push notifications.
 * Processes incremental sync updates when changes are detected externally.
 */
export async function POST(request: Request) {
  try {
    const headers = request.headers
    const channelId = headers.get('x-goog-channel-id')
    const resourceId = headers.get('x-goog-resource-id')
    const resourceState = headers.get('x-goog-resource-state')

    logger.info('BackgroundSyncApi', 'Received Google Calendar webhook notification', {
      channelId,
      resourceId,
      resourceState,
    })

    if (!channelId || !resourceId) {
      return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
    }

    // Ignore sync channel establishment confirmation
    if (resourceState === 'sync') {
      logger.info('BackgroundSyncApi', 'Sync channel confirmed', { channelId })
      return new Response(null, { status: 200 })
    }

    // Find the sync state record mapped to this channel ID
    const syncState = await db.calendarSyncState.findFirst({
      where: { channelId }
    })

    if (!syncState) {
      logger.warn('BackgroundSyncApi', 'No sync state record matches channel ID', { channelId })
      return NextResponse.json({ error: 'Channel not recognized' }, { status: 404 })
    }

    // Trigger sync for the user
    const syncResult = await CalendarService.sync(syncState.userId)
    logger.info('BackgroundSyncApi', 'Webhook sync completed successfully', {
      userId: syncState.userId,
      result: syncResult
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    logger.error('BackgroundSyncApi', 'Webhook sync trigger failed', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
