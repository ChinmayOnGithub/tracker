import { describe, it, expect, mock } from 'bun:test'
import {
  getUserSettingsAction,
  saveUserAppearanceAction,
  saveWeeklyGoalAction,
  saveDashboardConfigAction,
} from '@/app/actions/settings'
import { db } from '@/lib/db'
import { Prisma, UserSetting } from '@prisma/client'

describe('Issues #6, #13, #14: User Settings Authority & Persistence Hardening', () => {
  const userA = 'user-alice-uuid'

  it('Issue #6: Appearance settings should merge cleanly and be account-scoped', async () => {
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () => Promise.resolve({ id: userA, username: 'alice', accessLevel: 'OWNER' }),
    }))

    const storedSettings: Record<string, UserSetting> = {}

    db.userSetting.findUnique = mock((args?: { where?: { userId_module?: { userId: string; module: string } } }) => {
      const key = `${args?.where?.userId_module?.userId}_${args?.where?.userId_module?.module}`
      return Promise.resolve(storedSettings[key] || null)
    }) as unknown as typeof db.userSetting.findUnique

    db.userSetting.upsert = mock((args?: {
      where?: { userId_module?: { userId: string; module: string } }
      update?: { config?: Prisma.InputJsonValue }
      create?: { userId: string; module: string; config: Prisma.InputJsonValue }
    }) => {
      const key = `${args?.where?.userId_module?.userId}_${args?.where?.userId_module?.module}`
      const record: UserSetting = {
        id: 'setting-1',
        userId: args?.where?.userId_module?.userId || userA,
        module: args?.where?.userId_module?.module || 'APPEARANCE',
        config: (args?.update?.config ?? args?.create?.config) as Prisma.JsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      storedSettings[key] = record
      return Promise.resolve(record)
    }) as unknown as typeof db.userSetting.upsert

    // 1. Save accent color
    const res1 = await saveUserAppearanceAction({ accent: 'emerald' })
    expect(res1.success).toBe(true)

    // 2. Save font size without clobbering accent color
    const res2 = await saveUserAppearanceAction({ fontSize: 'lg' })
    expect(res2.success).toBe(true)

    const key = `${userA}_APPEARANCE`
    expect(storedSettings[key]).toBeDefined()
    const savedConfig = storedSettings[key].config as Record<string, string>
    expect(savedConfig.accent).toBe('emerald')
    expect(savedConfig.fontSize).toBe('lg')
  })

  it('Issue #13: Weekly goal persistence should persist into WORK_HOURS module setting', async () => {
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () => Promise.resolve({ id: userA, username: 'alice', accessLevel: 'OWNER' }),
    }))

    let savedGoal: number | undefined

    db.userSetting.findUnique = mock(() => Promise.resolve(null)) as unknown as typeof db.userSetting.findUnique
    db.userSetting.upsert = mock((args?: { update?: { config?: unknown } }) => {
      const cfg = args?.update?.config as { weeklyGoal?: number } | undefined
      savedGoal = cfg?.weeklyGoal
      return Promise.resolve({} as UserSetting)
    }) as unknown as typeof db.userSetting.upsert

    const res = await saveWeeklyGoalAction(35)
    expect(res.success).toBe(true)
    expect(savedGoal).toBe(35)
  })

  it('Issue #14: Dashboard configuration saves and loads for authenticated account', async () => {
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () => Promise.resolve({ id: userA, username: 'alice', accessLevel: 'OWNER' }),
    }))

    const customDashboard = {
      order: ['weight', 'workHours', 'journal'],
      hidden: ['recentDocuments'],
    }

    db.userSetting.upsert = mock(() => Promise.resolve({} as UserSetting)) as unknown as typeof db.userSetting.upsert

    const saveRes = await saveDashboardConfigAction(customDashboard)
    expect(saveRes.success).toBe(true)

    // Mock loading user settings for userA
    db.userSetting.findMany = mock(() =>
      Promise.resolve([
        {
          id: 'dash-1',
          userId: userA,
          module: 'DASHBOARD',
          config: customDashboard,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    ) as unknown as typeof db.userSetting.findMany

    const getRes = await getUserSettingsAction()
    expect(getRes.success).toBe(true)
    expect(getRes.settings?.dashboard?.order).toEqual(['weight', 'workHours', 'journal'])
    expect(getRes.settings?.dashboard?.hidden).toEqual(['recentDocuments'])
  })
})
