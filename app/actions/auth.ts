"use server"

import { db } from '@/lib/db'
import { AuthService } from '@/lib/services/AuthService'
import { SessionService } from '@/lib/services/SessionService'
import { CredentialService } from '@/lib/services/CredentialService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { OnboardingService } from '@/lib/services/OnboardingService'
import { cookies, headers } from 'next/headers'
import crypto from 'crypto'
import { getCanonicalOrigin } from '@/lib/url'
import { EmailService } from '@/lib/services/EmailService'
import { rateLimiter, getClientIp } from '@/lib/services/RateLimiter'

const LOGIN_SECURITY_MODULE = 'LOGIN_SECURITY'
const HUMAN_VERIFIED_COOKIE = 'tracker_human_verified'
const HUMAN_CHALLENGE_COOKIE = 'tracker_human_challenge'
const _HUMAN_CHALLENGE_MAX_AGE_MS = 10 * 60 * 1000

const CLOUDFLARE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const DEV_TURNSTILE_SECRET_PASS = '1x0000000000000000000000000000000AA'

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!token) return false

  const secretKey =
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    (process.env.NODE_ENV !== 'production' ? DEV_TURNSTILE_SECRET_PASS : '')

  if (!secretKey) {
    console.error('[Turnstile] Missing CLOUDFLARE_TURNSTILE_SECRET_KEY while human verification is enabled. Rejecting.')
    return false
  }

  // If using Cloudflare's standard test pass token in development, allow immediate success
  if (token === 'XXXX.DUMMY.TOKEN.XXXX' || token.startsWith('dummy-')) {
    return process.env.NODE_ENV !== 'production'
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey)
    formData.append('response', token)

    const response = await fetch(CLOUDFLARE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    const outcome = (await response.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (!outcome.success) {
      console.warn('[Turnstile] Verification failed:', outcome['error-codes'])
    }
    return Boolean(outcome.success)
  } catch (err) {
    console.error('[Turnstile] Error verifying token with Cloudflare:', err)
    return false
  }
}

export async function getLoginSecuritySettingsAction(): Promise<{
  success: boolean
  humanVerificationEnabled: boolean
  turnstileSiteKey: string
}> {
  const configuredSiteKey =
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SITE_KEY

  const configuredSecretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
  const isProduction = process.env.NODE_ENV === 'production'

  const hasRealSiteKey = Boolean(configuredSiteKey && !configuredSiteKey.startsWith('1x00000000000000000000AA'))
  const hasRealSecretKey = Boolean(configuredSecretKey && !configuredSecretKey.startsWith('1x00000000000000000000'))
  // In production, BOTH site key and secret key must be present for human verification to be safely enabled.
  const hasCompleteProductionConfig = hasRealSiteKey && hasRealSecretKey

  const turnstileSiteKey = configuredSiteKey || '1x00000000000000000000AA'

  try {
    const owner = await AuthorizationService.getCanonicalOwner()
    const setting = owner
      ? await db.userSetting.findUnique({
          where: { userId_module: { userId: owner.id, module: LOGIN_SECURITY_MODULE } },
        })
      : null
    const config = (setting?.config as { humanVerificationEnabled?: boolean } | null) || {}

    // In production without complete Turnstile keys, auto-disable to protect login availability
    const shouldEnable = isProduction
      ? Boolean(hasCompleteProductionConfig && config.humanVerificationEnabled !== false)
      : config.humanVerificationEnabled !== false

    return {
      success: true,
      humanVerificationEnabled: shouldEnable,
      turnstileSiteKey,
    }
  } catch {
    return {
      success: true,
      humanVerificationEnabled: isProduction ? hasCompleteProductionConfig : true,
      turnstileSiteKey,
    }
  }
}

export async function issueHumanChallengeAction(): Promise<{ success: boolean; token?: string; error?: string }> {
  // Retained for backward compatibility
  return { success: true, token: 'ready' }
}

/**
 * Verifies Turnstile and issues a cryptographically random, single-use, flow-bound challenge (#190).
 */
export async function verifyHumanChallengeAction(
  token: string,
  flow: 'LOGIN' | 'SIGNUP' = 'LOGIN'
): Promise<{ success: boolean; error?: string }> {
  try {
    const isValid = await verifyTurnstileToken(token)
    if (!isValid) {
      return { success: false, error: 'Cloudflare security check failed. Please try again.' }
    }

    const cookieStore = await cookies()
    const nonce = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes validity

    await db.humanChallenge.create({
      data: {
        nonce,
        flow,
        expiresAt,
      }
    })

    cookieStore.set(HUMAN_CHALLENGE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    })

    cookieStore.set(HUMAN_VERIFIED_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    })

    return { success: true }
  } catch (err) {
    console.error('[verifyHumanChallengeAction] Challenge verification failed:', err)
    return { success: false, error: 'Security verification failed.' }
  }
}

