import { describe, it, expect } from 'bun:test'
import {
  isOwnerUser,
  canAccessModule,
  canAccess,
  DEFAULT_GUEST_PERMISSIONS,
  TrackerModuleKey
} from '@/lib/auth-guards'

describe('Guest Access Authorization Architecture End-to-End', () => {
  const ownerUser = {
    id: 'user-owner-1',
    username: 'chinmaydpatil09',
    email: 'chinmaydpatil09@gmail.com',
  }

  const legacyAdminUser = {
    id: 'user-admin-1',
    username: 'admin',
    email: null,
  }

  const guestUserB = {
    id: 'user-guest-b',
    username: 'test_guest_b',
    email: 'guest_b@example.com',
  }

  const guestUserC = {
    id: 'user-guest-c',
    username: 'test_guest_c',
    email: 'guest_c@example.com',
  }

  describe('1. Canonical Owner Resolution & Identification', () => {
    it('identifies whitelisted email as owner', () => {
      expect(isOwnerUser(ownerUser)).toBe(true)
    })

    it('identifies legacy admin username as owner', () => {
      expect(isOwnerUser(legacyAdminUser)).toBe(true)
    })

    it('identifies non-whitelisted accounts as guests (non-owner)', () => {
      expect(isOwnerUser(guestUserB)).toBe(false)
      expect(isOwnerUser(guestUserC)).toBe(false)
      expect(isOwnerUser(null)).toBe(false)
      expect(isOwnerUser(undefined)).toBe(false)
    })
  })

  describe('2. Owner Full Access vs Guest Module Gating', () => {
    const customPermissions: Record<TrackerModuleKey, boolean> = {
      ...DEFAULT_GUEST_PERMISSIONS,
      calendar: true,
      journal: true,
      weight: false,
      leave: false,
    }

    it('owner has access to all modules unconditionally', () => {
      const modules: TrackerModuleKey[] = [
        'today',
        'calendar',
        'activities',
        'journal',
        'leave',
        'weight',
        'links',
        'documents',
        'settings',
      ]
      for (const mod of modules) {
        expect(canAccessModule(ownerUser, mod, customPermissions)).toBe(true)
      }
    })

    it('guest has access only to owner-enabled modules', () => {
      expect(canAccessModule(guestUserB, 'calendar', customPermissions)).toBe(true)
      expect(canAccessModule(guestUserB, 'journal', customPermissions)).toBe(true)
      expect(canAccessModule(guestUserB, 'weight', customPermissions)).toBe(false)
      expect(canAccessModule(guestUserB, 'leave', customPermissions)).toBe(false)
    })

    it('guest always has access to personal settings', () => {
      expect(canAccessModule(guestUserB, 'settings', customPermissions)).toBe(true)
    })

    it('denies module access when guest permissions default to false', () => {
      expect(canAccessModule(guestUserB, 'journal', DEFAULT_GUEST_PERMISSIONS)).toBe(false)
      expect(canAccessModule(guestUserB, 'calendar', DEFAULT_GUEST_PERMISSIONS)).toBe(false)
    })
  })

  describe('3. Layered Capability Authorization', () => {
    const enabledPerms = {
      ...DEFAULT_GUEST_PERMISSIONS,
      calendar: true,
      journal: true,
      weight: false,
    }

    it('permits capability when corresponding module is enabled for guest', () => {
      expect(canAccess(guestUserB, 'calendar.personal', enabledPerms)).toBe(true)
      expect(canAccess(guestUserB, 'journal.read', enabledPerms)).toBe(true)
      expect(canAccess(guestUserB, 'journal.write', enabledPerms)).toBe(true)
    })

    it('denies capability when corresponding module is disabled for guest', () => {
      expect(canAccess(guestUserB, 'weight.read', enabledPerms)).toBe(false)
      expect(canAccess(guestUserB, 'weight.write', enabledPerms)).toBe(false)
      expect(canAccess(guestUserB, 'leave.read', enabledPerms)).toBe(false)
      expect(canAccess(guestUserB, 'vault.read', enabledPerms)).toBe(false)
    })

    it('strictly denies core.owner and settings.manage for guest even if other modules enabled', () => {
      expect(canAccess(guestUserB, 'core.owner', enabledPerms)).toBe(false)
      expect(canAccess(guestUserB, 'settings.manage', enabledPerms)).toBe(false)
      expect(canAccess(guestUserC, 'core.owner', enabledPerms)).toBe(false)
      expect(canAccess(guestUserC, 'settings.manage', enabledPerms)).toBe(false)
    })

    it('owner retains full capability access', () => {
      expect(canAccess(ownerUser, 'core.owner', enabledPerms)).toBe(true)
      expect(canAccess(ownerUser, 'settings.manage', enabledPerms)).toBe(true)
      expect(canAccess(ownerUser, 'journal.read', enabledPerms)).toBe(true)
      expect(canAccess(ownerUser, 'weight.read', enabledPerms)).toBe(true)
    })
  })

  describe('4. Multi-User Isolation: Multiple Guests Share Canonical Owner Policy', () => {
    const ownerPerms = {
      ...DEFAULT_GUEST_PERMISSIONS,
      calendar: true,
      activities: true,
      journal: false,
      weight: false,
    }

    it('Guest B and Guest C receive identical authorization under Owner policy', () => {
      expect(canAccessModule(guestUserB, 'calendar', ownerPerms)).toBe(true)
      expect(canAccessModule(guestUserC, 'calendar', ownerPerms)).toBe(true)

      expect(canAccessModule(guestUserB, 'journal', ownerPerms)).toBe(false)
      expect(canAccessModule(guestUserC, 'journal', ownerPerms)).toBe(false)
    })

    it('Guest B cannot elevate permissions or access disabled modules', () => {
      // Guest B has personal preferences, but canonical guest access rejects weight
      expect(canAccessModule(guestUserB, 'weight', ownerPerms)).toBe(false)
      expect(canAccess(guestUserB, 'weight.read', ownerPerms)).toBe(false)
    })
  })

  describe('5. Permission Updates / Dynamic State Transitions', () => {
    it('reflects permission updates immediately when owner toggles module', () => {
      const state1 = { ...DEFAULT_GUEST_PERMISSIONS, calendar: true, weight: false }
      expect(canAccessModule(guestUserB, 'calendar', state1)).toBe(true)
      expect(canAccessModule(guestUserB, 'weight', state1)).toBe(false)

      // Owner toggles: calendar -> false, weight -> true
      const state2 = { ...DEFAULT_GUEST_PERMISSIONS, calendar: false, weight: true }
      expect(canAccessModule(guestUserB, 'calendar', state2)).toBe(false)
      expect(canAccessModule(guestUserB, 'weight', state2)).toBe(true)
    })
  })
})
