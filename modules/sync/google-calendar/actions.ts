"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { GoogleCredentialService } from './services/GoogleCredentialService'
import { CalendarEventInput } from './services/GoogleCalendarService'
import { ProviderService } from '@/lib/services/ProviderService'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import { handleActionError, UnauthorizedError } from '@/lib/errors'
import { parseUTCDate } from '@/lib/recurrence'

/**
 * Checks if the current user has connected their Google account.
 * Returns connection metadata.
 */
export async function checkGoogleConnection() {
  try {
    const user = await getLoggedUser()
    if (!user) {
      throw new UnauthorizedError()
    }

    const credential = await db.googleCredential.findUnique({
      where: { userId: user.id }
    })

    if (!credential) {
      return { success: true as const, connected: false }
    }

    return {
      success: true as const,
      connected: true,
      expiryDate: credential.expiryDate.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
      calendarId: credential.calendarId
    }
  } catch (error) {
    logger.error('GoogleCalendarActions', 'Failed to check Google connection', error)
    return handleActionError(error)
  }
}

/**
 * Disconnects the user's Google integration by removing their credentials.
 */
export async function disconnectGoogleAccount() {
  try {
    const user = await getLoggedUser()
    if (!user) {
      throw new UnauthorizedError()
    }

    const deleted = await GoogleCredentialService.disconnect(user.id)
    
    // Also delete any local linked calendar event mappings to avoid orphan links
    await db.linkedEventMapping.deleteMany({
      where: { userId: user.id }
    })

    revalidatePath('/')
    return { success: true as const, disconnected: deleted }
  } catch (error) {
    logger.error('GoogleCalendarActions', 'Failed to disconnect Google account', error)
    return handleActionError(error)
  }
}

/**
 * Fetches and groups calendar events into today, tomorrow, and upcoming categories.
 */
export async function getAgendaAction(todayStr: string, forceRefresh = false) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      throw new UnauthorizedError()
    }

    const connected = await GoogleCredentialService.isConnected(user.id)
    if (!connected) {
      return { success: true as const, connected: false, agenda: null }
    }

    const timeMin = parseUTCDate(todayStr)
    // Query range of 8 days to catch today, tomorrow, and upcoming week
    const timeMax = new Date(timeMin.getTime() + 8 * 24 * 60 * 60 * 1000)

    const events = await ProviderService.getEvents(user.id, 'GOOGLE', timeMin, timeMax, forceRefresh)

    const todayEvents = []
    const tomorrowEvents = []
    const upcomingEvents = []

    const tomorrowDate = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0]

    for (const event of events) {
      const startStr = event.start.split('T')[0]
      if (startStr === todayStr) {
        todayEvents.push(event)
      } else if (startStr === tomorrowStr) {
        tomorrowEvents.push(event)
      } else {
        upcomingEvents.push(event)
      }
    }

    return {
      success: true as const,
      connected: true,
      agenda: {
        today: todayEvents,
        tomorrow: tomorrowEvents,
        upcoming: upcomingEvents
      }
    }
  } catch (error) {
    logger.error('GoogleCalendarActions', 'Failed to get calendar agenda', error)
    return handleActionError(error)
  }
}

/**
 * Server Action to create a Google Calendar event.
 */
export async function createGoogleEventAction(event: CalendarEventInput) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      throw new UnauthorizedError()
    }

    const created = await ProviderService.createEvent(user.id, 'GOOGLE', event)
    revalidatePath('/')
    return { success: true as const, event: created }
  } catch (error) {
    logger.error('GoogleCalendarActions', 'Failed to create Google event', error)
    return handleActionError(error)
  }
}

/**
 * Server Action to update a Google Calendar event.
 */
export async function updateGoogleEventAction(eventId: string, event: Partial<CalendarEventInput>) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      throw new UnauthorizedError()
    }

    const updated = await ProviderService.updateEvent(user.id, 'GOOGLE', eventId, event)
    revalidatePath('/')
    return { success: true as const, event: updated }
  } catch (error) {
    logger.error('GoogleCalendarActions', 'Failed to update Google event', error)
    return handleActionError(error)
  }
}

/**
 * Server Action to delete a Google Calendar event.
 */
export async function deleteGoogleEventAction(eventId: string) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      throw new UnauthorizedError()
    }

    const deleted = await ProviderService.deleteEvent(user.id, 'GOOGLE', eventId)
    revalidatePath('/')
    return { success: true as const, deleted }
  } catch (error) {
    logger.error('GoogleCalendarActions', 'Failed to delete Google event', error)
    return handleActionError(error)
  }
}
