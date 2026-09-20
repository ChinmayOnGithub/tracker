/**
 * tests/entitlement-module-authorization.test.ts
 *
 * Comprehensive regression test suite proving the unification of:
 * 1. Billing / Pro entitlements (EntitlementService, calculateEntitlements)
 * 2. Module & Capability authorization (AuthorizationService, auth-policy)
 * 3. Server route page guards (getAuthorizedPageContext)
 * 4. Client sidebar navigation filtering (DashboardShell)
 *
 * Requirements verified:
 * 1. Free test user (gated under DEFAULT_GUEST_PERMISSIONS; allowed under custom perms)
 * 2. Pro test user (Pro capabilities & core modules unlocked under DEFAULT_GUEST_PERMISSIONS)
 * 3. Owner user (unconditional full access across all modules)
 * 4. Pro user with guest permissions disabled (Pro capabilities remain accessible)
 * 5. Expired/cancelled Pro user (falls back to Free, Pro modules gated)
 * 6. Pro user manually opening /calendar, /journal, /notes, /documents (server context allows Pro, blocks Free)
 * 7. Sidebar and route access agree (both use the same canAccessModule decision)
 * 8. Downgrade immediately removes Pro-only access after entitlement refresh
 */

import { describe, it, expect } from 'bun:test'
import {
  AuthorizationService,
  DEFAULT_GUEST_PERMISSIONS,
  TrackerModuleKey,
} from '@/lib/services/AuthorizationService'
import { canAccessModulePolicy } from '@/lib/auth-policy'
import { calculateEntitlements, SubscriptionSnapshot } from '@/lib/billing/entitlements'
import type { UserEntitlements } from '@/lib/billing/types'

