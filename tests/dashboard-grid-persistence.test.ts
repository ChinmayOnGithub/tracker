import { describe, it, expect, mock } from 'bun:test'
import {
  getUserSettingsAction,
  saveDashboardConfigAction,
} from '@/app/actions/settings'
import { db } from '@/lib/db'
import { Prisma, UserSetting } from '@prisma/client'
import { DashboardConfig } from '@/lib/dashboard/types'
import { migrateAndNormalizeDashboardConfig } from '@/lib/dashboard/layoutEngine'

describe('Dashboard Grid Persistence & Account Isolation Tests (Issue #14 & #17)', () => {
  const userA = 'user-alice-111'
  const userB = 'user-bob-222'

  it('saves and loads 20-column versioned DashboardConfig for User A', async () => {
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () => Promise.resolve({ id: userA, username: 'alice', accessLevel: 'OWNER' }),
    }))

    const customDashboard: DashboardConfig = {
      version: 2,
      items: [
        { id: 'tasks', x: 0, y: 0, w: 13, h: 8 },
        { id: 'workHours', x: 13, y: 0, w: 7, h: 5 },
        { id: 'journal', x: 13, y: 5, w: 7, h: 3 },
      ],
      hidden: ['recentDocuments', 'leetcodePOTD'],
      order: ['tasks', 'workHours', 'journal'],
    }

    let persistedConfig: unknown = null
    db.userSetting.upsert = mock((args?: { update?: { config?: Prisma.InputJsonValue } }) => {
      persistedConfig = args?.update?.config
      return Promise.resolve({} as UserSetting)
    }) as unknown as typeof db.userSetting.upsert

    const saveRes = await saveDashboardConfigAction(customDashboard)
    expect(saveRes.success).toBe(true)
    expect((persistedConfig as DashboardConfig).version).toBe(2)
    expect((persistedConfig as DashboardConfig).items.length).toBe(3)

    // Mock DB load for userA
    db.userSetting.findMany = mock(() =>
      Promise.resolve([
        {
          id: 'dash-alice',
          userId: userA,
          module: 'DASHBOARD',
          config: persistedConfig as Prisma.JsonValue,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    ) as unknown as typeof db.userSetting.findMany

    const getRes = await getUserSettingsAction()
    expect(getRes.success).toBe(true)
    expect(getRes.settings?.dashboard?.version).toBe(2)
    expect(getRes.settings?.dashboard?.items?.length).toBe(3)
  })

  it('guarantees account isolation: User A settings do not leak to User B', async () => {
    // 1. User B logs in
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () => Promise.resolve({ id: userB, username: 'bob', accessLevel: 'OWNER' }),
    }))

    // 2. User B has no stored custom settings (empty findMany result)
    db.userSetting.findMany = mock((args?: { where?: { userId?: string } }) => {
      if (args?.where?.userId === userB) {
        return Promise.resolve([])
      }
      return Promise.resolve([])
    }) as unknown as typeof db.userSetting.findMany

    const getResB = await getUserSettingsAction()
    expect(getResB.success).toBe(true)
    expect(getResB.settings?.dashboard).toBeUndefined()

    // 3. User B falls back to canonical default layout without leaking User A's custom layout
    const userBLayout = migrateAndNormalizeDashboardConfig(getResB.settings?.dashboard)
    expect(userBLayout.version).toBe(2)
    expect(userBLayout.items.some(i => i.id === 'tasks')).toBe(true)
    // Default hidden widgets are kept
    expect(userBLayout.hidden).toContain('leetcodePOTD')
    expect(userBLayout.hidden).toContain('gfgPOTD')
  })

  it('backward-compatible migration preserves legacy user orders', async () => {
    const legacyV1 = {
      order: ['weight', 'workHours', 'journal'],
      hidden: ['recentDocuments'],
    }

    const migrated = migrateAndNormalizeDashboardConfig(legacyV1)
    expect(migrated.version).toBe(2)
    expect(migrated.hidden).toEqual(['recentDocuments', 'leetcodePOTD', 'gfgPOTD'])
    expect(migrated.items.some(i => i.id === 'tasks')).toBe(true)
    expect(migrated.items.some(i => i.id === 'weight')).toBe(true)
  })
})
