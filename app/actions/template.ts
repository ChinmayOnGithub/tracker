"use server"

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { getLoggedUser } from './auth'

/**
 * Helper to check if a user is logged in and returns their profile.
 */
async function getAuthSession() {
  const user = await getLoggedUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Checks if a template is owned by the current user.
 */
async function verifyTemplateOwnership(templateId: string, user: { id: string; username: string }) {
  const template = await db.activityTemplate.findUnique({
    where: { id: templateId }
  })
  if (!template) {
    throw new Error('Activity template not found')
  }
  const isOwner = template.userId === user.id || (template.userId === null && user.username === 'admin')
  if (!isOwner) {
    throw new Error('Unauthorized template access')
  }
  return template
}

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
    const user = await getAuthSession()
    const { tagNames = [], ...rest } = data

    // Get the maximum sortOrder for this user to put this at the end
    const maxSortOrder = await db.activityTemplate.aggregate({
      where: { userId: user.id },
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
    const user = await getAuthSession()
    await verifyTemplateOwnership(id, user)
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
    const user = await getAuthSession()
    await verifyTemplateOwnership(id, user)

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
    const user = await getAuthSession()
    const original = await verifyTemplateOwnership(id, user)

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
    const user = await getAuthSession()

    // Verify ownership of all templates being reordered
    await Promise.all(orderedIds.map(id => verifyTemplateOwnership(id, user)))

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
