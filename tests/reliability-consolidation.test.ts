import { describe, it, expect, mock } from 'bun:test'
import { ActivityService } from '@/lib/services/ActivityService'
import { AuthorizationService, AuthenticatedUser } from '@/lib/services/AuthorizationService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { postponeOneTimeTask, unpostponeOneTimeTask } from '@/app/actions/log'
import { upsertJournalEntry } from '@/app/actions/journal'
import { logWeight } from '@/app/actions/weight'
import { createLeaveRequest } from '@/app/actions/leave'
import { saveUserAppearanceAction, saveWeeklyGoalAction } from '@/app/actions/settings'
import { db } from '@/lib/db'
import { ActivityLog, LeaveType, UserSetting } from '@prisma/client'

describe('Main Reliability & Atomicity Consolidation Suite (#130, #131, #132, #133, #137, #138, #140)', () => {
  const userId = 'user-test-uuid'
  const otherUserId = 'user-other-uuid'

  const testUser: AuthenticatedUser = {
    id: userId,
    username: 'testuser',
    isOwner: true,
  }

  const origRequireModuleAccess = AuthorizationService.requireModuleAccess
  const origRequireOwnership = AuthorizationService.requireOwnership
  const origHasFeature = EntitlementService.hasFeature
  const origIsPro = EntitlementService.isPro

  describe('Issue #138: ActivityService Authorization on Mutation', () => {
    it('throws when updating an existing log whose userId is null', async () => {
      const mockClient = {
        activityLog: {
          findUnique: mock(() => Promise.resolve({
            id: 'log-orphan',
            userId: null,
            activityId: 'tmpl-1',
            status: 'done',
            deletedAt: null,
          } as unknown as ActivityLog)),
          update: mock(() => Promise.resolve({} as ActivityLog)),
        }
      }

      await expect(
        ActivityService.logActivity({
          id: 'log-orphan',
          userId,
          templateId: 'tmpl-1',
          date: '2026-10-01',
          status: 'done',
        }, mockClient as unknown as Parameters<typeof ActivityService.logActivity>[1])
      ).rejects.toThrow('Log record not found or unauthorized')
    })

    it('throws when updating an existing log belonging to a different user', async () => {
      const mockClient = {
        activityLog: {
          findUnique: mock(() => Promise.resolve({
            id: 'log-other',
            userId: otherUserId,
            activityId: 'tmpl-1',
            status: 'done',
            deletedAt: null,
          } as unknown as ActivityLog)),
          update: mock(() => Promise.resolve({} as ActivityLog)),
        }
      }

      await expect(
        ActivityService.logActivity({
          id: 'log-other',
          userId,
          templateId: 'tmpl-1',
          date: '2026-10-01',
          status: 'done',
        }, mockClient as unknown as Parameters<typeof ActivityService.logActivity>[1])
      ).rejects.toThrow('Log record not found or unauthorized')
    })

    it('succeeds when updating a log matching requesting userId', async () => {
      let updatedData: Partial<ActivityLog> = {}
      const mockClient = {
        activityLog: {
          findUnique: mock(() => Promise.resolve({
            id: 'log-mine',
            userId,
            activityId: 'tmpl-1',
            status: 'pending',
            deletedAt: null,
            note: null,
            amount: null,
            payload: null,
            weightRecordId: null,
            leaveRecordId: null,
            journalEntryId: null,
            workSessionId: null,
          } as unknown as ActivityLog)),
          update: mock((args: { data: Partial<ActivityLog> }) => {
            updatedData = args.data
            return Promise.resolve({ id: 'log-mine', userId, status: args.data.status ?? 'done' } as ActivityLog)
          }),
        }
      }

      const res = await ActivityService.logActivity({
        id: 'log-mine',
        userId,
        templateId: 'tmpl-1',
        date: '2026-10-01',
        status: 'done',
      }, mockClient as unknown as Parameters<typeof ActivityService.logActivity>[1])

      expect(res.status).toBe('done')
      expect(updatedData?.deletedAt).toBe(null)
    })
  })

  describe('Issue #137: Restore Soft-Deleted Journal-Linked ActivityLog', () => {
    it('sets deletedAt: null when updating an existing soft-deleted log', async () => {
      let updatedPayload: Partial<ActivityLog> = {}
      const mockClient = {
        activityLog: {
          findUnique: mock(() => null),
          findFirst: mock(() => Promise.resolve({
            id: 'log-soft-deleted',
            userId,
            activityId: 'tmpl-journal',
            journalEntryId: 'entry-1',
            deletedAt: new Date('2026-09-30T10:00:00Z'),
            status: 'done',
            note: 'Old note',
            amount: null,
            payload: null,
            weightRecordId: null,
            leaveRecordId: null,
            workSessionId: null,
          } as unknown as ActivityLog)),
          update: mock((args: { data: Partial<ActivityLog> }) => {
            updatedPayload = args.data
            return Promise.resolve({ id: 'log-soft-deleted', ...args.data } as ActivityLog)
          }),
        }
      }

      await ActivityService.logActivity({
        userId,
        templateId: 'tmpl-journal',
        date: '2026-10-01',
        status: 'done',
        journalEntryId: 'entry-1',
        note: 'New journal note',
      }, mockClient as unknown as Parameters<typeof ActivityService.logActivity>[1])

      expect(updatedPayload).toBeDefined()
      expect(updatedPayload?.deletedAt).toBe(null)
      expect(updatedPayload?.note).toBe('New journal note')
    })
  })

  describe('Issue #131: Journal Save reports failure when ActivityLog sync fails', () => {
    it('rolls back journal upsert if ActivityLog sync throws', async () => {
      AuthorizationService.requireModuleAccess = mock(() => Promise.resolve(testUser))
      AuthorizationService.requireOwnership = (mock(() => Promise.resolve({ user: testUser, record: {} }))) as unknown as typeof AuthorizationService.requireOwnership
      EntitlementService.hasFeature = mock(() => Promise.resolve(true))
      EntitlementService.isPro = mock(() => Promise.resolve(true))

      let transactionRolledBack = false
      const origTransaction = db.$transaction

      db.$transaction = (async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        try {
          const fakeTx = {
            journalEntry: {
              findFirst: () => Promise.resolve(null),
              create: () => Promise.resolve({ id: 'j-entry-1', content: 'My Day' }),
            },
            activityTemplate: {
              findFirst: () => Promise.resolve({ id: 'tmpl-journal', userId }),
            },
            activityLog: {
              findUnique: () => Promise.resolve(null),
              findFirst: () => Promise.resolve(null),
              create: () => {
                throw new Error('Database connection dropped during ActivityLog write')
              }
            }
          }
          return await callback(fakeTx)
        } catch (err) {
          transactionRolledBack = true
          throw err
        }
      }) as unknown as typeof db.$transaction

      try {
        const result = await upsertJournalEntry('2026-10-01', { content: 'My Day' })
        expect(result.success).toBe(false)
        expect(result.error).toContain('Database connection dropped')
        expect(transactionRolledBack).toBe(true)
      } finally {
        db.$transaction = origTransaction
        AuthorizationService.requireModuleAccess = origRequireModuleAccess
        AuthorizationService.requireOwnership = origRequireOwnership
        EntitlementService.hasFeature = origHasFeature
        EntitlementService.isPro = origIsPro
      }
    })
  })

  describe('Issue #132: Weight Record & ActivityLog Atomicity', () => {
    it('rolls back weightRecord creation if ActivityLog write fails', async () => {
      AuthorizationService.requireModuleAccess = mock(() => Promise.resolve(testUser))
      AuthorizationService.requireOwnership = (mock(() => Promise.resolve({ user: testUser, record: {} }))) as unknown as typeof AuthorizationService.requireOwnership
      EntitlementService.isPro = mock(() => Promise.resolve(true))

      let rolledBack = false
      const origTransaction = db.$transaction

      db.$transaction = (async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        try {
          const fakeTx = {
            weightRecord: {
              findFirst: () => Promise.resolve(null),
              create: () => Promise.resolve({ id: 'weight-1', weight: 75.5 }),
            },
            activityTemplate: {
              findFirst: () => Promise.resolve({ id: 'tmpl-weight', userId }),
            },
            activityLog: {
              findUnique: () => Promise.resolve(null),
              findFirst: () => Promise.resolve(null),
              create: () => {
                throw new Error('Constraint violation on activity log insert')
              }
            }
          }
          return await callback(fakeTx)
        } catch (err) {
          rolledBack = true
          throw err
        }
      }) as unknown as typeof db.$transaction

      try {
        const res = await logWeight('2026-10-01', 75.5)
        expect(res.success).toBe(false)
        expect(res.error).toBeDefined()
        expect(rolledBack).toBe(true)
      } finally {
        db.$transaction = origTransaction
        AuthorizationService.requireModuleAccess = origRequireModuleAccess
        AuthorizationService.requireOwnership = origRequireOwnership
        EntitlementService.isPro = origIsPro
      }
    })
  })

  describe('Issue #133: Leave Record & Daily ActivityLogs Atomicity', () => {
    it('rolls back leaveRecord if a subsequent daily log fails in multi-day leave', async () => {
      AuthorizationService.requireModuleAccess = mock(() => Promise.resolve(testUser))
      AuthorizationService.requireOwnership = (mock(() => Promise.resolve({ user: testUser, record: {} }))) as unknown as typeof AuthorizationService.requireOwnership

      let leaveRecordCreated = false
      let rolledBack = false
      const origTransaction = db.$transaction

      db.$transaction = (async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        try {
          let dayCount = 0
          const fakeTx = {
            leaveRecord: {
              findFirst: () => Promise.resolve(null),
              create: () => {
                leaveRecordCreated = true
                return Promise.resolve({
                  id: 'leave-123',
                  userId,
                  startDate: new Date('2026-10-01T00:00:00Z'),
                  endDate: new Date('2026-10-03T00:00:00Z'),
                  type: 'CASUAL' as LeaveType,
                  totalDays: 3,
                })
              }
            },
            activityTemplate: {
              findFirst: () => Promise.resolve({ id: 'tmpl-leave', userId }),
            },
            activityLog: {
              findUnique: () => Promise.resolve(null),
              findFirst: () => Promise.resolve(null),
              create: () => {
                dayCount++
                if (dayCount === 2) {
                  throw new Error('Mid-flight failure on day 2 of leave creation')
                }
                return Promise.resolve({ id: `log-day-${dayCount}`, userId })
              }
            }
          }
          return await callback(fakeTx)
        } catch (err) {
          rolledBack = true
          throw err
        }
      }) as unknown as typeof db.$transaction

      try {
        const res = await createLeaveRequest({
          leaveType: 'CASUAL',
          startDate: '2026-10-01',
          endDate: '2026-10-03',
          totalDays: 3,
          notes: 'Trip',
        })
        expect(res.success).toBe(false)
        expect(res.error).toBeDefined()
        expect(leaveRecordCreated).toBe(true)
        expect(rolledBack).toBe(true)
      } finally {
        db.$transaction = origTransaction
        AuthorizationService.requireModuleAccess = origRequireModuleAccess
        AuthorizationService.requireOwnership = origRequireOwnership
      }
    })
  })

  describe('Issue #130: Task Postpone and Unpostpone Atomicity', () => {
    it('postpones one-time task and updates targetDate atomically', async () => {
      AuthorizationService.requireOwnership = (mock(() => Promise.resolve({
        user: testUser,
        record: { id: 'task-1', targetDate: new Date('2026-10-01T12:00:00Z') } as unknown as Record<string, unknown>
      }))) as unknown as typeof AuthorizationService.requireOwnership

      let updatedTemplateTargetDate = new Date(0)
      let logCreatedWithStatus = ''
      const origTransaction = db.$transaction

      db.$transaction = (async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const fakeTx = {
          activityLog: {
            findUnique: () => Promise.resolve(null),
            findFirst: () => Promise.resolve(null),
            create: (args: { data: { status: string } }) => {
              logCreatedWithStatus = args.data.status
              return Promise.resolve({ id: 'log-postponed', ...args.data })
            },
          },
          activityTemplate: {
            update: (args: { data: { targetDate: Date } }) => {
              updatedTemplateTargetDate = args.data.targetDate
              return Promise.resolve({ id: 'task-1', targetDate: args.data.targetDate })
            }
          }
        }
        return await callback(fakeTx)
      }) as unknown as typeof db.$transaction

      try {
        const res = await postponeOneTimeTask('task-1', '2026-10-01')
        expect(res.success).toBe(true)
        expect(res.nextDate).toBe('2026-10-02')
        expect(logCreatedWithStatus).toBe('postponed')
        expect(updatedTemplateTargetDate?.toISOString()).toContain('2026-10-02')
      } finally {
        db.$transaction = origTransaction
        AuthorizationService.requireOwnership = origRequireOwnership
      }
    })

    it('unpostpones one-time task and reverts targetDate atomically', async () => {
      AuthorizationService.requireOwnership = (mock(() => Promise.resolve({
        user: testUser,
        record: { id: 'task-1', targetDate: new Date('2026-10-02T12:00:00Z') } as unknown as Record<string, unknown>
      }))) as unknown as typeof AuthorizationService.requireOwnership

      const origDeleteLog = ActivityService.deleteLog
      let softDeletedLogId = ''
      let revertedTargetDate = new Date(0)
      const origTransaction = db.$transaction

      ActivityService.deleteLog = mock(async (_uId: string, logId: string, client?: unknown) => {
        softDeletedLogId = logId
        const txClient = client as { activityLog?: { update?: (args: { where: { id: string }; data: { deletedAt: Date } }) => Promise<unknown> } }
        if (txClient?.activityLog?.update) {
          await txClient.activityLog.update({ where: { id: logId }, data: { deletedAt: new Date() } })
        }
      }) as unknown as typeof ActivityService.deleteLog

      db.$transaction = (async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const fakeTx = {
          activityLog: {
            findUnique: () => Promise.resolve({ id: 'log-postponed', userId, deletedAt: null }),
            update: (args: { where: { id: string } }) => {
              softDeletedLogId = args.where.id
              return Promise.resolve({ id: args.where.id, deletedAt: new Date() })
            },
            updateMany: () => Promise.resolve({ count: 1 })
          },
          activityTemplate: {
            update: (args: { data: { targetDate: Date } }) => {
              revertedTargetDate = args.data.targetDate
              return Promise.resolve({ id: 'task-1', targetDate: args.data.targetDate })
            }
          }
        }
        return await callback(fakeTx)
      }) as unknown as typeof db.$transaction

      try {
        const res = await unpostponeOneTimeTask('task-1', 'log-postponed', '2026-10-01')
        expect(res.success).toBe(true)
        expect(softDeletedLogId).toBe('log-postponed')
        expect(revertedTargetDate.toISOString()).toContain('2026-10-01')
      } finally {
        db.$transaction = origTransaction
        AuthorizationService.requireOwnership = origRequireOwnership
        ActivityService.deleteLog = origDeleteLog
      }
    })
  })

  describe('Issue #140: UserSettings Concurrency & Safe Merges', () => {
    it('executes appearance save preserving existing unedited fields', async () => {
      let upsertedConfig: Record<string, unknown> = {}
      const origFindUnique = db.userSetting.findUnique
      const origUpsert = db.userSetting.upsert
      const origGetSessionUser = (await import('@/lib/services/SessionService')).SessionService.getSessionUser

      const { SessionService } = await import('@/lib/services/SessionService')
      SessionService.getSessionUser = mock(() => Promise.resolve(testUser))

      db.userSetting.findUnique = mock(() => Promise.resolve({
        id: 'setting-app',
        userId,
        module: 'APPEARANCE',
        config: { fontSize: 'lg', animations: 'enabled' },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as UserSetting)) as unknown as typeof db.userSetting.findUnique

      db.userSetting.upsert = mock((args: { update: { config: Record<string, unknown> } }) => {
        upsertedConfig = args.update.config
        return Promise.resolve({ id: 'setting-app', ...args.update } as unknown as UserSetting)
      }) as unknown as typeof db.userSetting.upsert

      try {
        const res = await saveUserAppearanceAction({ accent: 'violet' })
        expect(res.success).toBe(true)
        expect(upsertedConfig).toEqual({
          fontSize: 'lg',
          animations: 'enabled',
          accent: 'violet',
        })
      } finally {
        db.userSetting.findUnique = origFindUnique
        db.userSetting.upsert = origUpsert
        SessionService.getSessionUser = origGetSessionUser
      }
    })

    it('executes weekly goal save preserving existing work hours config', async () => {
      let upsertedConfig: Record<string, unknown> = {}
      const origFindUnique = db.userSetting.findUnique
      const origUpsert = db.userSetting.upsert
      const origGetSessionUser = (await import('@/lib/services/SessionService')).SessionService.getSessionUser

      const { SessionService } = await import('@/lib/services/SessionService')
      SessionService.getSessionUser = mock(() => Promise.resolve(testUser))

      db.userSetting.findUnique = mock(() => Promise.resolve({
        id: 'setting-work',
        userId,
        module: 'WORK_HOURS',
        config: { dailyTarget: 8, customBreaks: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as UserSetting)) as unknown as typeof db.userSetting.findUnique

      db.userSetting.upsert = mock((args: { update: { config: Record<string, unknown> } }) => {
        upsertedConfig = args.update.config
        return Promise.resolve({ id: 'setting-work', ...args.update } as unknown as UserSetting)
      }) as unknown as typeof db.userSetting.upsert

      try {
        const res = await saveWeeklyGoalAction(40)
        expect(res.success).toBe(true)
        expect(upsertedConfig).toEqual({
          dailyTarget: 8,
          customBreaks: true,
          weeklyGoal: 40,
        })
      } finally {
        db.userSetting.findUnique = origFindUnique
        db.userSetting.upsert = origUpsert
        SessionService.getSessionUser = origGetSessionUser
      }
    })
  })
})