describe('Entitlement & Module Authorization Unification Suite', () => {
  const freeUser = {
    id: 'user-free-test-1',
    username: 'free_subscriber',
    email: 'free@example.com',
    isOwner: false,
  }

  const proUser = {
    id: 'user-pro-test-1',
    username: 'pro_subscriber',
    email: 'pro@example.com',
    isOwner: false,
  }

  const ownerUser = {
    id: 'user-owner-test-1',
    username: 'admin',
    email: 'chinmaydpatil09@gmail.com',
    isOwner: true,
  }

  const activeSub: SubscriptionSnapshot = {
    id: 'sub_active_123',
    plan: 'PRO_MONTHLY',
    status: 'ACTIVE',
    billingInterval: 'monthly',
    currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    isIntroductory: false,
  }

  const expiredSub: SubscriptionSnapshot = {
    id: 'sub_expired_123',
    plan: 'PRO_MONTHLY',
    status: 'CANCELLED',
    billingInterval: 'monthly',
    currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
    cancelAtPeriodEnd: true,
    canceledAt: new Date('2026-08-15T00:00:00Z'),
    isIntroductory: false,
  }

  const proEntitlements: UserEntitlements = calculateEntitlements(activeSub, new Date('2026-09-15T12:00:00Z'))
  const freeEntitlements: UserEntitlements = calculateEntitlements(null)
  const expiredEntitlements: UserEntitlements = calculateEntitlements(expiredSub, new Date('2026-09-15T12:00:00Z'))

  // ─── 1. Free test user ────────────────────────────────────────────────────────
  describe('1. Free test user access gating', () => {
    it('blocks Pro capability modules under DEFAULT_GUEST_PERMISSIONS', () => {
      expect(AuthorizationService.canAccessModule(freeUser, 'calendar', DEFAULT_GUEST_PERMISSIONS, freeEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(freeUser, 'journal', DEFAULT_GUEST_PERMISSIONS, freeEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(freeUser, 'documents', DEFAULT_GUEST_PERMISSIONS, freeEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(freeUser, 'notes', DEFAULT_GUEST_PERMISSIONS, freeEntitlements)).toBe(false)
    })

    it('always allows settings module for free user', () => {
      expect(AuthorizationService.canAccessModule(freeUser, 'settings', DEFAULT_GUEST_PERMISSIONS, freeEntitlements)).toBe(true)
    })

    it('allows non-Pro modules when host owner explicitly enables them in guest permissions', () => {
      const customPerms = {
        ...DEFAULT_GUEST_PERMISSIONS,
        weight: true,
        links: true,
      }
      expect(AuthorizationService.canAccessModule(freeUser, 'weight', customPerms, freeEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(freeUser, 'links', customPerms, freeEntitlements)).toBe(true)
      // Un-enabled modules remain blocked
      expect(AuthorizationService.canAccessModule(freeUser, 'leave', customPerms, freeEntitlements)).toBe(false)
    })
  })

  // ─── 2. Pro test user ─────────────────────────────────────────────────────────
  describe('2. Pro test user access authorization', () => {
    it('unlocks Pro capability modules even under DEFAULT_GUEST_PERMISSIONS', () => {
      expect(AuthorizationService.canAccessModule(proUser, 'calendar', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'journal', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'documents', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'notes', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
    })

    it('unlocks subscriber core modules (today and activities)', () => {
      expect(AuthorizationService.canAccessModule(proUser, 'today', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'activities', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
    })

    it('does not turn unrelated non-Pro modules into Pro-unlocked features', () => {
      // Weight and leave are not Pro capabilities; they follow guest permissions
      expect(AuthorizationService.canAccessModule(proUser, 'weight', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(proUser, 'leave', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(proUser, 'links', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(false)
    })

    it('allows unrelated non-Pro modules if guest permissions enable them', () => {
      const permsWithWeight = { ...DEFAULT_GUEST_PERMISSIONS, weight: true }
      expect(AuthorizationService.canAccessModule(proUser, 'weight', permsWithWeight, proEntitlements)).toBe(true)
    })
  })

  // ─── 3. Owner user ────────────────────────────────────────────────────────────
  describe('3. Owner user unconditional access', () => {
    it('owner retains unconditional access to every module', () => {
      const allModules: TrackerModuleKey[] = [
        'today',
        'calendar',
        'activities',
        'journal',
        'notes',
        'leave',
        'weight',
        'links',
        'documents',
        'settings',
      ]
      for (const mod of allModules) {
        expect(AuthorizationService.canAccessModule(ownerUser, mod, DEFAULT_GUEST_PERMISSIONS, freeEntitlements)).toBe(true)
      }
    })
  })

  // ─── 4. Pro user with guest permissions disabled ──────────────────────────────
  describe('4. Pro user with guest permissions disabled', () => {
    it('retains access to Pro capabilities even when host guest permissions are explicitly all false', () => {
      const disabledPerms: Record<TrackerModuleKey, boolean> = {
        today: false,
        calendar: false,
        activities: false,
        journal: false,
        notes: false,
        leave: false,
        weight: false,
        links: false,
        documents: false,
        settings: false, // even if settings were set to false in config, policy forces settings true
      }

      expect(AuthorizationService.canAccessModule(proUser, 'calendar', disabledPerms, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'journal', disabledPerms, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'documents', disabledPerms, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'notes', disabledPerms, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'today', disabledPerms, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'activities', disabledPerms, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccessModule(proUser, 'settings', disabledPerms, proEntitlements)).toBe(true)
    })
  })

  // ─── 5. Expired/cancelled Pro user ────────────────────────────────────────────
  describe('5. Expired/cancelled Pro user access revocation', () => {
    it('falls back to Free plan and revokes Pro-only module access', () => {
      expect(expiredEntitlements.isPro).toBe(false)
      expect(AuthorizationService.canAccessModule(proUser, 'calendar', DEFAULT_GUEST_PERMISSIONS, expiredEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(proUser, 'journal', DEFAULT_GUEST_PERMISSIONS, expiredEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(proUser, 'documents', DEFAULT_GUEST_PERMISSIONS, expiredEntitlements)).toBe(false)
      expect(AuthorizationService.canAccessModule(proUser, 'notes', DEFAULT_GUEST_PERMISSIONS, expiredEntitlements)).toBe(false)
    })
  })

  // ─── 6. Server route page authorization context ───────────────────────────────
  describe('6. Server page route authorization context simulation', () => {
    it('authorizes Pro subscriber for /calendar, /journal, /notes, /documents routes', async () => {
      const { SessionService } = await import('@/lib/services/SessionService')
      const origGetSession = SessionService.getSessionUser
      const { EntitlementService } = await import('@/lib/services/EntitlementService')
      const origGetEntitlements = EntitlementService.getEntitlements
      const origGetPerms = AuthorizationService.getEffectiveGuestPermissions

      try {
        SessionService.getSessionUser = async () => ({
          id: proUser.id,
          username: proUser.username,
          email: proUser.email,
          isOwner: false,
        })
        EntitlementService.getEntitlements = async () => proEntitlements
        AuthorizationService.getEffectiveGuestPermissions = async () => ({ ...DEFAULT_GUEST_PERMISSIONS })

        const proModules: TrackerModuleKey[] = ['calendar', 'journal', 'notes', 'documents']
        for (const mod of proModules) {
          const ctx = await AuthorizationService.getAuthorizedPageContext({ module: mod })
          expect(ctx.user).not.toBeNull()
          expect(ctx.isPro).toBe(true)
          expect(ctx.canAccess).toBe(true)
        }
      } finally {
        SessionService.getSessionUser = origGetSession
        EntitlementService.getEntitlements = origGetEntitlements
        AuthorizationService.getEffectiveGuestPermissions = origGetPerms
      }
    })

    it('denies Free user for /calendar, /journal, /notes, /documents routes when guest perms default to false', async () => {
      const { SessionService } = await import('@/lib/services/SessionService')
      const origGetSession = SessionService.getSessionUser
      const { EntitlementService } = await import('@/lib/services/EntitlementService')
      const origGetEntitlements = EntitlementService.getEntitlements
      const origGetPerms = AuthorizationService.getEffectiveGuestPermissions

      try {
        SessionService.getSessionUser = async () => ({
          id: freeUser.id,
          username: freeUser.username,
          email: freeUser.email,
          isOwner: false,
        })
        EntitlementService.getEntitlements = async () => freeEntitlements
        AuthorizationService.getEffectiveGuestPermissions = async () => ({ ...DEFAULT_GUEST_PERMISSIONS })

        const proModules: TrackerModuleKey[] = ['calendar', 'journal', 'notes', 'documents']
        for (const mod of proModules) {
          const ctx = await AuthorizationService.getAuthorizedPageContext({ module: mod })
          expect(ctx.user).not.toBeNull()
          expect(ctx.isPro).toBe(false)
          expect(ctx.canAccess).toBe(false)
        }
      } finally {
        SessionService.getSessionUser = origGetSession
        EntitlementService.getEntitlements = origGetEntitlements
        AuthorizationService.getEffectiveGuestPermissions = origGetPerms
      }
    })
  })

  // ─── 7. Sidebar and route access agreement ───────────────────────────────────
  describe('7. Sidebar and route access agreement', () => {
    const allNavItems: { id: TrackerModuleKey; label: string }[] = [
      { id: 'today', label: 'Today' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'activities', label: 'Activities' },
      { id: 'journal', label: 'Journal' },
      { id: 'notes', label: 'Notes' },
      { id: 'leave', label: 'Time Off' },
      { id: 'weight', label: 'Weight' },
      { id: 'links', label: 'Link Library' },
      { id: 'documents', label: 'Secure Vault' },
      { id: 'settings', label: 'Settings' },
    ]

    it('sidebar visible items match server-authorized modules exactly for Pro user', () => {
      const sidebarAllowed = allNavItems
        .filter(item => canAccessModulePolicy(proUser, item.id, DEFAULT_GUEST_PERMISSIONS, proEntitlements))
        .map(i => i.id)

      // Expected for Pro: today, calendar, activities, journal, notes, documents, settings
      expect(sidebarAllowed).toEqual([
        'today',
        'calendar',
        'activities',
        'journal',
        'notes',
        'documents',
        'settings',
      ])

      // Verify each matches canAccessModule from AuthorizationService
      for (const item of allNavItems) {
        const isSidebarVisible = sidebarAllowed.includes(item.id)
        const isRouteAllowed = AuthorizationService.canAccessModule(proUser, item.id, DEFAULT_GUEST_PERMISSIONS, proEntitlements)
        expect(isSidebarVisible).toBe(isRouteAllowed)
      }
    })

    it('sidebar visible items match server-authorized modules exactly for Free user', () => {
      const sidebarAllowed = allNavItems
        .filter(item => canAccessModulePolicy(freeUser, item.id, DEFAULT_GUEST_PERMISSIONS, freeEntitlements))
        .map(i => i.id)

      // Expected for Free with DEFAULT_GUEST_PERMISSIONS: only settings
      expect(sidebarAllowed).toEqual(['settings'])

      for (const item of allNavItems) {
        const isSidebarVisible = sidebarAllowed.includes(item.id)
        const isRouteAllowed = AuthorizationService.canAccessModule(freeUser, item.id, DEFAULT_GUEST_PERMISSIONS, freeEntitlements)
        expect(isSidebarVisible).toBe(isRouteAllowed)
      }
    })
  })

  // ─── 8. Downgrade immediately removes Pro-only access ─────────────────────────
  describe('8. Downgrade immediate revocation', () => {
    it('immediately gates Pro modules when entitlements snapshot updates from Pro to Free', () => {
      let currentEntitlements = proEntitlements

      // While Pro is active
      expect(canAccessModulePolicy(proUser, 'documents', DEFAULT_GUEST_PERMISSIONS, currentEntitlements)).toBe(true)
      expect(canAccessModulePolicy(proUser, 'calendar', DEFAULT_GUEST_PERMISSIONS, currentEntitlements)).toBe(true)

      // Subscription ends / cancels and entitlement refreshes
      currentEntitlements = freeEntitlements

      // Immediately revoked
      expect(canAccessModulePolicy(proUser, 'documents', DEFAULT_GUEST_PERMISSIONS, currentEntitlements)).toBe(false)
      expect(canAccessModulePolicy(proUser, 'calendar', DEFAULT_GUEST_PERMISSIONS, currentEntitlements)).toBe(false)
      expect(canAccessModulePolicy(proUser, 'journal', DEFAULT_GUEST_PERMISSIONS, currentEntitlements)).toBe(false)
      expect(canAccessModulePolicy(proUser, 'notes', DEFAULT_GUEST_PERMISSIONS, currentEntitlements)).toBe(false)
    })
  })

  // ─── 9. Capability Layer Pro Unlocking ────────────────────────────────────────
  describe('9. Capability layer Pro unlocking', () => {
    it('authorizes vault.read, vault.write, journal.read, calendar.personal for Pro users', () => {
      expect(AuthorizationService.canAccess(proUser, 'vault.read', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccess(proUser, 'vault.write', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccess(proUser, 'journal.read', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
      expect(AuthorizationService.canAccess(proUser, 'calendar.personal', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(true)
    })

    it('denies core.owner and settings.manage for non-owners regardless of Pro subscription', () => {
      expect(AuthorizationService.canAccess(proUser, 'core.owner', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(false)
      expect(AuthorizationService.canAccess(proUser, 'settings.manage', DEFAULT_GUEST_PERMISSIONS, proEntitlements)).toBe(false)
    })
  })
})
