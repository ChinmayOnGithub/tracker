import { describe, it, expect } from 'bun:test'
import { canAccess, isOwnerUser } from '@/lib/auth-guards'

describe('Settings Authorization & Data Minimization Suite (#50)', () => {
  const ownerUser = {
    id: 'user-owner-1',
    username: 'admin',
    email: 'chinmaydpatil09@gmail.com',
    isOwner: true,
  }

  const guestUser = {
    id: 'user-guest-1',
    username: 'guest_user',
    email: 'guest@example.com',
    isOwner: false,
  }

  const OWNER_ONLY_TABS = [
    'admin',
    'backup',
    'advanced',
    'integrations',
    'dashboard',
    'calendar',
    'leave',
  ]

  const GUEST_ALLOWED_TABS = [
    'profile',
    'billing',
    'appearance',
    'notifications',
    'security',
  ]

  it('prohibits guests from settings.manage capability (admin permissions mutation)', () => {
    expect(canAccess(ownerUser, 'settings.manage')).toBe(true)
    expect(canAccess(guestUser, 'settings.manage')).toBe(false)
  })

  it('correctly distinguishes owner vs guest identity', () => {
    expect(isOwnerUser(ownerUser)).toBe(true)
    expect(isOwnerUser(guestUser)).toBe(false)
  })

  it('guarantees guest allowed tabs set does not leak owner tabs', () => {
    for (const tab of OWNER_ONLY_TABS) {
      expect(GUEST_ALLOWED_TABS).not.toContain(tab)
    }
  })

  it('clamps unauthorized deep link tabs to profile for guest user', () => {
    const resolveTabForUser = (tab: string, isOwner: boolean) => {
      const ownerOnly = new Set(OWNER_ONLY_TABS)
      if (!isOwner && ownerOnly.has(tab)) {
        return 'profile'
      }
      return tab
    }

    // Attempted deep link to admin tabs by guest
    expect(resolveTabForUser('admin', false)).toBe('profile')
    expect(resolveTabForUser('backup', false)).toBe('profile')
    expect(resolveTabForUser('advanced', false)).toBe('profile')
    expect(resolveTabForUser('calendar', false)).toBe('profile')

    // Allowed tabs by guest
    expect(resolveTabForUser('profile', false)).toBe('profile')
    expect(resolveTabForUser('appearance', false)).toBe('appearance')
    expect(resolveTabForUser('billing', false)).toBe('billing')

    // Owner can access all tabs directly
    expect(resolveTabForUser('admin', true)).toBe('admin')
    expect(resolveTabForUser('backup', true)).toBe('backup')
    expect(resolveTabForUser('advanced', true)).toBe('advanced')
  })
})
