import { db } from '@/lib/db'
import crypto from 'crypto'
import { signSession, verifySession } from '@/lib/session'
import { isAuthorizedUserEmail } from '@/lib/constants'

const SALT = process.env.AUTH_SALT || 'personal-dashboard-ops-salt-108-prayer-beads'

export function hashPin(pin: string, username: string): string {
  const userSalt = `${SALT}-${username.toLowerCase()}`
  return crypto.pbkdf2Sync(pin, userSalt, 1000, 64, 'sha512').toString('hex')
}

export function legacyHashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, SALT, 1000, 64, 'sha512').toString('hex')
}

export interface AuthenticatedUser {
  id: string
  username: string
  email?: string | null
  isOwner: boolean
}

export type VerifyCredentialsResult =
  | { success: true; user: AuthenticatedUser; token: string }
  | { success: false; error: string }

export class AuthService {
  /**
   * Authoritative credential verification against username and 4-digit PIN.
   * Handles legacy hash upgrade for single-user migrations.
   */
  public static async verifyCredentials(
    usernameInput: string,
    pin: string
  ): Promise<VerifyCredentialsResult> {
    const username = usernameInput.trim().toLowerCase()
    if (!username) {
      return { success: false, error: 'Username is required.' }
    }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits.' }
    }

    const user = await db.user.findUnique({
      where: { username },
    })

    if (!user) {
      return { success: false, error: 'Incorrect username or PIN.' }
    }

    if (!user.passwordHash) {
      return {
        success: false,
        error: 'You need to login with Google as passcode login is not setup for you.',
      }
    }

    const passwordHash = hashPin(pin, username)
    let isMatch = user.passwordHash === passwordHash

    // Safe migration/fallback for legacy single-user 'admin' account
    if (!isMatch && username === 'admin') {
      const legacyHash = legacyHashPin(pin)
      if (user.passwordHash === legacyHash) {
        isMatch = true
        try {
          const newHash = hashPin(pin, username)
          await db.user.update({
            where: { id: user.id },
            data: { passwordHash: newHash },
          })
        } catch (upgradeError) {
          console.warn('Failed to upgrade admin password hash format:', upgradeError)
        }
      }
    }

    if (!isMatch) {
      return { success: false, error: 'Incorrect username or PIN.' }
    }

    const token = signSession(user.id, user.username)
    const isOwner = user.username === 'admin' || isAuthorizedUserEmail(user.email || user.username)

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isOwner,
      },
      token,
    }
  }

  /**
   * Resolves the authenticated user from a signed session token.
   */
  public static async resolveUserFromToken(token: string | null | undefined): Promise<AuthenticatedUser | null> {
    if (!token) return null
    const session = verifySession(token)
    if (!session) return null

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, email: true },
    })

    if (!user) return null

    const isOwner = user.username === 'admin' || isAuthorizedUserEmail(user.email || user.username)
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isOwner,
    }
  }

  /**
   * Resolves authentication from an HTTP Request (checking Authorization: Bearer <token> or Cookie).
   */
  public static async resolveAuthFromRequest(request: Request): Promise<AuthenticatedUser | null> {
    const authHeader = request.headers.get('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim()
      return AuthService.resolveUserFromToken(token)
    }

    // Fallback: check cookie header if present
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const match = cookieHeader.match(/session_token=([^;]+)/)
      if (match && match[1]) {
        return AuthService.resolveUserFromToken(decodeURIComponent(match[1]))
      }
    }

    return null
  }
}
