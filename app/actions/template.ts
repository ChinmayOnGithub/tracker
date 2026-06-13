"use server"

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'

export async function createActivityTemplate(data: {
  name: string
  category: string
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
    const { tagNames = [], ...rest } = data

    // Get the maximum sortOrder to put this at the end
    const maxSortOrder = await db.activityTemplate.aggregate({
      _max: {
        sortOrder: true,
      },
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1

    await db.activityTemplate.create({
      data: {
        ...rest,
        metadata: rest.metadata as Prisma.InputJsonValue,
        sortOrder: nextSortOrder,
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

    await db.activityTemplate.update({
      where: { id },
      data: {
        ...rest,
        metadata: rest.metadata !== undefined ? (rest.metadata as Prisma.InputJsonValue) : undefined,
        ...(tagsUpdate && { tags: tagsUpdate }),
      },
    })

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
    await db.activityTemplate.delete({
      where: { id },
    })
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
    const original = await db.activityTemplate.findUnique({
      where: { id },
      include: { tags: true },
    })

    if (!original) {
      throw new Error('Original template not found')
    }

    const maxSortOrder = await db.activityTemplate.aggregate({
      _max: {
        sortOrder: true,
      },
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1

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
        tags: {
          connect: original.tags.map(t => ({ id: t.id })),
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
