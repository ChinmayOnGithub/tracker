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
    const headerSecret = request.headers.get('x-tracker-sync-secret')
    const { searchParams } = new URL(request.url)
    const querySecret = searchParams.get('secret')
    const secret = headerSecret || querySecret
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
 * Executes user synchronization protected by a durable database lease lock.
 * Prevents race conditions and duplicate concurrent work across multiple server instances.
 */
async function executeLockedUserSync(syncStateId: string, userId: string): Promise<boolean> {
  const now = new Date()
  const lockUntil = new Date(now.getTime() + 60_000) // 60-second lease
  const lockToken = crypto.randomUUID()

  const lockResult = await db.calendarSyncState.updateMany({
    where: {
      id: syncStateId,
      OR: [
        { syncLockUntil: null },
        { syncLockUntil: { lt: now } }
      ]
    },
    data: {
      syncLockUntil: lockUntil,
      syncLockToken: lockToken
    }
  })

  if (lockResult.count !== 1) {
    // Check if the record actually exists in the database with an active lease
    const currentRecord = await db.calendarSyncState.findFirst({
      where: { id: syncStateId }
    })
    if (currentRecord && currentRecord.syncLockUntil && currentRecord.syncLockUntil > now) {
      logger.info('BackgroundSyncApi', 'Sync lease already held by another worker instance, skipping duplicate', { userId })
      return false
    }
  }

  try {
    await CalendarService.sync(userId)
    logger.info('BackgroundSyncApi', 'Webhook background sync completed successfully', { userId })
    return true
  } catch (err) {
    logger.error('BackgroundSyncApi', 'Webhook background sync execution failed', {
      userId,
      error: err instanceof Error ? err.message : String(err)
    })
    return false
  } finally {
    await db.calendarSyncState.updateMany({
      where: { id: syncStateId, syncLockToken: lockToken },
      data: {
        syncLockUntil: null,
        syncLockToken: null
      }
    }).catch(cleanupErr => console.warn('[BackgroundSyncApi] Failed to release sync lease:', cleanupErr))
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

    const headerSecret = request.headers.get('x-tracker-sync-secret')
    const { searchParams } = new URL(request.url)
    const querySecret = searchParams.get('secret')
    const secret = headerSecret || querySecret

    if (secret) {
      const configSecret = env.SYNC_SECRET || process.env.CALENDAR_WEBHOOK_SECRET
      if (configSecret) {
        const secretHash = crypto.createHash('sha256').update(secret).digest()
        const configSecretHash = crypto.createHash('sha256').update(configSecret).digest()
        if (!crypto.timingSafeEqual(secretHash, configSecretHash)) {
          logger.warn('BackgroundSyncApi', 'Unauthorized calendar webhook access attempt')
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
    }

    if (!channelId || !resourceId) {
      return NextResponse.json({ error: 'Missing required webhook identity headers' }, { status: 400 })
    }

    // Direct query validation: Match both channelId AND resourceId directly at query time
    const syncState = await db.calendarSyncState.findFirst({
      where: {
        channelId,
        resourceId,
      },
    })

    if (!syncState) {
      logger.warn('BackgroundSyncApi', 'No sync state matches channel/resource identity pair', {
        channelId,
        resourceId,
      })
      return NextResponse.json({ error: 'Channel or resource not recognized' }, { status: 404 })
    }

    // Verify provider matches
    if (syncState.provider !== 'google') {
      return NextResponse.json({ error: 'Mismatched provider identity' }, { status: 400 })
    }

    // Explicit state handling
    switch (resourceState) {
      case 'sync':
        logger.info('BackgroundSyncApi', 'Sync channel confirmed', { channelId })
        return new Response(null, { status: 200 })

      case 'exists': {
        // Schedule durable locked sync
        const synced = await executeLockedUserSync(syncState.id, syncState.userId)
        return NextResponse.json({ success: true, acknowledged: true, synced })
      }

      case 'not_exists': {
        logger.warn('BackgroundSyncApi', 'Calendar resource deleted externally, marking channel invalid', { channelId, resourceId })
        await db.calendarSyncState.update({
          where: { id: syncState.id },
          data: {
            channelId: null,
            resourceId: null,
            expiration: null
          }
        })
        return NextResponse.json({ success: true, acknowledged: true, channelInvalidated: true })
      }

      default:
        logger.info('BackgroundSyncApi', `Ignored webhook notification for unhandled state: ${resourceState}`)
        return NextResponse.json({ success: true, acknowledged: true, ignored: true })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error('BackgroundSyncApi', `Webhook sync trigger failed: ${errorMsg}`)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

