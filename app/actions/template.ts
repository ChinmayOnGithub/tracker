"use server"

import { db } from '@/lib/db'
import { Prisma, RecurrenceType, ActivityType, Priority, CalendarProvider } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import { eventBus, EVENTS } from '@/lib/events'

import { requireAuth, requireOwnership } from '@/lib/auth-guards'

export async function createActivityTemplate(data: {
  name: string
  category: string
  type?: ActivityType
  priority?: Priority
  estimatedDuration?: number
  energyRequired?: string
  calendarProvider?: CalendarProvider
  calendarEventId?: string | null
  notificationRules?: unknown
  icon: string
  color: string
  notes?: string | null
  amount?: number | null
  recurrenceType: string
  recurrenceInterval?: number | null
  recurrenceDaysOfWeek?: string | null
  recurrenceDayOfMonth?: number | null
  recurrenceMonth?: number | null
  targetDate?: string | null
  remindBeforeDays?: number | null
  tagNames?: string[]
  metadata?: unknown
}) {
  try {
    const user = await requireAuth()
    const { tagNames = [], ...rest } = data

    // Get the maximum sortOrder for this user to put this at the end
    const maxSortOrder = await db.activityTemplate.aggregate({
      where: { userId: user.id },
      _max: {
        sortOrder: true,
      },
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1

    const { recurrenceType, targetDate, ...templateRest } = rest

    // For one_time tasks, if no targetDate is passed, default to current date
    const parsedTargetDate = targetDate
      ? new Date(targetDate)
      : (recurrenceType === 'one_time' ? new Date() : null)

    const created = await db.activityTemplate.create({
      data: {
        ...templateRest,
        recurrenceType: recurrenceType as RecurrenceType,
        targetDate: parsedTargetDate,
        metadata: templateRest.metadata as Prisma.InputJsonValue,
        notificationRules: templateRest.notificationRules as Prisma.InputJsonValue,
        sortOrder: nextSortOrder,
        userId: user.id,
        tags: {
          connectOrCreate: tagNames.map(name => {
            const normalized = name.trim().toLowerCase()
            return {
              where: { name: normalized },
              create: { name: normalized, color: 'zinc' },
            }
          }),
        },
      },
    })

    eventBus.publish(EVENTS.ACTIVITY_CREATED, { template: created, userId: user.id })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to create template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateActivityTemplate(
  id: string,
  data: {
    name?: string
    category?: string
    type?: ActivityType
    priority?: Priority
    estimatedDuration?: number
    energyRequired?: string
    calendarProvider?: CalendarProvider
    calendarEventId?: string | null
    notificationRules?: unknown
    icon?: string
    color?: string
    isActive?: boolean
    notes?: string | null
    amount?: number | null
    recurrenceType?: string
    recurrenceInterval?: number | null
    recurrenceDaysOfWeek?: string | null
    recurrenceDayOfMonth?: number | null
    recurrenceMonth?: number | null
    targetDate?: string | null
    remindBeforeDays?: number | null
    tagNames?: string[]
    metadata?: unknown
  }
) {
  try {
    const { user } = await requireOwnership('activityTemplate', id)
    const { tagNames, ...rest } = data

    // If tagNames are provided, reset tags connection
    const tagsUpdate = tagNames
      ? {
          set: [], // Disconnect old tags
          connectOrCreate: tagNames.map(name => {
            const normalized = name.trim().toLowerCase()
            return {
              where: { name: normalized },
              create: { name: normalized, color: 'zinc' },
            }
          }),
        }
      : undefined

    const { recurrenceType, ...templateRest } = rest

    const updated = await db.activityTemplate.update({
      where: { id },
      data: {
        ...templateRest,
        ...(recurrenceType !== undefined && { recurrenceType: recurrenceType as RecurrenceType }),
        metadata: templateRest.metadata !== undefined ? (templateRest.metadata as Prisma.InputJsonValue) : undefined,
        notificationRules: templateRest.notificationRules !== undefined ? (templateRest.notificationRules as Prisma.InputJsonValue) : undefined,
        ...(tagsUpdate && { tags: tagsUpdate }),
      },
    })

    eventBus.publish(EVENTS.ACTIVITY_UPDATED, { template: updated, userId: user.id })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to update template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteActivityTemplate(id: string) {
  try {
    const { user } = await requireOwnership('activityTemplate', id)

    const deleted = await db.activityTemplate.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false
      }
    })

    eventBus.publish(EVENTS.ACTIVITY_DELETED, { calendarEventId: deleted.calendarEventId, userId: user.id })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function duplicateActivityTemplate(id: string) {
  try {
    const { record: original, user } = await requireOwnership('activityTemplate', id)

    const maxSortOrder = await db.activityTemplate.aggregate({
      where: { userId: user.id },
      _max: {
        sortOrder: true,
      },
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1

    // Fetch tags separately to reconnect them
    const originalWithTags = await db.activityTemplate.findUnique({
      where: { id },
      include: { tags: true }
    })

    await db.activityTemplate.create({
      data: {
        name: `${original.name} (Copy)`,
        category: original.category,
        icon: original.icon,
        color: original.color,
        notes: original.notes,
        amount: original.amount,
        recurrenceType: original.recurrenceType,
        recurrenceInterval: original.recurrenceInterval,
        recurrenceDaysOfWeek: original.recurrenceDaysOfWeek,
        recurrenceDayOfMonth: original.recurrenceDayOfMonth,
        recurrenceMonth: original.recurrenceMonth,
        targetDate: original.targetDate,
        remindBeforeDays: original.remindBeforeDays,
        metadata: original.metadata ?? undefined,
        sortOrder: nextSortOrder,
        userId: user.id,
        tags: {
          connect: originalWithTags?.tags.map(t => ({ id: t.id })) || [],
        },
      },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to duplicate template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function reorderActivityTemplates(orderedIds: string[]) {
  try {
    const user = await requireAuth()

    // Verify ownership of all templates being reordered in a single bulk count query
    const validCount = await db.activityTemplate.count({
      where: {
        id: { in: orderedIds },
        OR: [
          { userId: user.id },
          ...(user.username === 'admin' ? [{ userId: null }] : [])
        ]
      }
    })

    if (validCount !== orderedIds.length) {
      throw new Error('Unauthorized template access or template not found')
    }

    // Perform updates in a transaction
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.activityTemplate.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    )

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to reorder templates:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
