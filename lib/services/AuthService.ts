import { db } from '@/lib/db'
import { CredentialService } from './CredentialService'
import { SessionService } from './SessionService'
import { AuthorizationService, AuthenticatedUser } from './AuthorizationService'
import { DefaultActivitiesService } from './DefaultActivitiesService'

export type { AuthenticatedUser } from './AuthorizationService'

export type LoginResult =
  | { success: true; user: AuthenticatedUser; token: string; requiresPasswordMigration?: boolean }
  | { success: false; error: string }

export type RegisterResult =
  | { success: true; user: { id: string; username: string }; token: string }
  | { success: false; error: string }
 
export const hashPin = CredentialService.hashLegacyPin
export const legacyHashPin = CredentialService.legacyHashPin
export const hashPassword = CredentialService.hashPassword
export const verifyPassword = CredentialService.verifyPassword

export class AuthService {
  // Expose credential helper delegations for backward compatibility
  public static hashPassword = CredentialService.hashPassword
  public static verifyPassword = CredentialService.verifyPassword
  public static hashPin = CredentialService.hashLegacyPin
  public static legacyHashPin = CredentialService.legacyHashPin
  public static validatePassword = CredentialService.validatePassword
  public static checkRateLimit = CredentialService.checkRateLimit
  public static recordFailedAttempt = CredentialService.recordFailedAttempt
  public static clearRateLimit = CredentialService.clearRateLimit

  /**
   * Canonical login flow: validates credentials, enforces rate limiting, checks legacy PIN migration.
   */
  public static async login(
    usernameInput: string,
    secret: string
  ): Promise<LoginResult> {
    const username = usernameInput.trim().toLowerCase()
    if (!username) {
      return { success: false, error: 'Username is required.' }
    }
    if (!secret) {
      return { success: false, error: 'Password or PIN is required.' }
    }

    // Check rate limit
    const rateCheck = CredentialService.checkRateLimit(username)
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many failed login attempts. Please wait ${rateCheck.waitSeconds} seconds before trying again.`,
      }
    }

    const user = await db.user.findUnique({
      where: { username },
    })

    if (!user) {
      CredentialService.recordFailedAttempt(username)
      return { success: false, error: 'Incorrect username or password.' }
    }

    if (!user.passwordHash) {
      return {
        success: false,
        error: 'You need to login with Google as password login is not setup for you.',
      }
    }

    let isMatch = false
    let isLegacyPinMatch = false

    // 1. If stored hash is modern scrypt hash
    if (user.passwordHash.startsWith('scrypt:')) {
      isMatch = await CredentialService.verifyPassword(secret, username, user.passwordHash)
    } else {
      // 2. Stored hash is PBKDF2 legacy PIN hash
      const pinHash = CredentialService.hashLegacyPin(secret, username)
      if (user.passwordHash === pinHash) {
        isMatch = true
        isLegacyPinMatch = true
      } else if (username === 'admin') {
        const legacyHash = CredentialService.legacyHashPin(secret)
        if (user.passwordHash === legacyHash) {
          isMatch = true
          isLegacyPinMatch = true
        }
      }
    }

    if (!isMatch) {
      CredentialService.recordFailedAttempt(username)
      return { success: false, error: 'Incorrect username or password.' }
    }

    // Successful login clears rate limit counter
    CredentialService.clearRateLimit(username)

    const token = SessionService.signSession(user.id, user.username)
    const isOwner = AuthorizationService.isOwner(user)

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isOwner,
      },
      token,
      requiresPasswordMigration: isLegacyPinMatch,
    }
  }

  /**
   * Compatibility alias for verifyCredentials.
   */
  public static async verifyCredentials(usernameInput: string, secret: string): Promise<LoginResult> {
    return this.login(usernameInput, secret)
  }

  /**
   * Canonical user registration flow. Creates user and default starter activities transactionally.
   */
  public static async register(
    usernameInput: string,
    secret: string
  ): Promise<RegisterResult> {
    const username = usernameInput.trim().toLowerCase()
    if (!username || username.length < 2) {
      return { success: false, error: 'Username must be at least 2 characters.' }
    }

    const passCheck = CredentialService.validatePassword(secret)
    if (!passCheck.valid) {
      return { success: false, error: passCheck.error || 'Invalid password' }
    }

    // Check if username already exists
    const existing = await db.user.findUnique({
      where: { username }
    })

    if (existing) {
      return { success: false, error: 'Username is already taken.' }
    }

    const passwordHash = await CredentialService.hashPassword(secret, username)
    const newUser = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username,
          passwordHash,
        }
      })

      // Create default starter activities for new users
      await DefaultActivitiesService.seedDefaultActivities(u.id, tx)
      return u
    })

    const token = SessionService.signSession(newUser.id, newUser.username)

    return {
      success: true,
      user: { id: newUser.id, username: newUser.username },
      token,
    }
  }

  /**
   * Migration helper: upgrades an authenticated user's credentials from legacy PIN to scrypt password.
   */
  public static async migratePinToPassword(
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    const passCheck = CredentialService.validatePassword(newPassword)
    if (!passCheck.valid) {
      return { success: false, error: passCheck.error }
    }

    const user = await db.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const passwordHash = await CredentialService.hashPassword(newPassword, user.username)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash }
    })

    return { success: true }
  }

  /**
   * Delegates token-based user resolution to SessionService.
   */
  public static async resolveUserFromToken(token: string | null | undefined): Promise<AuthenticatedUser | null> {
    return SessionService.resolveUserFromToken(token)
  }

  /**
   * Delegates request-based user resolution to SessionService.
   */
  public static async resolveAuthFromRequest(request: Request): Promise<AuthenticatedUser | null> {
    return SessionService.resolveAuthFromRequest(request)
  }

  /**
   * Invalidates active session and clears session cookie.
   */
  public static async logout(): Promise<void> {
    await SessionService.invalidateSession()
  }
}
