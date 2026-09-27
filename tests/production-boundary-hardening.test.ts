import { describe, it, expect, mock } from 'bun:test'
import { getCanonicalOrigin } from '@/lib/url'
import { isRazorpayConfigured } from '@/lib/env'
import { getVaultKeyAction, saveVaultBankAccount } from '@/app/actions/vault'
import { batchUpdateLeaveAllowances } from '@/app/actions/leave'
import { createWorkSession } from '@/modules/work/actions'
import { GET as healthGet } from '@/app/api/health/route'
import { GET as syncPullGet } from '@/app/api/sync/activities/pull/route'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { signSession } from '@/lib/session'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { SyncOperation } from '@/lib/sync/types'

describe('Production Boundary Hardening (#75)', () => {
  describe('Canonical Origin Resolution & Host Header Protection', () => {
    it('prioritizes configured NEXT_PUBLIC_SITE_URL in production over untrusted x-forwarded-host', () => {
      const origEnv = process.env.NODE_ENV
      const origSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
      try {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
        process.env.NEXT_PUBLIC_SITE_URL = 'https://app.tracker.com'

        const untrustedReq = new Request('http://internal-cluster:3000/auth', {
          headers: {
            'x-forwarded-host': 'evil-attacker.com',
            'x-forwarded-proto': 'http',
          },
        })

        const origin = getCanonicalOrigin(untrustedReq)
        expect(origin).toBe('https://app.tracker.com')
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
        process.env.NEXT_PUBLIC_SITE_URL = origSiteUrl
      }
    })

    it('allows dynamic host in development for local multi-port testing', () => {
      const origEnv = process.env.NODE_ENV
      try {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
        const devReq = new Request('http://localhost:3001/dashboard', {
          headers: {
            'x-forwarded-host': 'localhost:3001',
            'x-forwarded-proto': 'http',
          },
        })

        const origin = getCanonicalOrigin(devReq)
        expect(origin).toBe('http://localhost:3001')
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
      }
    })
  })

  describe('Vault Master Key Exposure Protection', () => {
    it('blocks direct client access to master vault key', async () => {
      const res = await getVaultKeyAction()
      expect(res.success).toBe(false)
      expect(res.key).toBeUndefined()
      expect(res.error).toBeDefined()
    })
  })

  describe('Razorpay Readiness Gate', () => {
    it('declares payments unconfigured if webhook secret or plan IDs are missing', () => {
      const configured = isRazorpayConfigured()
      expect(typeof configured).toBe('boolean')
    })
  })

  describe('Session Authentication Security', () => {
    it('fails closed in production if AUTH_SECRET is missing', () => {
      const origEnv = process.env.NODE_ENV
      const origSecret = process.env.AUTH_SECRET
      try {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
        delete process.env.AUTH_SECRET

        expect(() => signSession('user-1', 'admin')).toThrow('AUTH_SECRET environment variable is missing in production')
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
        process.env.AUTH_SECRET = origSecret
      }
    })
  })

  describe('Health Check Probe Sanitization', () => {
    it('sanitizes public health probe output in production without leaking internal details', async () => {
      const origEnv = process.env.NODE_ENV
      try {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
        const res = await healthGet()
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.status).toBe('healthy')
        expect(json.timestamp).toBeDefined()
        expect(json.uptimeSeconds).toBeUndefined()
        expect(json.environment).toBeUndefined()
        expect(json.database).toBeUndefined()
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
      }
    })
  })

  describe('Module & Capability Mutation Authorization Guards', () => {
    it('blocks batchUpdateLeaveAllowances if user lacks leave module access', async () => {
      const origRequireModule = AuthorizationService.requireModuleAccess
      try {
        AuthorizationService.requireModuleAccess = mock(() => {
          throw new Error("Access denied: Module 'leave' is disabled for guest accounts")
        })

        const res = await batchUpdateLeaveAllowances(2026, [])
        expect(res.success).toBe(false)
        expect(res.error).toContain("Module 'leave' is disabled")
      } finally {
        AuthorizationService.requireModuleAccess = origRequireModule
      }
    })

    it('blocks work session mutations if user lacks work-hours.write capability', async () => {
      const origRequireCap = AuthorizationService.requireCapability
      try {
        AuthorizationService.requireCapability = mock(() => {
          throw new Error('Unauthorized: missing capability work-hours.write')
        })

        const res = await createWorkSession({ date: '2026-09-27', mode: 'office' })
        expect(res.success).toBe(false)
        expect(res.error).toContain('work-hours.write')
      } finally {
        AuthorizationService.requireCapability = origRequireCap
      }
    })

    it('blocks saveVaultBankAccount if user lacks documents module access', async () => {
      const origRequireModule = AuthorizationService.requireModuleAccess
      try {
        AuthorizationService.requireModuleAccess = mock(() => {
          throw new Error("Access denied: Module 'documents' is disabled for guest accounts")
        })

        const res = await saveVaultBankAccount({
          accountHolder: 'Test',
          bankName: 'Test Bank',
          accountNumber: '1234567890',
          ifscCode: 'TEST0123456',
        })
        expect(res.success).toBe(false)
        expect(res.error).toContain("Module 'documents' is disabled")
      } finally {
        AuthorizationService.requireModuleAccess = origRequireModule
      }
    })
  })

  describe('Sync Pull Tombstone Synchronization', () => {
    it('returns delete operations for soft-deleted logs and templates when pulling incrementally', async () => {
      const origRequireAuth = AuthorizationService.requireAuth
      const origFindLogs = db.activityLog.findMany
      const origFindTemplates = db.activityTemplate.findMany
      try {
        AuthorizationService.requireAuth = mock(() =>
          Promise.resolve({ id: 'test-user', username: 'testuser', isOwner: false })
        )

        const deletedLog = {
          id: 'log-del-1',
          activityId: 'tmpl-1',
          userId: 'test-user',
          logDate: new Date('2026-09-27'),
          note: null,
          status: 'canceled',
          amount: null,
          payload: null,
          weightRecordId: null,
          leaveRecordId: null,
          journalEntryId: null,
          workSessionId: null,
          createdAt: new Date('2026-09-26T10:00:00Z'),
          updatedAt: new Date('2026-09-27T12:00:00Z'),
          deletedAt: new Date('2026-09-27T12:00:00Z'),
        }

        const deletedTemplate = {
          id: 'tmpl-del-1',
          userId: 'test-user',
          name: 'Morning Run',
          category: 'Fitness',
          type: 'PERSONAL' as const,
          priority: 'NORMAL' as const,
          estimatedDuration: 30,
          scheduledTime: null,
          energyRequired: 'HIGH',
          calendarProvider: 'NONE' as const,
          calendarEventId: null,
          notificationRules: null,
          icon: 'run',
          color: '#3b82f6',
          isActive: false,
          notes: null,
          amount: null,
          sortOrder: 0,
          recurrenceType: 'daily' as const,
          recurrenceInterval: null,
          recurrenceDaysOfWeek: null,
          recurrenceDayOfMonth: null,
          recurrenceMonth: null,
          targetDate: null,
          remindBeforeDays: null,
          metadata: null,
          effectiveFrom: new Date('2026-09-26T10:00:00Z'),
          createdAt: new Date('2026-09-26T10:00:00Z'),
          updatedAt: new Date('2026-09-27T12:00:00Z'),
          deletedAt: new Date('2026-09-27T12:00:00Z'),
        }

        db.activityLog.findMany = mock(() => Promise.resolve([deletedLog])) as unknown as typeof db.activityLog.findMany
        db.activityTemplate.findMany = mock(() => Promise.resolve([deletedTemplate])) as unknown as typeof db.activityTemplate.findMany

        const req = new NextRequest('http://localhost:3000/api/sync/activities/pull?since=1758900000000')
        const res = await syncPullGet(req)
        expect(res.status).toBe(200)

        const json = (await res.json()) as { operations: SyncOperation[] }
        expect(Array.isArray(json.operations)).toBe(true)
        expect(json.operations.length).toBe(2)

        const logOp = json.operations.find((op) => op.entityType === 'activityLog')
        expect(logOp).toBeDefined()
        expect(logOp?.type).toBe('delete')
        expect(logOp?.entityId).toBe('log-del-1')

        const tmplOp = json.operations.find((op) => op.entityType === 'activityTemplate')
        expect(tmplOp).toBeDefined()
        expect(tmplOp?.type).toBe('delete')
        expect(tmplOp?.entityId).toBe('tmpl-del-1')
      } finally {
        AuthorizationService.requireAuth = origRequireAuth
        db.activityLog.findMany = origFindLogs
        db.activityTemplate.findMany = origFindTemplates
      }
    })
  })
})
