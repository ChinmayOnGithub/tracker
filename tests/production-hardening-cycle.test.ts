import { describe, it, expect, mock, beforeEach } from 'bun:test'
import {
  getUserSettingsAction,
  saveUserAppearanceAction,
  saveWeeklyGoalAction,
  saveDashboardConfigAction,
  getGuestPermissionsAction,
} from '@/app/actions/settings'
import { createNote } from '@/app/actions/note'
import { db } from '@/lib/db'
import { Prisma, UserSetting, Note } from '@prisma/client'

describe('Tracker Production Hardening & Reliability Suite (#6, #13, #14, #15, #16, #24, #30)', () => {
  const userA = 'user-alice-hardening'

  beforeEach(() => {
    mock.module('next/cache', () => ({
      revalidatePath: () => {},
    }))
    mock.module('@/app/actions/auth', () => ({
      getLoggedUser: () => Promise.resolve({ id: userA, username: 'alice', email: 'alice@example.com', accessLevel: 'OWNER' }),
    }))
  })

  it('Issue #6 & #13: User Settings Authority isolates appearance and weekly goal per account', async () => {
    const store: Record<string, UserSetting> = {}

    db.userSetting.findUnique = mock((args?: { where?: { userId_module?: { userId: string; module: string } } }) => {
      const key = `${args?.where?.userId_module?.userId}_${args?.where?.userId_module?.module}`
      return Promise.resolve(store[key] || null)
    }) as unknown as typeof db.userSetting.findUnique

    db.userSetting.findMany = mock((args?: { where?: { userId?: string } }) => {
      const uId = args?.where?.userId || userA
      return Promise.resolve(Object.values(store).filter(s => s.userId === uId))
    }) as unknown as typeof db.userSetting.findMany

    db.userSetting.upsert = mock((args?: {
      where?: { userId_module?: { userId: string; module: string } }
      update?: { config?: Prisma.InputJsonValue }
      create?: { userId: string; module: string; config: Prisma.InputJsonValue }
    }) => {
      const uId = args?.where?.userId_module?.userId || userA
      const mod = args?.where?.userId_module?.module || 'APPEARANCE'
      const key = `${uId}_${mod}`
      const rec: UserSetting = {
        id: `setting-${key}`,
        userId: uId,
        module: mod,
        config: (args?.update?.config ?? args?.create?.config) as Prisma.JsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      store[key] = rec
      return Promise.resolve(rec)
    }) as unknown as typeof db.userSetting.upsert

    // 1. Save Alice's appearance
    const appRes = await saveUserAppearanceAction({ accent: 'emerald', fontSize: 'lg' })
    expect(appRes.success).toBe(true)

    // 2. Save Alice's weekly work hours goal
    const goalRes = await saveWeeklyGoalAction(40)
    expect(goalRes.success).toBe(true)

    expect(store[`${userA}_APPEARANCE`]).toBeDefined()
    expect(store[`${userA}_WORK_HOURS`]).toBeDefined()
    expect((store[`${userA}_WORK_HOURS`].config as { weeklyGoal: number }).weeklyGoal).toBe(40)

    // 3. Verify getUserSettingsAction loads settings correctly
    const loadedSettings = await getUserSettingsAction()
    expect(loadedSettings.success).toBe(true)
    expect(loadedSettings.settings?.appearance?.accent).toBe('emerald')
    expect(loadedSettings.settings?.weeklyGoal).toBe(40)
  })

  it('Issue #14: Dashboard configuration single source of truth in database', async () => {
    let savedConfig: unknown = null

    db.userSetting.upsert = mock((args?: { update?: { config?: unknown } }) => {
      savedConfig = args?.update?.config
      return Promise.resolve({} as UserSetting)
    }) as unknown as typeof db.userSetting.upsert

    const res = await saveDashboardConfigAction({
      hidden: ['recentDocuments', 'leaveBalance'],
    })
    expect(res.success).toBe(true)
    expect(savedConfig).toEqual({
      hidden: ['recentDocuments', 'leaveBalance'],
    })
  })

  it('Issue #24 & #30: Note creation uses idempotent upsert to prevent UniqueConstraintViolation', async () => {
    mock.module('@/lib/auth-guards', () => ({
      requireAuth: () => Promise.resolve({ id: userA, username: 'alice' }),
      requireOwnership: () => Promise.resolve({ user: { id: userA, username: 'alice' } }),
    }))

    const { EntitlementService } = await import('@/lib/services/EntitlementService')
    const origHasFeature = EntitlementService.hasFeature
    EntitlementService.hasFeature = async () => true

    let upsertCalledWith: unknown = null
    db.note.upsert = mock((args?: unknown) => {
      upsertCalledWith = args
      return Promise.resolve({
        id: 'note-1',
        userId: userA,
        date: '2026-09-08',
        content: '<p>Updated content</p>',
        title: 'Work Summary',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as Note)
    }) as unknown as typeof db.note.upsert

    try {
      const noteRes = await createNote('<p>Updated content</p>', 'Work Summary', '2026-09-08')
      expect(noteRes.success).toBe(true)
      expect(upsertCalledWith).toBeDefined()
      const args = upsertCalledWith as {
        where: { userId_date: { userId: string; date: string } }
        update: { content: string }
        create: { content: string }
      }
      expect(args.where.userId_date.userId).toBe(userA)
      expect(args.where.userId_date.date).toBe('2026-09-08')
    } finally {
      EntitlementService.hasFeature = origHasFeature
    }
  })

  it('Issue #30: Guest permissions action scopes to authenticated owner', async () => {
    let queryWhere: unknown = null
    db.userSetting.findUnique = mock((args?: { where?: unknown }) => {
      queryWhere = args?.where
      return Promise.resolve({
        id: 'gp-1',
        userId: userA,
        module: 'GUEST_PERMISSIONS',
        config: { today: true, calendar: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserSetting)
    }) as unknown as typeof db.userSetting.findUnique

    const res = await getGuestPermissionsAction()
    expect(res.success).toBe(true)
    expect(res.permissions?.today).toBe(true)
    expect(queryWhere).toBeDefined()
    const qw = queryWhere as { userId_module: { userId: string; module: string } }
    expect(qw.userId_module.userId).toBe(userA)
    expect(qw.userId_module.module).toBe('GUEST_PERMISSIONS')
  })
})
