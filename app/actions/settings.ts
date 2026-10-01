"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { canAccess, getEffectiveGuestPermissions } from '@/lib/auth-guards'
import { Prisma } from '@prisma/client'
import { DashboardConfig, LegacyDashboardConfig } from '@/lib/dashboard/types'
import { GRID_COLUMNS, WIDGET_REGISTRY } from '@/lib/dashboard/registry'
import { z } from 'zod'

const dashboardConfigUpdateSchema = z.object({
  order: z.array(z.string().min(1)).max(100).optional(),
  hidden: z.array(z.string().min(1)).max(100).optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(GRID_COLUMNS),
    h: z.number().int().min(1).max(100),
  })).max(100).optional(),
  version: z.number().int().nonnegative().optional(),
  revision: z.number().int().nonnegative().optional(),
}).superRefine((config, ctx) => {
  const seen = new Set<string>()
  for (const [index, item] of (config.items ?? []).entries()) {
    const definition = WIDGET_REGISTRY.find(widget => widget.id === item.id)
    if (!definition) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'id'], message: 'Unknown dashboard widget.' })
      continue
    }
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'id'], message: 'Duplicate dashboard widget.' })
    }
    seen.add(item.id)
    if (item.x + item.w > GRID_COLUMNS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'w'], message: 'Widget exceeds the dashboard grid.' })
    }
    if (item.w < definition.minW || item.w > definition.maxW) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'w'], message: 'Widget width is outside its allowed range.' })
    }
    if (item.h < definition.minH || item.h > definition.maxH) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'h'], message: 'Widget height is outside its allowed range.' })
    }
  }
})

export async function getGuestPermissionsAction(): Promise<{
  success: boolean
  permissions?: Record<string, boolean>
  error?: string
}> {
  try {
    const loggedUser = await getLoggedUser().catch(() => null)
    const permissions = await getEffectiveGuestPermissions(loggedUser)
    return { success: true, permissions }
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

export async function saveDashboardConfigAction(config: {
  order?: string[]
  hidden?: string[]
  items?: unknown[]
  version?: number
  revision?: number
}): Promise<{ success: boolean; error?: string; revision?: number }> {
  const parsed = dashboardConfigUpdateSchema.safeParse(config)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid dashboard configuration.' }
  }

  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) return { success: false, error: 'Unauthorized' }

    const existing = await db.userSetting.findUnique({
      where: { userId_module: { userId: loggedUser.id, module: 'DASHBOARD' } },
    })

    const existingConfig = (existing?.config as Record<string, unknown> | null) || {}
    const currentRevision = typeof existingConfig.revision === 'number' && Number.isInteger(existingConfig.revision)
      ? existingConfig.revision
      : 0
    const expectedRevision = config.revision ?? currentRevision

    if (expectedRevision !== currentRevision) {
      return {
        success: false,
        error: 'Dashboard changed in another session. Reload before saving your changes.',
        revision: currentRevision,
      }
    }

    const nextRevision = currentRevision + 1
    const { revision: _ignoredRevision, ...configWithoutRevision } = config
    const mergedConfig = { ...existingConfig, ...configWithoutRevision, revision: nextRevision }

    await db.userSetting.upsert({
      where: { userId_module: { userId: loggedUser.id, module: 'DASHBOARD' } },
      update: { config: mergedConfig as unknown as Prisma.InputJsonValue },
      create: {
        userId: loggedUser.id,
        module: 'DASHBOARD',
        config: mergedConfig as unknown as Prisma.InputJsonValue,
      },
    })

    return { success: true, revision: nextRevision }
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
    dashboard?: DashboardConfig | LegacyDashboardConfig
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
        dashboard: (dashboardRecord?.config as DashboardConfig | LegacyDashboardConfig) || undefined,
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
  const parsedGoal = z.number().finite().positive().max(168).safeParse(weeklyGoal)
  if (!parsedGoal.success) {
    return { success: false, error: 'Weekly goal must be a finite value between 0 and 168 hours.' }
  }
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


const LOGIN_SECURITY_MODULE = 'LOGIN_SECURITY'

export async function getLoginSecuritySettingsAction(): Promise<{ success: boolean; humanVerificationEnabled: boolean; error?: string }> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) return { success: false, humanVerificationEnabled: true, error: 'Unauthorized' }
    if (!canAccess(loggedUser, 'settings.manage')) return { success: false, humanVerificationEnabled: true, error: 'Forbidden' }
    const setting = await db.userSetting.findUnique({
      where: { userId_module: { userId: loggedUser.id, module: LOGIN_SECURITY_MODULE } },
    })
    const config = (setting?.config as { humanVerificationEnabled?: boolean } | null) || {}
    return { success: true, humanVerificationEnabled: config.humanVerificationEnabled !== false }
  } catch {
    return { success: false, humanVerificationEnabled: true, error: 'Database error' }
  }
}

export async function saveLoginSecuritySettingsAction(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await getLoggedUser()
    if (!loggedUser) return { success: false, error: 'Unauthorized' }
    if (!canAccess(loggedUser, 'settings.manage')) return { success: false, error: 'Forbidden: Owner access required' }
    await db.userSetting.upsert({
      where: { userId_module: { userId: loggedUser.id, module: LOGIN_SECURITY_MODULE } },
      update: { config: { humanVerificationEnabled: enabled } },
      create: { userId: loggedUser.id, module: LOGIN_SECURITY_MODULE, config: { humanVerificationEnabled: enabled } },
    })
    return { success: true }
  } catch (error) {
    console.error('Failed to save login security settings:', error)
    return { success: false, error: 'Database error saving login security settings' }
  }
}
