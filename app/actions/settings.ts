"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { Prisma } from '@prisma/client'

export async function getGuestPermissionsAction(): Promise<{
  success: boolean
  permissions?: Record<string, boolean>
  error?: string
}> {
  try {
    const setting = await db.userSetting.findFirst({
      where: {
        module: 'GUEST_PERMISSIONS',
      },
    })

    const defaults: Record<string, boolean> = {
      today: false,
      calendar: false,
      activities: false,
      journal: false,
      leave: false,
      weight: false,
      links: false,
      documents: false,
      settings: true,
    }

    if (!setting) {
      return { success: true, permissions: defaults }
    }

    const config = setting.config as Record<string, boolean>
    return { success: true, permissions: { ...defaults, ...config } }
  } catch (error) {
    console.error('Failed to get guest permissions:', error)
    return { success: false, error: 'Database error fetching permissions' }
  }
}

export async function saveGuestPermissionsAction(permissions: Record<string, boolean>): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const isOwner = loggedUser.username === 'admin' || loggedUser.username === 'chinmaydpatil09'
    if (!isOwner) {
      return { success: false, error: 'Forbidden: Owner access required' }
    }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId: loggedUser.id,
          module: 'GUEST_PERMISSIONS',
        },
      },
      update: {
        config: permissions as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId: loggedUser.id,
        module: 'GUEST_PERMISSIONS',
        config: permissions as unknown as Prisma.InputJsonValue,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to save guest permissions:', error)
    return { success: false, error: 'Database error saving permissions' }
  }
}

export async function saveDashboardConfigAction(config: { order: string[]; hidden: string[] }): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId: loggedUser.id,
          module: 'DASHBOARD',
        },
      },
      update: {
        config: config as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId: loggedUser.id,
        module: 'DASHBOARD',
        config: config as unknown as Prisma.InputJsonValue,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to save dashboard config:', error)
    return { success: false, error: 'Database error while saving config.' }
  }
}