/**
 * Validates and atomically consumes a flow-bound human challenge (#190).
 */
async function validateAndConsumeHumanChallenge(
  expectedFlow: 'LOGIN' | 'SIGNUP'
): Promise<{ valid: boolean; error?: string }> {
  const cookieStore = await cookies()
  const nonce = cookieStore.get(HUMAN_CHALLENGE_COOKIE)?.value

  if (!nonce) {
    return {
      valid: false,
      error: `Complete the security check before ${expectedFlow === 'SIGNUP' ? 'signing up' : 'logging in'}.`
    }
  }

  const now = new Date()
  const challenge = await db.humanChallenge.findUnique({
    where: { nonce }
  })

  if (!challenge || challenge.flow !== expectedFlow || challenge.consumedAt !== null || challenge.expiresAt <= now) {
    return {
      valid: false,
      error: 'Security verification has expired, already used, or is invalid for this flow. Please verify again.'
    }
  }

  // Atomically consume challenge
  const consumeResult = await db.humanChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now }
  })

  if (consumeResult.count !== 1) {
    return { valid: false, error: 'Security challenge has already been consumed.' }
  }

  cookieStore.delete(HUMAN_CHALLENGE_COOKIE)
  cookieStore.delete(HUMAN_VERIFIED_COOKIE)
  return { valid: true }
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
export async function registerUserAction(usernameInput: string, secret: string): Promise<{
  success: boolean
  error?: string
  user?: { id: string; username: string }
  onboardingRequired?: boolean
}> {
  try {
    const security = await getLoginSecuritySettingsAction()
    if (security.humanVerificationEnabled) {
      const challengeCheck = await validateAndConsumeHumanChallenge('SIGNUP')
      if (!challengeCheck.valid) {
        return { success: false, error: challengeCheck.error }
      }
    }
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
    let clientIp = '127.0.0.1'
    try {
      const reqHeaders = await headers()
      clientIp = getClientIp(reqHeaders)
    } catch {
      // Fallback if headers scope is unavailable (e.g. in test runner)
    }
    const normalizedIdentifier = usernameInput.trim().toLowerCase()

    // 1. IP-level rate limiting (fail closed) — increments on every request
    const ipLimit = await rateLimiter.check(`login:ip:${clientIp}`, 30, 60, { failClosed: true })
    if (!ipLimit.allowed) {
      return { success: false, error: `Too many login attempts. Please retry in ${ipLimit.retryAfterSeconds} seconds.` }
    }

    // 2. Account-level rate limiting (fail closed) — check state WITHOUT incrementing yet
    const accountLimitCheck = await rateLimiter.check(`login:account:${normalizedIdentifier}`, 5, 60, { failClosed: true, increment: false })
    if (!accountLimitCheck.allowed) {
      return { success: false, error: `Too many failed attempts for this account. Please retry in ${accountLimitCheck.retryAfterSeconds} seconds.` }
    }

    const security = await getLoginSecuritySettingsAction()
    if (security.humanVerificationEnabled) {
      const challengeCheck = await validateAndConsumeHumanChallenge('LOGIN')
      if (!challengeCheck.valid) {
        return { success: false, error: challengeCheck.error }
      }
    }
    const result = await AuthService.login(usernameInput, secret)
    if (!result.success) {
      // 3. Increment account rate limit counter only on credential failure
      await rateLimiter.check(`login:account:${normalizedIdentifier}`, 5, 60, { failClosed: false })
      return { success: false, error: result.error }
    }

    // 4. Clear failed account counter on successful login
    await rateLimiter.reset(`login:account:${normalizedIdentifier}`)

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
    return { success: false, error: 'Authentication service is temporarily unavailable. Please try again shortly.' }
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
 * Requires reauthentication with current password if a password is already set (#189).
 * Increments sessionVersion to invalidate existing/stolen sessions.
 */
export async function setPasscodeAction(
  secret: string | null,
  currentPassword?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const loggedUser = await SessionService.getSessionUser()
    if (!loggedUser) return { success: false, error: 'Unauthorized' }

    const user = await db.user.findUnique({
      where: { id: loggedUser.id },
      select: { id: true, username: true, passwordHash: true, sessionVersion: true }
    })
    if (!user) return { success: false, error: 'User not found' }

    // Reauthentication requirement (#189):
    // If the account already has an active password, changing or removing it requires current password verification
    if (user.passwordHash) {
      if (!currentPassword) {
        return { success: false, error: 'Current password is required to change or disable credentials.' }
      }
      const isCurrentValid = await CredentialService.verifyPassword(currentPassword, user.passwordHash, user.username)
      if (!isCurrentValid) {
        return { success: false, error: 'Current password verification failed.' }
      }
    }

    if (secret === null) {
      // Removing password / disabling passcode: bump sessionVersion so old sessions are invalidated
      const updatedUser = await db.user.update({
        where: { id: loggedUser.id },
        data: {
          passwordHash: null,
          sessionVersion: { increment: 1 }
        }
      })
      // Refresh current session cookie with new sessionVersion
      const newToken = SessionService.signSession(updatedUser.id, updatedUser.username, updatedUser.sessionVersion)
      await SessionService.setSessionCookie(newToken)
      return { success: true }
    }

    const passCheck = CredentialService.validatePassword(secret)
    if (!passCheck.valid) {
      return { success: false, error: passCheck.error }
    }
    const passwordHash = await CredentialService.hashPassword(secret, loggedUser.username)

    // Updating password: bump sessionVersion so any old/stolen sessions are invalidated
    const updatedUser = await db.user.update({
      where: { id: loggedUser.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 }
      }
    })
    // Refresh current session cookie with new sessionVersion
    const newToken = SessionService.signSession(updatedUser.id, updatedUser.username, updatedUser.sessionVersion)
    await SessionService.setSessionCookie(newToken)

    return { success: true }
  } catch (error) {
    console.error('[setPasscodeAction] Failed to update password:', error)
    return { success: false, error: 'Database error while setting password.' }
  }
}

/**
 * Requests a password reset link for the given email or username (#194).
 * Enumeration-safe: always returns the identical generic response regardless of whether the account exists.
 */
export async function requestPasswordResetAction(
  identifier: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const genericResponse = {
    success: true,
    message: 'If an account matches that email or username, password reset instructions have been sent.'
  }

  try {
    const reqHeaders = await headers()
    const clientIp = getClientIp(reqHeaders)

    // Strict rate limiting on password reset requests (fail-closed)
    const rateCheck = await rateLimiter.check(`password-reset:request:${clientIp}`, 5, 900, { failClosed: true })
    if (!rateCheck.allowed) {
      return {
        success: false,
        message: '',
        error: `Too many password reset requests. Please retry in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`
      }
    }

    if (!identifier?.trim()) {
      return genericResponse
    }

    // Delegate to AuthService — keeps auth.ts as a thin adapter (#194)
    const user = await AuthService.findUserForPasswordReset(identifier)
    if (!user) {
      return genericResponse
    }

    const rawToken = await AuthService.createPasswordResetToken(user.id)

    // Construct canonical HTTPS reset link (raw token delivered via URL, never logged or stored plaintext)
    const origin = getCanonicalOrigin()
    const resetUrl = `${origin}/reset-password?token=${rawToken}`

    if (user.email) {
      await EmailService.sendPasswordResetEmail(user.email, resetUrl)
    }

    return genericResponse
  } catch (error) {
    console.error('[requestPasswordResetAction] Reset request error:', error)
    return genericResponse
  }
}

/**
 * Resets a password using a valid, unexpired, unconsumed reset token (#194).
 * Atomic transaction guarantees: token valid -> token consumed -> password changed -> sessionVersion incremented.
 * Delegates all DB operations to AuthService to keep auth.ts as a thin adapter.
 */
export async function resetPasswordWithTokenAction(
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const reqHeaders = await headers()
    const clientIp = getClientIp(reqHeaders)

    // Strict rate limiting on reset attempts (fail-closed)
    const rateCheck = await rateLimiter.check(`password-reset:attempt:${clientIp}`, 10, 900, { failClosed: true })
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many password reset attempts. Please retry in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`
      }
    }

    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return { success: false, error: 'Invalid or missing password reset token.' }
    }

    const passCheck = CredentialService.validatePassword(newPassword)
    if (!passCheck.valid) {
      return { success: false, error: passCheck.error }
    }

    // Delegate to AuthService — keeps auth.ts as a thin adapter (#194)
    return await AuthService.consumePasswordResetToken(rawToken, newPassword)
  } catch (error) {
    console.error('[resetPasswordWithTokenAction] Reset failed:', error)
    return { success: false, error: 'Failed to reset password. Please try again.' }
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
