import crypto from 'crypto'

const SALT = process.env.AUTH_SALT || 'personal-dashboard-ops-salt-108-prayer-beads'

// In-memory rate limiting map: username/IP -> { attempts: number; resetAt: number }
const loginAttempts = new Map<string, { attempts: number; resetAt: number }>()

export class CredentialService {
  /**
   * Hashes a password using standard production scrypt parameters (N=16384, r=8, p=1, keylen=64).
   */
  public static hashPassword(password: string, username: string): string {
    const userSalt = `${SALT}-${username.toLowerCase()}`
    const key = crypto.scryptSync(password, userSalt, 64)
    return `scrypt:${key.toString('hex')}`
  }

  /**
   * Constant-time verification of password against stored scrypt hash.
   */
  public static verifyPassword(password: string, username: string, storedHash: string): boolean {
    if (storedHash.startsWith('scrypt:')) {
      const userSalt = `${SALT}-${username.toLowerCase()}`
      const key = crypto.scryptSync(password, userSalt, 64)
      const expected = `scrypt:${key.toString('hex')}`
      if (storedHash.length !== expected.length) {
        return false
      }
      return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(expected))
    }
    return false
  }

  /**
   * Hashes a legacy 4-digit PIN using PBKDF2 with user-specific salt.
   * Strictly isolated to migration and legacy authentication compatibility.
   */
  public static hashLegacyPin(pin: string, username: string): string {
    const userSalt = `${SALT}-${username.toLowerCase()}`
    return crypto.pbkdf2Sync(pin, userSalt, 1000, 64, 'sha512').toString('hex')
  }

  /**
   * Hashes a legacy 4-digit PIN using PBKDF2 with global salt.
   * Strictly isolated for legacy 'admin' accounts that were setup prior to per-user salts.
   */
  public static legacyHashPin(pin: string): string {
    return crypto.pbkdf2Sync(pin, SALT, 1000, 64, 'sha512').toString('hex')
  }

  /**
   * Validates password strength invariants (8 to 128 characters).
   */
  public static validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long.' }
    }
    if (password.length > 128) {
      return { valid: false, error: 'Password cannot exceed 128 characters.' }
    }
    return { valid: true }
  }

  /**
   * Checks whether the username/key has exceeded the failed login rate limit.
   */
  public static checkRateLimit(key: string): { allowed: boolean; waitSeconds?: number; error?: string } {
    const now = Date.now()
    const record = loginAttempts.get(key)
    if (!record) return { allowed: true }

    if (now > record.resetAt) {
      loginAttempts.delete(key)
      return { allowed: true }
    }

    if (record.attempts >= 5) {
      const waitSeconds = Math.ceil((record.resetAt - now) / 1000)
      return {
        allowed: false,
        waitSeconds,
        error: `Too many failed login attempts. Please wait ${waitSeconds} seconds before trying again.`
      }
    }

    return { allowed: true }
  }

  /**
   * Records a failed login attempt for the key, establishing a 5-minute lockout window upon threshold.
   */
  public static recordFailedAttempt(key: string): void {
    const now = Date.now()
    const record = loginAttempts.get(key)
    if (!record || now > record.resetAt) {
      loginAttempts.set(key, { attempts: 1, resetAt: now + 5 * 60 * 1000 })
    } else {
      record.attempts += 1
    }
  }

  /**
   * Clears the rate limiting record upon successful authentication.
   */
  public static clearRateLimit(key: string): void {
    loginAttempts.delete(key)
  }
}
