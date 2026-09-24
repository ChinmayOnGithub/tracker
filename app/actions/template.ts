"use server"

import { db } from '@/lib/db'
import { Prisma, RecurrenceType, ActivityType, Priority, CalendarProvider, ActivityTemplate } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { CalendarService } from '@/modules/calendar/services/CalendarService'
import { eventBus, EVENTS } from '@/lib/events'
import { requireAuth, requireOwnership, requireModuleAccess } from '@/lib/auth-guards'
import { createTemplateSchema, updateTemplateSchema } from '@/lib/validations'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { QuotaService } from '@/lib/services/QuotaService'
import { QuotaExceededError } from '@/lib/errors'

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
  scheduledTime?: string | null
}) {
  const parsed = createTemplateSchema.safeParse(data)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    const user = await requireModuleAccess('activities')

    const isTask = data.recurrenceType === 'one_time'

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

    const templateCreateData = {
      ...templateRest,
      recurrenceType: recurrenceType as RecurrenceType,
      targetDate: parsedTargetDate,
      effectiveFrom: parsedTargetDate || new Date(),
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
    }

    let created: ActivityTemplate

    if (isTask) {
      // 1. Task creation: enforce tasks_created_daily creation quota race-safely inside a transaction
      const taskLimit = await EntitlementService.getLimit(user.id, 'tasks_created_daily')
      try {
        created = await db.$transaction(async (tx) => {
          await QuotaService.consumeDailyQuota(tx, user.id, 'tasks_created_daily', taskLimit)
          return tx.activityTemplate.create({
            data: templateCreateData,
          })
        })
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return {
            success: false,
            code: 'QUOTA_EXCEEDED',
            error: err.message,
          }
        }
        throw err
      }
    } else {
      // 2. Activity creation: enforce activities_active active-resource limit
      const activityLimit = await EntitlementService.getLimit(user.id, 'activities_active')
      const activeCount = await db.activityTemplate.count({
        where: {
          userId: user.id,
          isActive: true,
          deletedAt: null,
          recurrenceType: { not: 'one_time' },
        },
      })
      if (activeCount >= activityLimit) {
        const plan = (await EntitlementService.getEntitlements(user.id)).plan
        const isPro = plan !== 'FREE'
        return {
          success: false,
          code: 'QUOTA_EXCEEDED',
          error: isPro
            ? `You have reached the activity limit for your ${plan} plan (${activityLimit} active activities).`
            : `Free plan limit reached (${activityLimit} active activities). Upgrade to Pro for more.`,
        }
      }

      created = await db.activityTemplate.create({
        data: templateCreateData,
      })
    }

    // Auto-schedule task in calendar if it has a scheduledTime
    await syncTemplateToCalendarEvent(created)

    eventBus.publish(EVENTS.ACTIVITY_CREATED, { template: created, userId: user.id })

    try {
      revalidatePath('/')
    } catch {}
    return { success: true, data: created }
  } catch (error) {
    console.error('Failed to create template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const code = (error as { code?: string })?.code || 'UNEXPECTED_ERROR'
    return { success: false, code, error: message }
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
    scheduledTime?: string | null
  }
) {
  const parsed = updateTemplateSchema.safeParse(data)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    await requireModuleAccess('activities')
    const { user, record: existing } = await requireOwnership<ActivityTemplate>('activityTemplate', id)

    // If activating an activity, verify capacity under activities_active limit
    if (data.isActive === true) {
      if (existing && !existing.isActive && existing.recurrenceType !== 'one_time') {
        const activityLimit = await EntitlementService.getLimit(user.id, 'activities_active')
        const activeCount = await db.activityTemplate.count({
          where: {
            userId: user.id,
            isActive: true,
            deletedAt: null,
            recurrenceType: { not: 'one_time' },
          },
        })
        if (activeCount >= activityLimit) {
          const plan = (await EntitlementService.getEntitlements(user.id)).plan
          const isPro = plan !== 'FREE'
          return {
            success: false,
            code: 'QUOTA_EXCEEDED',
            error: isPro
              ? `You have reached the activity limit for your ${plan} plan (${activityLimit} active activities).`
              : `Free plan limit reached (${activityLimit} active activities). Upgrade to Pro for more.`,
          }
        }
      }
    }

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

    const { count } = await db.activityTemplate.updateMany({
      where: {
        id,
        deletedAt: null,
        OR: [
          { userId: user.id },
          ...(user.isOwner ? [{ userId: null }] : [])
        ]
      },
      data: {
        ...templateRest,
        recurrenceType: recurrenceType ? (recurrenceType as RecurrenceType) : undefined,
        targetDate: recurrenceType === 'one_time' && rest.targetDate ? new Date(rest.targetDate) : undefined,
        metadata: templateRest.metadata as Prisma.InputJsonValue,
        notificationRules: templateRest.notificationRules as Prisma.InputJsonValue,
      },
    })

    if (count === 0) {
      return { success: false, error: 'Template not found' }
    }

    if (tagsUpdate) {
      await db.activityTemplate.update({
        where: { id },
        data: { tags: tagsUpdate }
      })
    }

    const updated = await db.activityTemplate.findUnique({ where: { id } })
    if (!updated) throw new Error('Failed to retrieve updated template')

    // Auto-schedule/unschedule task in calendar on update
    await syncTemplateToCalendarEvent(updated)

    eventBus.publish(EVENTS.ACTIVITY_UPDATED, { template: updated, userId: user.id })

    try {
      revalidatePath('/')
    } catch {}
    return { success: true }
  } catch (error) {
    console.error('Failed to update template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteActivityTemplate(id: string) {
  try {
    await requireModuleAccess('activities')
    const { user, record: existing } = await requireOwnership<ActivityTemplate>('activityTemplate', id)

    const { count } = await db.activityTemplate.updateMany({
      where: {
        id,
        deletedAt: null,
        OR: [
          { userId: user.id },
          ...(user.isOwner ? [{ userId: null }] : [])
        ]
      },
      data: {
        deletedAt: new Date(),
        isActive: false
      }
    })

    if (count === 0) {
      return { success: false, error: 'Template not found' }
    }

    eventBus.publish(EVENTS.ACTIVITY_DELETED, { calendarEventId: existing.calendarEventId, userId: user.id })

    try {
      revalidatePath('/')
    } catch {}
    return { success: true }
  } catch (error) {
    console.error('Failed to delete template:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function duplicateActivityTemplate(id: string) {
  try {
    const { record: original, user } = await requireOwnership<ActivityTemplate>('activityTemplate', id)

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
        metadata: (original.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: nextSortOrder,
        userId: user.id,
        tags: {
          connect: originalWithTags?.tags.map(t => ({ id: t.id })) || [],
        },
      },
    })

    try {
      revalidatePath('/')
    } catch {}
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
          ...(user.isOwner ? [{ userId: null }] : [])
        ]
      }
    })

    if (validCount !== orderedIds.length) {
      throw new Error('Unauthorized template access or template not found')
    }

    // Fetch all current templates and their sortOrders
    const currentTemplates = await db.activityTemplate.findMany({
      where: { id: { in: orderedIds } },
      select: { id: true, sortOrder: true }
    })

    // Map new positions and filter to only those that actually changed
    const updates = orderedIds.map((id, index) => {
      const match = currentTemplates.find(t => t.id === id)
      if (match && match.sortOrder === index) {
        return null
      }
      return db.activityTemplate.updateMany({
        where: {
          id,
          deletedAt: null,
          OR: [
            { userId: user.id },
            ...(user.isOwner ? [{ userId: null }] : [])
          ]
        },
        data: { sortOrder: index },
      })
    }).filter((u): u is ReturnType<typeof db.activityTemplate.updateMany> => u !== null)

    // Perform updates in a transaction only if there are actual changes
    if (updates.length > 0) {
      await db.$transaction(updates)
    }

    try {
      revalidatePath('/')
    } catch {}
    return { success: true }
  } catch (error) {
    console.error('Failed to reorder templates:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Automatically schedules or unschedules a task template in the local CalendarEvent mapping
 * based on whether it has a definite time of day parameter (`scheduledTime`).
 */
async function syncTemplateToCalendarEvent(template: ActivityTemplate) {
  if (template.type !== 'TASK') {
    return
  }

  if (!template.scheduledTime) {
    if (template.userId) {
      await CalendarService.unscheduleTask(template.userId, template.id)
    }
    return
  }

  // Parse time e.g. "14:30"
  const [hours, minutes] = template.scheduledTime.split(':').map(Number)
  
  // Use targetDate or default to current date
  const targetDate = template.targetDate || new Date()
  const start = new Date(targetDate)
  start.setHours(hours, minutes, 0, 0)

  const duration = template.estimatedDuration || 30
  const end = new Date(start.getTime() + duration * 60 * 1000)

  await CalendarService.scheduleTask(
    template.userId || '',
    template.id,
    template.name,
    start,
    end,
    template.color
  )
}
