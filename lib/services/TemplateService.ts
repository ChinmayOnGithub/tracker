import { db } from '@/lib/db'
import { Prisma, RecurrenceType } from '@prisma/client'
import { eventBus, EVENTS } from '@/lib/events'
import { CreateTemplateInput, UpdateTemplateInput } from '@/lib/validations/template'

export class TemplateService {
  /**
   * Retrieves user-owned templates with optional filtering.
   */
  public static async getUserTemplates(
    userId: string,
    options?: { activeOnly?: boolean; category?: string }
  ) {
    const where: Prisma.ActivityTemplateWhereInput = {
      userId,
      deletedAt: null,
    }

    if (options?.activeOnly !== false) {
      where.isActive = true
    }

    if (options?.category) {
      where.category = options.category
    }

    return db.activityTemplate.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        tags: {
          select: { name: true, color: true },
        },
      },
    })
  }

  /**
   * Creates an activity template for a user and emits domain events.
   */
  public static async createTemplate(userId: string, data: CreateTemplateInput) {
    const { tagNames = [], ...rest } = data

    // Max sortOrder for appending to user's list
    const maxSortOrder = await db.activityTemplate.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1

    const { recurrenceType, targetDate, ...templateRest } = rest

    const parsedTargetDate = targetDate
      ? new Date(targetDate)
      : recurrenceType === 'one_time'
      ? new Date()
      : null

    const created = await db.activityTemplate.create({
      data: {
        ...templateRest,
        recurrenceType: recurrenceType as RecurrenceType,
        targetDate: parsedTargetDate,
        effectiveFrom: parsedTargetDate || new Date(),
        metadata: templateRest.metadata as Prisma.InputJsonValue,
        notificationRules: templateRest.notificationRules as Prisma.InputJsonValue,
        sortOrder: nextSortOrder,
        userId,
        tags: {
          connectOrCreate: tagNames.map((name) => {
            const normalized = name.trim().toLowerCase()
            return {
              where: { name: normalized },
              create: { name: normalized, color: 'zinc' },
            }
          }),
        },
      },
      include: {
        tags: {
          select: { name: true, color: true },
        },
      },
    })

    eventBus.publish(EVENTS.ACTIVITY_CREATED, { template: created, userId })

    return created
  }

  /**
   * Updates an existing template with ownership verification.
   */
  public static async updateTemplate(userId: string, templateId: string, data: UpdateTemplateInput) {
    const existing = await db.activityTemplate.findUnique({
      where: { id: templateId },
    })

    if (!existing || existing.userId !== userId) {
      throw new Error('Template record not found or unauthorized')
    }

    const { tagNames, ...rest } = data

    const tagsUpdate = tagNames
      ? {
          set: [],
          connectOrCreate: tagNames.map((name) => {
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
      where: { id: templateId },
      data: {
        ...templateRest,
        recurrenceType: recurrenceType ? (recurrenceType as RecurrenceType) : undefined,
        targetDate:
          recurrenceType === 'one_time' && rest.targetDate
            ? new Date(rest.targetDate)
            : undefined,
        metadata: templateRest.metadata as Prisma.InputJsonValue,
        notificationRules: templateRest.notificationRules as Prisma.InputJsonValue,
        tags: tagsUpdate,
      },
      include: {
        tags: {
          select: { name: true, color: true },
        },
      },
    })

    eventBus.publish(EVENTS.ACTIVITY_UPDATED, { template: updated, userId })

    return updated
  }

  /**
   * Soft-deletes a template with ownership verification.
   */
  public static async deleteTemplate(userId: string, templateId: string) {
    const existing = await db.activityTemplate.findUnique({
      where: { id: templateId },
    })

    if (!existing || existing.userId !== userId) {
      throw new Error('Template record not found or unauthorized')
    }

    const deleted = await db.activityTemplate.update({
      where: { id: templateId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    eventBus.publish(EVENTS.ACTIVITY_DELETED, {
      calendarEventId: deleted.calendarEventId,
      userId,
    })

    return deleted
  }
}
