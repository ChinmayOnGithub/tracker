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

// In-memory sync lock map to prevent concurrent duplicate full/incremental syncs for the same user
const activeSyncPromises = new Map<string, Promise<unknown>>()

function scheduleUserSync(userId: string) {
  if (activeSyncPromises.has(userId)) {
    logger.info('BackgroundSyncApi', 'Sync already in-progress for user, reusing active run', { userId })
    return activeSyncPromises.get(userId)
  }

  const syncPromise = (async () => {
    try {
      const syncResult = await CalendarService.sync(userId)
      logger.info('BackgroundSyncApi', 'Webhook background sync completed successfully', {
        userId,
        result: syncResult,
      })
    } catch (err) {
      logger.error('BackgroundSyncApi', 'Webhook background sync execution failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      activeSyncPromises.delete(userId)
    }
  })()

  activeSyncPromises.set(userId, syncPromise)
  return syncPromise
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
      return NextResponse.json({ error: 'Missing required webhook identity headers' }, { status: 400 })
    }

    // Ignore sync channel establishment confirmation
    if (resourceState === 'sync') {
      logger.info('BackgroundSyncApi', 'Sync channel confirmed', { channelId })
      return new Response(null, { status: 200 })
    }

    // Direct query validation: Match both channelId AND resourceId directly at query time
    const syncState = await db.calendarSyncState.findFirst({
      where: {
        channelId,
        resourceId,
      },
    })

    if (!syncState) {
      // Channel or resource unrecognized or mismatched
      logger.warn('BackgroundSyncApi', 'No sync state matches channel/resource identity pair', {
        channelId,
        resourceId,
      })
      return NextResponse.json({ error: 'Channel or resource not recognized' }, { status: 404 })
    }

    // Acknowledge webhook quickly and execute sync reliably
    scheduleUserSync(syncState.userId)

    return NextResponse.json({ success: true, acknowledged: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
    logger.error('BackgroundSyncApi', `Webhook sync trigger failed: ${errorMsg}`)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
