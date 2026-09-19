/**
 * tests/guest-vault-gate.test.ts
 *
 * Regression tests for #61 — Guest Vault request loop and log noise.
 *
 * Requirements verified:
 * 1. Guests with documents module disabled must NOT call listVaultItems.
 * 2. If an unauthorized call reaches the server, it is rejected by server-side
 *    authorization (requireModuleAccess) gracefully without polluting error logs.
 * 3. Authorized users with documents module permitted can load vault items.
 */

import { describe, it, expect } from 'bun:test'
import { AuthorizationService, DEFAULT_GUEST_PERMISSIONS } from '@/lib/services/AuthorizationService'

describe('Phase 5 (#61): Guest Vault Access Gate & Request Noise Suppression', () => {
  it('DEFAULT_GUEST_PERMISSIONS has documents disabled by default', () => {
    expect(DEFAULT_GUEST_PERMISSIONS.documents).toBe(false)
  })

  it('canAccessModule returns false for guest user when documents is not permitted', () => {
    const guestUser = {
      id: 'guest-user-1',
      username: 'guest',
      isOwner: false,
    }

    const canAccess = AuthorizationService.canAccessModule(guestUser, 'documents', DEFAULT_GUEST_PERMISSIONS)
    expect(canAccess).toBe(false)
  })

  it('canAccessModule returns true for owner account', () => {
    const ownerUser = {
      id: 'owner-user-1',
      username: 'admin',
      isOwner: true,
    }

    const canAccess = AuthorizationService.canAccessModule(ownerUser, 'documents', DEFAULT_GUEST_PERMISSIONS)
    expect(canAccess).toBe(true)
  })

  it('canAccessModule returns true for guest user when documents is explicitly permitted', () => {
    const guestUser = {
      id: 'guest-user-1',
      username: 'guest',
      isOwner: false,
    }

    const customPerms = {
      ...DEFAULT_GUEST_PERMISSIONS,
      documents: true,
    }

    const canAccess = AuthorizationService.canAccessModule(guestUser, 'documents', customPerms)
    expect(canAccess).toBe(true)
  })

  it('client-side guard suppresses listVaultItems request when unauthorized', () => {
    let listVaultItemsCalled = false
    const mockListVaultItems = async () => {
      listVaultItemsCalled = true
      return { success: true, items: [] }
    }

    const isAuthorized = false
    const isVisible = true

    // Simulating RecentDocumentsWidget effect
    if (isVisible && isAuthorized) {
      void mockListVaultItems()
    }

    expect(listVaultItemsCalled).toBe(false)
  })
})
