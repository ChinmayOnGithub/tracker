"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { canAccess } from '@/lib/auth-guards'
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

    if (!canAccess(loggedUser, 'settings.manage')) {
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

export async function getUserSettingsAction(): Promise<{
  success: boolean
  settings?: {
    appearance?: {
      accent?: string
      fontSize?: string
      rounded?: string
      animations?: string
    }
    weeklyGoal?: number
    dashboard?: { order: string[]; hidden: string[] }
  }
  error?: string
}> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const records = await db.userSetting.findMany({
      where: {
        userId: loggedUser.id,
        module: { in: ['APPEARANCE', 'WORK_HOURS', 'DASHBOARD'] },
      },
    })

    const appearanceRecord = records.find(r => r.module === 'APPEARANCE')
    const workHoursRecord = records.find(r => r.module === 'WORK_HOURS')
    const dashboardRecord = records.find(r => r.module === 'DASHBOARD')

    return {
      success: true,
      settings: {
        appearance: (appearanceRecord?.config as {
          accent?: string
          fontSize?: string
          rounded?: string
          animations?: string
        }) || undefined,
        weeklyGoal: (workHoursRecord?.config as { weeklyGoal?: number })?.weeklyGoal,
        dashboard: (dashboardRecord?.config as { order: string[]; hidden: string[] }) || undefined,
      },
    }
  } catch (error) {
    console.error('Failed to get user settings:', error)
    return { success: false, error: 'Database error fetching user settings' }
  }
}

export async function saveUserAppearanceAction(appearance: {
  accent?: string
  fontSize?: string
  rounded?: string
  animations?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const existing = await db.userSetting.findUnique({
      where: {
        userId_module: {
          userId: loggedUser.id,
          module: 'APPEARANCE',
        },
      },
    })

    const existingConfig = (existing?.config as Record<string, unknown>) || {}
    const mergedConfig = { ...existingConfig, ...appearance }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId: loggedUser.id,
          module: 'APPEARANCE',
        },
      },
      update: {
        config: mergedConfig as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId: loggedUser.id,
        module: 'APPEARANCE',
        config: mergedConfig as unknown as Prisma.InputJsonValue,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to save appearance settings:', error)
    return { success: false, error: 'Database error saving appearance' }
  }
}

export async function saveWeeklyGoalAction(weeklyGoal: number): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) {
      return { success: false, error: 'Unauthorized' }
    }

    const existing = await db.userSetting.findUnique({
      where: {
        userId_module: {
          userId: loggedUser.id,
          module: 'WORK_HOURS',
        },
      },
    })

    const existingConfig = (existing?.config as Record<string, unknown>) || {}
    const mergedConfig = { ...existingConfig, weeklyGoal }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId: loggedUser.id,
          module: 'WORK_HOURS',
        },
      },
      update: {
        config: mergedConfig as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId: loggedUser.id,
        module: 'WORK_HOURS',
        config: mergedConfig as unknown as Prisma.InputJsonValue,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to save weekly goal setting:', error)
    return { success: false, error: 'Database error saving weekly goal' }
  }
}
