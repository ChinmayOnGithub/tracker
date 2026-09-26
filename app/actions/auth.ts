"use server"

import { db } from '@/lib/db'
import { AuthService } from '@/lib/services/AuthService'
import { SessionService } from '@/lib/services/SessionService'
import { CredentialService } from '@/lib/services/CredentialService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { OnboardingService } from '@/lib/services/OnboardingService'

/**
 * Retrieves the currently logged-in user from the signed session token cookie.
 * Authoritative Server Action delegation to SessionService.
 */
export async function getLoggedUser(): Promise<{ id: string; username: string; email?: string | null; isOwner: boolean } | null> {
  return SessionService.getSessionUser()
}

/**
 * Registers a new user with a unique username and a secure password (minimum 8 characters).
 * Server Action adapter delegating to AuthService.
 */
export async function registerUserAction(usernameInput: string, secret: string): Promise<{
  success: boolean
  error?: string
  user?: { id: string; username: string }
  onboardingRequired?: boolean
}> {
  try {
    const result = await AuthService.register(usernameInput, secret)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    await SessionService.setSessionCookie(result.token)
    const onboarding = await OnboardingService.getState(result.user.id)
    return { success: true, user: result.user, onboardingRequired: onboarding?.status !== 'COMPLETED' }
  } catch (error) {
    console.error('[registerUserAction] Registration failed:', error)
    return { success: false, error: 'Database error during registration.' }
  }
}

/**
 * Verifies credentials (password or legacy PIN) and sets session cookie.
 * Server Action adapter delegating to AuthService.
 */
export async function verifyPinAction(usernameInput: string, secret: string): Promise<{
  success: boolean
  error?: string
  user?: { id: string; username: string }
  requiresPasswordMigration?: boolean
  onboardingRequired?: boolean
}> {
  try {
    const result = await AuthService.login(usernameInput, secret)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    await SessionService.setSessionCookie(result.token)
    const onboarding = await OnboardingService.getState(result.user.id)

    return {
      success: true,
      user: { id: result.user.id, username: result.user.username },
      requiresPasswordMigration: result.requiresPasswordMigration,
      onboardingRequired: onboarding?.status !== 'COMPLETED',
    }
  } catch (error) {
    console.error('[verifyPinAction] Login failed:', error)
    return { success: false, error: 'Database error during login.' }
  }
}

/**
 * Migration helper: allows an authenticated user to upgrade from legacy PIN to password.
 */
export async function migratePinToPasswordAction(newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await SessionService.getSessionUser()
    if (!loggedUser) return { success: false, error: 'Unauthorized' }

    return await AuthService.migratePinToPassword(loggedUser.id, newPassword)
  } catch (error) {
    console.error('[migratePinToPasswordAction] Failed to migrate password:', error)
    return { success: false, error: 'Database error while updating password.' }
  }
}

/**
 * Logs out the current user by deleting the session token cookie.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    await SessionService.invalidateSession()
    return { success: true }
  } catch (error) {
    console.error('[logoutAction] Logout failed:', error)
    return { success: false }
  }
}

/**
 * Simple helper to check if any user is configured in the system.
 */
export async function isPinSetup(): Promise<boolean> {
  try {
    const count = await db.user.count()
    return count > 0
  } catch (error) {
    console.error('[isPinSetup] Failed to check user counts:', error)
    return false
  }
}

/**
 * Gets the current user's profile details and access capabilities.
 */
export async function getUserProfileAction(): Promise<{
  success: boolean
  user?: {
    id: string
    username: string
    email: string | null
    authProvider: 'Google' | 'Passcode'
    isOwner: boolean
    accessLevel: 'Private Owner' | 'Shared Tools'
    hasPasscode: boolean
    avatarUrl?: string | null
    createdAt: string
  }
}> {
  try {
    const loggedUser = await SessionService.getSessionUser()
    if (!loggedUser) return { success: false }
    const user = await db.user.findUnique({
      where: { id: loggedUser.id },
      select: { id: true, username: true, email: true, googleId: true, passwordHash: true, createdAt: true }
    })
    if (!user) return { success: false }

    const profileSetting = await db.userSetting.findUnique({
      where: { userId_module: { userId: user.id, module: 'PROFILE' } }
    })
    const profileConfig = (profileSetting?.config as Record<string, unknown>) || {}
    const avatarUrl = (profileConfig.avatarUrl || profileConfig.picture) as string | undefined | null

    const isOwner = AuthorizationService.isOwner(user)

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        authProvider: user.googleId ? 'Google' : 'Passcode',
        isOwner,
        accessLevel: isOwner ? 'Private Owner' : 'Shared Tools',
        hasPasscode: !!user.passwordHash,
        avatarUrl: avatarUrl || null,
        createdAt: user.createdAt.toISOString()
      }
    }
  } catch (error) {
    console.error('[getUserProfileAction] Failed to get user profile:', error)
    return { success: false }
  }
}

/**
 * Sets or removes the current user's password.
 * Always hashes using scrypt. PBKDF2 is isolated to legacy migration.
 */
export async function setPasscodeAction(secret: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await SessionService.getSessionUser()
    if (!loggedUser) return { success: false, error: 'Unauthorized' }

    if (secret === null) {
      await db.user.update({
        where: { id: loggedUser.id },
        data: { passwordHash: null }
      })
      return { success: true }
    }

    const passCheck = CredentialService.validatePassword(secret)
    if (!passCheck.valid) {
      return { success: false, error: passCheck.error }
    }
    const passwordHash = await CredentialService.hashPassword(secret, loggedUser.username)

    await db.user.update({
      where: { id: loggedUser.id },
      data: { passwordHash }
    })

    return { success: true }
  } catch (error) {
    console.error('[setPasscodeAction] Failed to update password:', error)
    return { success: false, error: 'Database error while setting password.' }
  }
}

/**
 * Runs an audit of all user accounts and their credential statuses.
 * Strictly restricted to owner/admin accounts via AuthorizationService.
 */
export async function runMigrationAuditAction(): Promise<{
  success: boolean
  audit?: import('@/lib/services/MigrationAuditService').MigrationAuditSummary
  error?: string
}> {
  try {
    const owner = await AuthorizationService.requireOwner()
    if (!owner) {
      return { success: false, error: 'Unauthorized: Owner access required.' }
    }

    const { MigrationAuditService } = await import('@/lib/services/MigrationAuditService')
    const audit = await MigrationAuditService.runAudit()
    return { success: true, audit }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Audit failed.'
    return { success: false, error: message }
  }
}
