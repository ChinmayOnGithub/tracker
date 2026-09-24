/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { AdminService } from '@/lib/services/AdminService'
import { BillingService } from '@/lib/services/BillingService'
import { AuditService } from '@/lib/services/AuditService'
import { db } from '@/lib/db'
import { MockBillingProvider, setBillingProvider } from '@/lib/billing/providers'

describe('Admin Control Plane Foundation & Security Suite', () => {
  const testAdminKey = 'test_admin_secret_key'
  const targetUserId = 'usr_target_admin_test'

  beforeEach(() => {
    process.env.ADMIN_API_KEY = testAdminKey
    setBillingProvider(new MockBillingProvider())
  })

  afterEach(() => {
    setBillingProvider(null)
  })

  describe('1. Admin Authorization Boundary', () => {
    it('rejects unauthenticated requests without admin credentials', async () => {
      const headers = new Headers()
      const auth = await AdminService.verifyAdminAuth(headers)

      expect(auth.authorized).toBe(false)
      expect(auth.error).toContain('Unauthorized')
    })

    it('rejects requests with invalid admin API key', async () => {
      const headers = new Headers({ 'x-admin-key': 'wrong_secret_key' })
      const auth = await AdminService.verifyAdminAuth(headers)

      expect(auth.authorized).toBe(false)
      expect(auth.error).toContain('Unauthorized')
    })

    it('authorizes requests with valid x-admin-key header', async () => {
      const headers = new Headers({ 'x-admin-key': testAdminKey })
      const auth = await AdminService.verifyAdminAuth(headers)

      expect(auth.authorized).toBe(true)
      expect(auth.actor).toBe('admin_api_key')
    })

    it('authorizes requests with valid Authorization Bearer token', async () => {
      const headers = new Headers({ authorization: `Bearer ${testAdminKey}` })
      const auth = await AdminService.verifyAdminAuth(headers)

      expect(auth.authorized).toBe(true)
      expect(auth.actor).toBe('admin_api_key')
    })
  })

  describe('2. Product-Agnostic Abstraction', () => {
    it('lists registered products with Tracker OS as Product #1', () => {
      const products = AdminService.listProducts()

      expect(products.length).toBeGreaterThan(0)
      const tracker = products.find((p) => p.slug === 'tracker')
      expect(tracker).toBeDefined()
      expect(tracker?.id).toBe('prod_tracker')
      expect(tracker?.status).toBe('ACTIVE')
      expect(tracker?.integrationMetadata.capabilities).toContain('advanced_calendar')
      expect(tracker?.integrationMetadata.capabilities).toContain('advanced_journal')
      expect(tracker?.integrationMetadata.capabilities).toContain('unlimited_notes')
    })
  })

  describe('3. User Inspection & State', () => {
    it('returns complete administrative user details', async () => {
      const originalFindUser = db.user.findUnique
      const originalFindSetting = db.userSetting.findUnique
      const originalSub = BillingService.getSubscription
      const originalAudit = AuditService.getLogsForUser

      try {
        (db.user as any).findUnique = async () => ({
          id: targetUserId,
          username: 'test_target',
          email: 'target@tracker.local',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        (db.userSetting as any).findUnique = async () => null;

        BillingService.getSubscription = async () => null;
        AuditService.getLogsForUser = async () => [];

        const details = await AdminService.getUser(targetUserId)

        expect(details.user.id).toBe(targetUserId)
        expect(details.accountStatus.isSuspended).toBe(false)
        expect(details.entitlements.tier).toBe('FREE')
        expect(details.usageStats).toBeDefined()
      } finally {
        db.user.findUnique = originalFindUser
        db.userSetting.findUnique = originalFindSetting
        BillingService.getSubscription = originalSub
        AuditService.getLogsForUser = originalAudit
      }
    })
  })

  describe('4. Administrative Subscription Operations', () => {
    it('schedules cancellation at period end without immediately revoking Pro', async () => {
      const origGetSub = BillingService.getSubscription
      const origSubUpdate = db.subscription.update
      const origAudit = AuditService.log

      let subUpdatedCancelAtEnd = false

      try {
        const mockSub = {
          id: 'sub_test_admin_1',
          userId: targetUserId,
          providerSubscriptionId: 'sub_prov_test_1',
          plan: 'PRO_MONTHLY',
          status: 'ACTIVE',
          billingInterval: 'monthly',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          canceledAt: null
        };

        BillingService.getSubscription = async () => mockSub as any;
        (db.subscription as any).update = async ({ data }: any) => {
          subUpdatedCancelAtEnd = data.cancelAtPeriodEnd
          return { ...mockSub, ...data }
        };
        (AuditService as any).log = async () => ({ id: 'audit_1' });

        const result = await AdminService.cancelSubscription('admin_api_key', targetUserId, 'Support request')

        expect(result.success).toBe(true)
        expect(subUpdatedCancelAtEnd).toBe(true)
      } finally {
        BillingService.getSubscription = origGetSub
        db.subscription.update = origSubUpdate
        AuditService.log = origAudit
      }
    })

    it('terminates subscription immediately and revokes Pro access', async () => {
      const origGetSub = BillingService.getSubscription
      const origSubUpdate = db.subscription.update
      const origAudit = AuditService.log

      let auditLoggedAction = ''

      try {
        const mockSub = {
          id: 'sub_test_admin_2',
          userId: targetUserId,
          providerSubscriptionId: 'sub_prov_test_2',
          plan: 'PRO_MONTHLY',
          status: 'ACTIVE',
          billingInterval: 'monthly',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          canceledAt: null
        };

        BillingService.getSubscription = async () => mockSub as any;
        (db.subscription as any).update = async ({ data }: any) => {
          return { ...mockSub, ...data }
        };
        (AuditService as any).log = async (params: any) => {
          auditLoggedAction = params.action
          return { id: 'audit_immediate' }
        };

        const result = await AdminService.cancelSubscriptionImmediately(
          'admin_api_key',
          targetUserId,
          'Fraud detection'
        )

        expect(result.success).toBe(true)
        expect(result.subscription.status).toBe('CANCELLED')
        expect(auditLoggedAction).toBe('ADMIN_SUBSCRIPTION_CANCELLED_IMMEDIATELY')
      } finally {
        BillingService.getSubscription = origGetSub
        db.subscription.update = origSubUpdate
        AuditService.log = origAudit
      }
    })
  })

  describe('5. User Suspension & Restoration Lifecycle', () => {
    it('suspends user, updates account status, and logs audit record', async () => {
      const origFindUser = db.user.findUnique
      const origUpsertSetting = db.userSetting.upsert
      const origAudit = AuditService.log

      let auditAction = ''

      try {
        (db.user as any).findUnique = async () => ({ id: targetUserId });
        (db.userSetting as any).upsert = async ({ create }: any) => ({
          id: 'set_1',
          ...create
        });
        (AuditService as any).log = async (params: any) => {
          auditAction = params.action
          return { id: 'audit_susp' }
        };

        const res = await AdminService.suspendUser('admin_api_key', targetUserId, 'Spam violation')

        expect(res.success).toBe(true)
        expect(res.isSuspended).toBe(true)
        expect(auditAction).toBe('ADMIN_USER_SUSPENDED')
      } finally {
        db.user.findUnique = origFindUser
        db.userSetting.upsert = origUpsertSetting
        AuditService.log = origAudit
      }
    })

    it('restores user, clears suspension flag, and logs audit record', async () => {
      const origFindUser = db.user.findUnique
      const origUpsertSetting = db.userSetting.upsert
      const origAudit = AuditService.log

      let auditAction = ''

      try {
        (db.user as any).findUnique = async () => ({ id: targetUserId });
        (db.userSetting as any).upsert = async ({ create }: any) => ({
          id: 'set_1',
          ...create
        });
        (AuditService as any).log = async (params: any) => {
          auditAction = params.action
          return { id: 'audit_rest' }
        };

        const res = await AdminService.restoreUser('admin_api_key', targetUserId, 'Appeal accepted')

        expect(res.success).toBe(true)
        expect(res.isSuspended).toBe(false)
        expect(auditAction).toBe('ADMIN_USER_RESTORED')
      } finally {
        db.user.findUnique = origFindUser
        db.userSetting.upsert = origUpsertSetting
        AuditService.log = origAudit
      }
    })
  })

  describe('6. Admin HTTP Route Handlers', () => {
    it('GET /api/admin/v1/products rejects without admin key', async () => {
      const { GET } = await import('@/app/api/admin/v1/products/route')
      const req = new Request('http://localhost:3000/api/admin/v1/products')
      const res = await GET(req)

      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.success).toBe(false)
    })

    it('GET /api/admin/v1/products returns product list when authenticated', async () => {
      const { GET } = await import('@/app/api/admin/v1/products/route')
      const req = new Request('http://localhost:3000/api/admin/v1/products', {
        headers: { 'x-admin-key': testAdminKey }
      })
      const res = await GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.products.length).toBeGreaterThan(0)
      expect(data.products[0].slug).toBe('tracker')
    })
  })
})
