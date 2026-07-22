"use server"

import { db } from '@/lib/db'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { getLoggedUser } from './auth'
import { CalendarEventType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

export async function createCalendarEventAction(data: {
  title: string
  start: string
  end: string
  allDay: boolean
  type?: CalendarEventType
  color?: string
}) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const event = await CalendarService.createEvent(user.id, {
      title: data.title,
      start: new Date(data.start),
      end: new Date(data.end),
      allDay: data.allDay,
      type: data.type || CalendarEventType.TASK,
      color: data.color || null,
      status: 'confirmed',
      description: null,
      trackerArtifactId: null,
      trackerArtifactType: null,
      externalId: null,
      externalProvider: null,
      etag: null,
      externalMetadata: null
    })

    revalidatePath('/')
    return { success: true, event }
  } catch (error) {
    console.error('Failed to create calendar event:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create event' }
  }
}

export async function updateCalendarEventAction(
  id: string,
  data: {
    title?: string
    start?: string
    end?: string
    allDay?: boolean
    color?: string
  }
) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const existing = await db.calendarEvent.findUnique({
      where: { id }
    })
    if (!existing || existing.userId !== user.id) {
      return { success: false, error: 'Event not found or unauthorized' }
    }

    const updated = await CalendarService.updateEvent(id, {
      title: data.title,
      start: data.start ? new Date(data.start) : undefined,
      end: data.end ? new Date(data.end) : undefined,
      allDay: data.allDay,
      color: data.color,
    })

    revalidatePath('/')
    return { success: true, event: updated }
  } catch (error) {
    console.error('Failed to update calendar event:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update event' }
  }
}

export async function deleteCalendarEventAction(id: string) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const existing = await db.calendarEvent.findUnique({
      where: { id }
    })
    if (!existing || existing.userId !== user.id) {
      return { success: false, error: 'Event not found or unauthorized' }
    }

    await CalendarService.deleteEvent(id)

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete calendar event:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete event' }
  }
}
