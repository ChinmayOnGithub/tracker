import { describe, it, expect } from 'bun:test'
import { canAccess } from '@/lib/auth-guards'

describe('Centralized Capability and Authorization Guard (canAccess)', () => {
  const ownerUser = { id: 'u-owner', username: 'chinmay', email: 'chinmaydpatil09@gmail.com' }
  const legacyAdminUser = { id: 'u-admin', username: 'admin', email: null }
  const guestUser = { id: 'u-guest', username: 'guest_roommate', email: 'roommate@example.com' }

  it('should deny all capabilities when user is null or undefined', () => {
    expect(canAccess(null, 'journal.read')).toBe(false)
    expect(canAccess(undefined, 'vault.read')).toBe(false)
    expect(canAccess(null, 'room-turn.read')).toBe(false)
  })

  it('should authorize owner and admin for private core modules', () => {
    expect(canAccess(ownerUser, 'journal.read')).toBe(true)
    expect(canAccess(ownerUser, 'journal.write')).toBe(true)
    expect(canAccess(ownerUser, 'vault.read')).toBe(true)
    expect(canAccess(ownerUser, 'calendar.personal')).toBe(true)
    expect(canAccess(ownerUser, 'leave.read')).toBe(true)
    expect(canAccess(ownerUser, 'weight.read')).toBe(true)
    expect(canAccess(ownerUser, 'work-hours.read')).toBe(true)
    expect(canAccess(ownerUser, 'settings.manage')).toBe(true)

    expect(canAccess(legacyAdminUser, 'journal.read')).toBe(true)
    expect(canAccess(legacyAdminUser, 'vault.read')).toBe(true)
    expect(canAccess(legacyAdminUser, 'calendar.personal')).toBe(true)
  })

  it('should strictly block guest/non-owner accounts from private core modules', () => {
    expect(canAccess(guestUser, 'journal.read')).toBe(false)
    expect(canAccess(guestUser, 'journal.write')).toBe(false)
    expect(canAccess(guestUser, 'vault.read')).toBe(false)
    expect(canAccess(guestUser, 'vault.write')).toBe(false)
    expect(canAccess(guestUser, 'calendar.personal')).toBe(false)
    expect(canAccess(guestUser, 'leave.read')).toBe(false)
    expect(canAccess(guestUser, 'weight.read')).toBe(false)
    expect(canAccess(guestUser, 'work-hours.read')).toBe(false)
    expect(canAccess(guestUser, 'settings.manage')).toBe(false)
  })

  it('should deny unknown or unconfigured capabilities by default', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccess(ownerUser, 'unknown.module.doSomething' as any)).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccess(guestUser, 'future.shared.tool' as any)).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccess(legacyAdminUser, 'nonexistent.capability' as any)).toBe(false)
  })

  it('should permit authenticated guest/shared accounts to access future shared tools', () => {
    expect(canAccess(guestUser, 'room-turn.read')).toBe(true)
    expect(canAccess(guestUser, 'room-turn.write')).toBe(true)
    expect(canAccess(guestUser, 'grocery.read')).toBe(true)
    expect(canAccess(guestUser, 'grocery.write')).toBe(true)
    expect(canAccess(guestUser, 'shared-finance.read')).toBe(true)
    expect(canAccess(guestUser, 'shared-finance.write')).toBe(true)
  })
})
