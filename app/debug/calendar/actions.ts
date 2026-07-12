"use server"

import { getLoggedUser } from "@/app/actions/auth"
import { GoogleCredentialService } from "@/modules/sync/google-calendar/services/GoogleCredentialService"
import { GoogleCalendarService } from "@/modules/sync/google-calendar/services/GoogleCalendarService"
import { handleActionError, UnauthorizedError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"

export async function clearCacheAction() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Not available in production')
  }

  try {
    const user = await getLoggedUser()
    if (!user) throw new UnauthorizedError()

    GoogleCalendarService.clearCache(user.id)
    revalidatePath("/debug/calendar")
    return { success: true as const, message: "Cache cleared successfully" }
  } catch (err) {
    return handleActionError(err)
  }
}

export async function testTokenRefreshAction() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Not available in production')
  }

  try {
    const user = await getLoggedUser()
    if (!user) throw new UnauthorizedError()

    // Retrieve encrypted credentials and decrypt
    const refreshToken = await GoogleCredentialService.getRefreshToken(user.id)
    if (!refreshToken) {
      return { success: false, error: "No refresh token found. Connect Google Account first." }
    }

    // Attempt token refresh via internal method (exposed indirectly by fetching events with forceRefresh)
    // We can clear access token cache and fetch events to force check
    GoogleCalendarService.clearCache(user.id)
    
    const timeMin = new Date()
    const timeMax = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000) // 1 day range
    
    const start = Date.now()
    await GoogleCalendarService.getEvents(user.id, timeMin, timeMax, true)
    const duration = Date.now() - start

    revalidatePath("/debug/calendar")
    return { 
      success: true as const, 
      message: `Token refreshed and events fetched successfully in ${duration}ms!` 
    }
  } catch (err) {
    logger.error("DebugActions", "Token refresh test failed", err)
    return handleActionError(err)
  }
}
