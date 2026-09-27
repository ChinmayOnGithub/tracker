"use server"

import { db } from '@/lib/db'
import { AuthService } from '@/lib/services/AuthService'
import { SessionService } from '@/lib/services/SessionService'
import { CredentialService } from '@/lib/services/CredentialService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { OnboardingService } from '@/lib/services/OnboardingService'
import crypto from 'crypto'
import { cookies } from 'next/headers'

const LOGIN_SECURITY_MODULE = 'LOGIN_SECURITY'
const HUMAN_CHALLENGE_COOKIE = 'tracker_human_challenge'
const HUMAN_VERIFIED_COOKIE = 'tracker_human_verified'
const HUMAN_CHALLENGE_MAX_AGE_MS = 10 * 60 * 1000

function signHumanChallenge(timestamp: number, nonce: string): string {
  const payload = `${timestamp}.${nonce}`
  const signature = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'dev-secret').update(payload).digest('hex')
  return `${payload}.${signature}`
}

function verifyHumanChallengeToken(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [timestampRaw, nonce, signature] = parts
  const timestamp = Number(timestampRaw)
  if (!Number.isFinite(timestamp) || !nonce || !signature) return false
  if (Date.now() - timestamp < 700 || Date.now() - timestamp > HUMAN_CHALLENGE_MAX_AGE_MS) return false
  const expected = signHumanChallenge(timestamp, nonce)
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected.split('.').at(-1)!))
}

export async function getLoginSecuritySettingsAction(): Promise<{ success: boolean; humanVerificationEnabled: boolean }> {
  try {
    const owner = await AuthorizationService.getCanonicalOwner()
    const setting = owner
      ? await db.userSetting.findUnique({
          where: { userId_module: { userId: owner.id, module: LOGIN_SECURITY_MODULE } },
        })
      : null
    const config = (setting?.config as { humanVerificationEnabled?: boolean } | null) || {}
    return { success: true, humanVerificationEnabled: config.humanVerificationEnabled !== false }
  } catch {
    return { success: true, humanVerificationEnabled: true }
  }
}

export async function issueHumanChallengeAction(): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const crypto = await import('crypto')
    const timestamp = Date.now()
    const nonce = crypto.randomBytes(16).toString('hex')
    const token = signHumanChallenge(timestamp, nonce)
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    cookieStore.set(HUMAN_CHALLENGE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(HUMAN_CHALLENGE_MAX_AGE_MS / 1000),
      path: '/',
    })
    return { success: true, token }
  } catch {
    return { success: false, error: 'Could not start security verification.' }
  }
}

export async function verifyHumanChallengeAction(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const stored = cookieStore.get(HUMAN_CHALLENGE_COOKIE)?.value
    if (!stored || stored !== token || !verifyHumanChallengeToken(token)) {
      return { success: false, error: 'Complete the security check before logging in.' }
    }
    cookieStore.delete(HUMAN_CHALLENGE_COOKIE)
    cookieStore.set(HUMAN_VERIFIED_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(HUMAN_CHALLENGE_MAX_AGE_MS / 1000),
      path: '/',
    })
    return { success: true }
  } catch {
    return { success: false, error: 'Security verification failed.' }
  }
}

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
export async function registerUserAction(usernameInput: string, secret: string, humanChallengeToken?: string): Promise<{
  success: boolean
  error?: string
  user?: { id: string; username: string }
  onboardingRequired?: boolean
}> {
  try {
    const security = await getLoginSecuritySettingsAction()
    if (security.humanVerificationEnabled) {
      const { cookies } = await import('next/headers')
      const verified = (await cookies()).get(HUMAN_VERIFIED_COOKIE)?.value === '1'
      if (!verified) return { success: false, error: 'Complete the security check before signing up.' }
    }
    const result = await AuthService.register(usernameInput, secret)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    await SessionService.setSessionCookie(result.token)
    (await cookies()).delete(HUMAN_VERIFIED_COOKIE)
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
export async function verifyPinAction(usernameInput: string, secret: string, humanChallengeToken?: string): Promise<{
  success: boolean
  error?: string
  user?: { id: string; username: string }
  requiresPasswordMigration?: boolean
  onboardingRequired?: boolean
}> {
  try {
    const security = await getLoginSecuritySettingsAction()
    if (security.humanVerificationEnabled) {
      const { cookies } = await import('next/headers')
      const verified = (await cookies()).get(HUMAN_VERIFIED_COOKIE)?.value === '1'
      if (!verified) return { success: false, error: 'Complete the security check before logging in.' }
    }
    const result = await AuthService.login(usernameInput, secret)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    await SessionService.setSessionCookie(result.token)
    if ((await import('next/headers')).cookies) (await (await import('next/headers')).cookies()).delete(HUMAN_VERIFIED_COOKIE)
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
