"use server"

import { db } from '@/lib/db'
import { getLoggedUser } from '@/app/actions/auth'
import { Prisma } from '@prisma/client'

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
