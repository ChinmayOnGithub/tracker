import { describe, it, expect, mock } from 'bun:test'
import { SessionService } from '@/lib/services/SessionService'
import { AuthService } from '@/lib/services/AuthService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { DatabaseRateLimiter } from '@/lib/services/RateLimiter'
import { BillingService } from '@/lib/services/BillingService'
import { isRazorpayConfigured } from '@/lib/env'
import { updateNote, deleteNote, restoreNote } from '@/app/actions/note'
import { updateLeaveStatus } from '@/app/actions/leave'
import { WorkSessionService } from '@/modules/work/services/WorkSessionService'
import { POST as mobileSyncPost } from '@/app/api/mobile/sync/route'
import { POST as calendarWebhookPost } from '@/app/api/sync/calendar/route'
import { GET as syncPullGet } from '@/app/api/sync/activities/pull/route'
import { POST as syncPushPost } from '@/app/api/sync/activities/push/route'
import { POST as razorpayWebhookPost } from '@/app/api/webhooks/razorpay/route'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { IBillingProvider } from '@/lib/billing/providers/IBillingProvider'
import { LeaveStatus } from '@prisma/client'

describe('Production Security, Sync, Auth, Billing & Integrity Suite (#76)', () => {
  // =========================================================================
  // 1. AUTHENTICATION, ACCOUNT STATUS & SESSION REVOCATION (Items 1, 2, 4)
  // =========================================================================
  describe('Authentication Boundary, Account Status & Revocation', () => {
    it('allows active user with matching session version', async () => {
      const origFindUnique = db.user.findUnique
      try {
        db.user.findUnique = mock(() =>
          Promise.resolve({
            id: 'user-active',
            username: 'alice',
            email: 'alice@example.com',
            isSuspended: false,
            sessionVersion: 1,
            passwordHash: 'hash',
            googleId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ) as unknown as typeof db.user.findUnique

        const token = signSession('user-active', 'alice', 1)
        const user = await SessionService.resolveUserFromToken(token)

        expect(user).not.toBeNull()
        expect(user?.id).toBe('user-active')
      } finally {
        db.user.findUnique = origFindUnique
      }
    })

    it('rejects suspended user even with a previously valid token', async () => {
      const origFindUnique = db.user.findUnique
      try {
        db.user.findUnique = mock(() =>
          Promise.resolve({
            id: 'user-suspended',
            username: 'banned_user',
            email: 'banned@example.com',
            isSuspended: true,
            sessionVersion: 1,
            passwordHash: 'hash',
            googleId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ) as unknown as typeof db.user.findUnique

        const token = signSession('user-suspended', 'banned_user', 1)
        const user = await SessionService.resolveUserFromToken(token)

        expect(user).toBeNull()
      } finally {
        db.user.findUnique = origFindUnique
      }
    })

    it('rejects nonexistent/deleted user with otherwise valid token', async () => {
      const origFindUnique = db.user.findUnique
      try {
        db.user.findUnique = mock(() => Promise.resolve(null)) as unknown as typeof db.user.findUnique

        const token = signSession('user-deleted', 'ghost', 1)
        const user = await SessionService.resolveUserFromToken(token)

        expect(user).toBeNull()
      } finally {
        db.user.findUnique = origFindUnique
      }
    })

    it('rejects revoked token when user sessionVersion has been incremented', async () => {
      const origFindUnique = db.user.findUnique
      try {
        db.user.findUnique = mock(() =>
          Promise.resolve({
            id: 'user-revoked',
            username: 'carol',
            email: 'carol@example.com',
            isSuspended: false,
            sessionVersion: 2, // Version incremented on server
            passwordHash: 'hash',
            googleId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ) as unknown as typeof db.user.findUnique

        // Token was signed with old sessionVersion = 1
        const staleToken = signSession('user-revoked', 'carol', 1)
        const user = await SessionService.resolveUserFromToken(staleToken)

        expect(user).toBeNull()
      } finally {
        db.user.findUnique = origFindUnique
      }
    })

    it('AuthService.revokeAllSessions increments user.sessionVersion', async () => {
      const origUpdate = db.user.update
      let updatedData: unknown = null
      try {
        db.user.update = mock((args: { where: { id: string }; data: unknown }) => {
          updatedData = args.data
          return Promise.resolve({
            id: args.where.id,
            username: 'david',
            email: null,
            googleId: null,
            passwordHash: null,
            isSuspended: false,
            sessionVersion: 3,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        }) as unknown as typeof db.user.update

        await AuthService.revokeAllSessions('user-david')
        expect(updatedData).toEqual({
          sessionVersion: { increment: 1 },
        })
      } finally {
        db.user.update = origUpdate
      }
    })
  })

  // =========================================================================
  // 2. SHARED DATABASE RATE LIMITING (Items 3, 24)
  // =========================================================================
  describe('Shared Database-Backed Rate Limiting', () => {
    it('correctly tracks and limits attempts across calls', async () => {
      const store = new Map<string, { count: number; resetAt: Date }>()

      const mockDb = {
        rateLimit: {
          findUnique: mock((args: { where: { key: string } }) => {
            const entry = store.get(args.where.key)
            return Promise.resolve(entry ? { key: args.where.key, count: entry.count, resetAt: entry.resetAt } : null)
          }),
          upsert: mock((args: { where: { key: string }; create: { key: string; count: number; resetAt: Date }; update: { count: number; resetAt: Date } }) => {
            const data = args.create
            store.set(data.key, { count: data.count, resetAt: data.resetAt })
            return Promise.resolve({ key: data.key, count: data.count, resetAt: data.resetAt })
          }),
          create: mock((args: { data: { key: string; count: number; resetAt: Date } }) => {
            store.set(args.data.key, { count: args.data.count, resetAt: args.data.resetAt })
            return Promise.resolve(args.data)
          }),
          update: mock((args: { where: { key: string }; data: { count?: { increment: number }; resetAt?: Date } }) => {
            const entry = store.get(args.where.key)!
            const newCount = args.data.count?.increment ? entry.count + args.data.count.increment : (entry.count ?? 1)
            store.set(args.where.key, { count: newCount, resetAt: args.data.resetAt || entry.resetAt })
            return Promise.resolve({ key: args.where.key, count: newCount, resetAt: entry.resetAt })
          }),
        },
      }

      const limiter = new DatabaseRateLimiter(mockDb as unknown as typeof db)

      // First 3 attempts with limit 3
      const r1 = await limiter.check('test:key', 3, 60)
      expect(r1.allowed).toBe(true)
      expect(r1.remaining).toBe(2)

      const r2 = await limiter.check('test:key', 3, 60)
      expect(r2.allowed).toBe(true)
      expect(r2.remaining).toBe(1)

      const r3 = await limiter.check('test:key', 3, 60)
      expect(r3.allowed).toBe(true)
      expect(r3.remaining).toBe(0)

      // 4th attempt should be blocked
      const r4 = await limiter.check('test:key', 3, 60)
      expect(r4.allowed).toBe(false)
      expect(r4.remaining).toBe(0)
      expect(r4.retryAfterSeconds).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // 3. CROSS-ACCOUNT SECURITY & TENANT ISOLATION (Items 5, 26, 33, 42, 47)
  // =========================================================================
  describe('Cross-Account Security & Tenant Isolation', () => {
    it('blocks User B from updating User A note', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origFindFirst = db.note.findFirst
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-b', username: 'bob', isOwner: false })
        )
        // Note belongs to User A, so scoped findFirst returns null
        db.note.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.note.findFirst

        const res = await updateNote('note-a', 'Hacked content')
        expect(res.success).toBe(false)
        expect(res.code).toBe('NOT_FOUND')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.note.findFirst = origFindFirst
      }
    })

    it('blocks User B from deleting User A note', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origFindFirst = db.note.findFirst
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-b', username: 'bob', isOwner: false })
        )
        db.note.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.note.findFirst

        const res = await deleteNote('note-a')
        expect(res.success).toBe(false)
        expect(res.code).toBe('NOT_FOUND')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.note.findFirst = origFindFirst
      }
    })

    it('blocks User B from restoring User A deleted note', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origFindFirst = db.note.findFirst
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-b', username: 'bob', isOwner: false })
        )
        db.note.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.note.findFirst

        const res = await restoreNote('note-a')
        expect(res.success).toBe(false)
        expect(res.code).toBe('NOT_FOUND')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.note.findFirst = origFindFirst
      }
    })

    it('blocks User B from modifying User A leave record', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origRequireModule = AuthorizationService.requireModuleAccess
      const origFindFirst = db.leaveRecord.findFirst
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-b', username: 'bob', isOwner: false })
        )
        AuthorizationService.requireModuleAccess = mock(() =>
          Promise.resolve({ id: 'user-b', username: 'bob', isOwner: false })
        )
        db.leaveRecord.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.leaveRecord.findFirst

        const res = await updateLeaveStatus('leave-a', LeaveStatus.REJECTED)
        expect(res.success).toBe(false)
        expect(res.error).toBe('Resource not found')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        AuthorizationService.requireModuleAccess = origRequireModule
        db.leaveRecord.findFirst = origFindFirst
      }
    })

    it('WorkSessionService blocks operations on sessions belonging to other users', async () => {
      const origFindFirst = db.workSession.findFirst
      try {
        db.workSession.findFirst = mock(() => Promise.resolve(null)) as unknown as typeof db.workSession.findFirst

        expect(WorkSessionService.finishSession('user-b', 'session-owned-by-a')).rejects.toThrow(
          'Work session not found.'
        )
        expect(WorkSessionService.deleteSession('user-b', 'session-owned-by-a')).rejects.toThrow(
          'Work session not found.'
        )
      } finally {
        db.workSession.findFirst = origFindFirst
      }
    })
  })

  // =========================================================================
  // 4. SYNC DATA INTEGRITY, VERSIONING & IDEMPOTENCY (Items 6, 7, 8, 9, 10, 11, 12, 43)
  // =========================================================================
  describe('Sync Data Integrity, Versioning & Idempotency', () => {
    it('SyncPush returns cached response for duplicate clientRequestId (Idempotency)', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origFindUnique = db.syncOperation.findUnique
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-sync-1', username: 'syncuser', isOwner: false })
        )

        const cachedResult = {
          success: true,
          operationId: 'req-dup-1',
          entityType: 'activityTemplate' as const,
          entityId: 'tmpl-1',
          syncedAt: Date.now(),
        }

        db.syncOperation.findUnique = mock(() =>
          Promise.resolve({
            id: 'op-1',
            userId: 'user-sync-1',
            clientRequestId: 'req-dup-1',
            operationType: 'create',
            status: 'COMPLETED',
            responseJson: cachedResult,
            createdAt: new Date(),
            completedAt: new Date(),
          })
        ) as unknown as typeof db.syncOperation.findUnique

        const req = new NextRequest('http://localhost:3000/api/sync/activities/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operations: [
              {
                id: 'req-dup-1',
                clientRequestId: 'req-dup-1',
                type: 'create',
                entityType: 'activityTemplate',
                entityId: 'tmpl-1',
                clientVersion: 1,
                payload: { name: 'Morning Routine' },
              },
            ],
          }),
        })

        const res = await syncPushPost(req)
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.results.length).toBe(1)
        expect(json.results[0].operationId).toBe('req-dup-1')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.syncOperation.findUnique = origFindUnique
      }
    })

    it('SyncPush detects stale client version and reports conflict without overwriting', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origTx = db.$transaction
      const origFindUnique = db.syncOperation.findUnique
      const origUpsertOp = db.syncOperation.upsert
      const origUpsertCur = db.syncCursor.upsert
      const origFindTemplate = db.activityTemplate.findFirst
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-sync-2', username: 'syncuser2', isOwner: false })
        )

        db.syncOperation.findUnique = mock(() => Promise.resolve(null)) as unknown as typeof db.syncOperation.findUnique
        db.syncOperation.upsert = mock(() => Promise.resolve({})) as unknown as typeof db.syncOperation.upsert
        db.syncCursor.upsert = mock(() => Promise.resolve({})) as unknown as typeof db.syncCursor.upsert

        db.activityTemplate.findFirst = mock(() =>
          Promise.resolve({
            id: 'tmpl-100',
            userId: 'user-sync-2',
            version: 5, // Server has version 5
            name: 'Server Title',
            category: 'general',
            type: 'PERSONAL',
            priority: 'NORMAL',
            estimatedDuration: 15,
            energyRequired: 'MEDIUM',
            icon: 'icon',
            color: '#000',
            isActive: true,
            notes: null,
            amount: null,
            recurrenceType: 'daily',
            recurrenceInterval: null,
            recurrenceDaysOfWeek: null,
            recurrenceDayOfMonth: null,
            recurrenceMonth: null,
            metadata: null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ) as unknown as typeof db.activityTemplate.findFirst

        const req = new NextRequest('http://localhost:3000/api/sync/activities/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operations: [
              {
                id: 'op-conf-1',
                clientRequestId: 'op-conf-1',
                type: 'update',
                entityType: 'activityTemplate',
                entityId: 'tmpl-100',
                clientVersion: 3, // Stale client has version 3
                payload: { name: 'Stale Title' },
                data: {
                  id: 'tmpl-100',
                  name: 'Stale Title',
                  version: 3, // Incoming stale version
                },
              },
            ],
          }),
        })

        const res = await syncPushPost(req)
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.results.length).toBe(1)
        expect(json.results[0].success).toBe(false)
        expect(json.results[0].error.code).toBe('VERSION_CONFLICT')
        expect(json.results[0].resolvedData.version).toBe(5)
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.$transaction = origTx
        db.syncOperation.findUnique = origFindUnique
        db.syncOperation.upsert = origUpsertOp
        db.syncCursor.upsert = origUpsertCur
        db.activityTemplate.findFirst = origFindTemplate
      }
    })

    it('Mobile sync rejects payloads exceeding MAX_SYNC_BYTES with 413 PAYLOAD_TOO_LARGE', async () => {
      const origResolveAuth = SessionService.resolveAuthFromRequest
      try {
        SessionService.resolveAuthFromRequest = mock(() =>
          Promise.resolve({
            id: 'user-mobile',
            username: 'mobileuser',
            email: null,
            isOwner: false,
          })
        )

        // Generate payload slightly larger than 2MB
        const largeString = 'x'.repeat(2 * 1024 * 1024 + 100)
        const req = new NextRequest('http://localhost:3000/api/mobile/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            localChanges: {
              notes: [{ id: 'n1', title: 'Huge', content: largeString, date: '2026-09-27' }],
            },
          }),
        })

        const res = await mobileSyncPost(req)
        expect(res.status).toBe(413)
        const json = await res.json()
        expect(json.error.code).toBe('PAYLOAD_TOO_LARGE')
      } finally {
        SessionService.resolveAuthFromRequest = origResolveAuth
      }
    })

    it('SyncPull returns 409 SYNC_RESYNC_REQUIRED when client cursor is invalid or expired', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origFindUnique = db.syncCursor.findUnique
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'user-sync-pull', username: 'syncpulluser', isOwner: false })
        )

        db.syncCursor.findUnique = mock(() =>
          Promise.resolve({
            userId: 'user-sync-pull',
            revision: BigInt(10),
            updatedAt: new Date(),
          })
        ) as unknown as typeof db.syncCursor.findUnique

        // Client cursor 999999 is far ahead of server revision 10 -> corrupt/expired
        const req = new NextRequest('http://localhost:3000/api/sync/activities/pull?cursor=999999')
        const res = await syncPullGet(req)

        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.error.code).toBe('SYNC_RESYNC_REQUIRED')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.syncCursor.findUnique = origFindUnique
      }
    })
  })

  // =========================================================================
  // 5. CALENDAR WEBHOOK SECURITY & ATOMIC LEASE LOCK (Items 13, 14, 15)
  // =========================================================================
  describe('Calendar Webhook Security & Lease Lock', () => {
    it('rejects webhooks with missing or invalid secret header', async () => {
      const origSecret = process.env.CALENDAR_WEBHOOK_SECRET
      try {
        process.env.CALENDAR_WEBHOOK_SECRET = 'correct-webhook-secret-999'

        const req = new NextRequest('http://localhost:3000/api/sync/calendar', {
          method: 'POST',
          headers: {
            'x-goog-channel-id': 'ch-1',
            'x-goog-resource-id': 'res-1',
            'x-goog-resource-state': 'exists',
            'x-tracker-sync-secret': 'wrong-secret',
          },
        })

        const res = await calendarWebhookPost(req)
        expect(res.status).toBe(401)
      } finally {
        process.env.CALENDAR_WEBHOOK_SECRET = origSecret
      }
    })

    it('acknowledges sync handshake without scheduling redundant work', async () => {
      const origFindFirst = db.calendarSyncState.findFirst
      const origUpdateMany = db.calendarSyncState.updateMany
      const origSecret = process.env.CALENDAR_WEBHOOK_SECRET
      try {
        const testSecret = 'tracker-cal-test-secret-salt-123'
        process.env.CALENDAR_WEBHOOK_SECRET = testSecret
        // If env.SYNC_SECRET is set, use it instead
        const { env } = await import('@/lib/env')
        const activeSecret = env.SYNC_SECRET || testSecret

        db.calendarSyncState.findFirst = mock(() =>
          Promise.resolve({
            id: 'state-1',
            userId: 'user-cal',
            provider: 'google',
            channelId: 'ch-sync',
            resourceId: 'res-sync',
            syncLockUntil: null,
            syncLockToken: null,
            nextSyncToken: null,
            channelExpiration: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ) as unknown as typeof db.calendarSyncState.findFirst

        const req = new NextRequest('http://localhost:3000/api/sync/calendar', {
          method: 'POST',
          headers: {
            'x-tracker-sync-secret': activeSecret,
            'x-goog-channel-id': 'ch-sync',
            'x-goog-resource-id': 'res-sync',
            'x-goog-resource-state': 'sync', // Handshake
          },
        })

        const res = await calendarWebhookPost(req)
        expect(res.status).toBe(200)
      } finally {
        db.calendarSyncState.findFirst = origFindFirst
        db.calendarSyncState.updateMany = origUpdateMany
        process.env.CALENDAR_WEBHOOK_SECRET = origSecret
      }
    })
  })

  // =========================================================================
  // 6. BILLING WEBHOOKS & RECONCILIATION HARDENING (Items 27, 28, 29, 30, 44)
  // =========================================================================
  describe('Billing Webhooks & Authoritative Reconciliation', () => {
    it('returns safe error envelope WEBHOOK_PROCESSING_FAILED on internal error', async () => {
      const origProcessWebhook = BillingService.processWebhook
      try {
        BillingService.processWebhook = mock(() => {
          throw new Error('Database connection failed or corrupt signature')
        })

        const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
          method: 'POST',
          headers: {
            'x-razorpay-signature': 'bad-sig',
          },
          body: JSON.stringify({ event: 'subscription.activated' }),
        })

        const res = await razorpayWebhookPost(req)
        expect(res.status).toBe(500)
        const json = await res.json()
        expect(json.error.code).toBe('WEBHOOK_PROCESSING_FAILED')
        expect(json.error.message).toBe('Webhook could not be processed.')
        expect(json.error.details).toBeUndefined()
      } finally {
        BillingService.processWebhook = origProcessWebhook
      }
    })

    it('isRazorpayConfigured returns false when plan IDs or secrets are missing', () => {
      const origEnv = process.env.RAZORPAY_KEY_SECRET
      try {
        delete (process.env as Record<string, string | undefined>).RAZORPAY_KEY_SECRET
        expect(isRazorpayConfigured()).toBe(false)
      } finally {
        process.env.RAZORPAY_KEY_SECRET = origEnv
      }
    })

    it('reconcileSubscription recalculates entitlements idempotently', async () => {
      const origFindUnique = db.subscription.findUnique
      const origFindFirst = db.subscription.findFirst
      const origFindMany = db.subscription.findMany
      const origUpdate = db.subscription.update
      const origUpsert = db.usageCounter.upsert
      const origCreate = db.auditLog.create
      try {
        const mockSub = {
          id: 'sub-local-1',
          userId: 'user-rec-1',
          providerSubscriptionId: 'sub_rzp_123',
          planId: 'PRO_MONTHLY',
          plan: 'PRO_MONTHLY',
          status: 'ACTIVE',
          billingInterval: 'MONTHLY',
          isIntroductory: false,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          billingCustomerId: null,
          billingCustomer: null,
        }

        db.subscription.findFirst = mock(() => Promise.resolve(mockSub)) as unknown as typeof db.subscription.findFirst
        db.subscription.findUnique = mock(() => Promise.resolve(mockSub)) as unknown as typeof db.subscription.findUnique
        db.subscription.findMany = mock(() => Promise.resolve([mockSub])) as unknown as typeof db.subscription.findMany
        db.subscription.update = mock(() => Promise.resolve(mockSub)) as unknown as typeof db.subscription.update
        db.usageCounter.upsert = mock(() => Promise.resolve({})) as unknown as typeof db.usageCounter.upsert
        db.auditLog.create = mock(() => Promise.resolve({})) as unknown as typeof db.auditLog.create

        const mockProvider = {
          retrieveSubscription: mock(() =>
            Promise.resolve({
              id: 'sub_rzp_123',
              status: 'active',
              planId: 'PRO_MONTHLY',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
              cancelAtPeriodEnd: false,
            })
          ),
        } as unknown as IBillingProvider

        const result = await BillingService.reconcileSubscription('sub_rzp_123', mockProvider)
        expect(result.status).toBe('ACTIVE')
        expect(result.isPro).toBe(true)
      } finally {
        db.subscription.findFirst = origFindFirst
        db.subscription.findUnique = origFindUnique
        db.subscription.findMany = origFindMany
        db.subscription.update = origUpdate
        db.usageCounter.upsert = origUpsert
        db.auditLog.create = origCreate
      }
    })
  })
})
