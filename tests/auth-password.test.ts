import { describe, it, expect, beforeEach } from 'bun:test'
import { AuthService } from '@/lib/services/AuthService'

describe('Password Authentication & Rate Limiting Suite (#49)', () => {
  beforeEach(() => {
    // Reset rate limits between tests
    AuthService.clearRateLimit('test-user')
    AuthService.clearRateLimit('legacy-user')
    AuthService.clearRateLimit('bad-actor')
  })

  describe('Password Validation & Rules', () => {
    it('rejects passwords shorter than 8 characters', () => {
      const result = AuthService.validatePassword('short12')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 8 characters')
    })

    it('rejects passwords longer than 128 characters', () => {
      const longPass = 'a'.repeat(129)
      const result = AuthService.validatePassword(longPass)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('cannot exceed 128 characters')
    })

    it('accepts passwords between 8 and 128 characters', () => {
      const result = AuthService.validatePassword('SuperSecureP@ss123')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('scrypt Hashing & Verification', () => {
    it('hashes passwords using scrypt prefix', () => {
      const hash = AuthService.hashPassword('MySecretPassphrase', 'test-user')
      expect(hash.startsWith('scrypt:')).toBe(true)
      expect(hash.length).toBeGreaterThan(40)
    })

    it('successfully verifies valid scrypt password', () => {
      const password = 'MySecretPassphrase'
      const username = 'test-user'
      const hash = AuthService.hashPassword(password, username)
      
      const verified = AuthService.verifyPassword(password, username, hash)
      expect(verified).toBe(true)
    })

    it('rejects wrong scrypt password', () => {
      const password = 'MySecretPassphrase'
      const username = 'test-user'
      const hash = AuthService.hashPassword(password, username)
      
      const verified = AuthService.verifyPassword('WrongPassword', username, hash)
      expect(verified).toBe(false)
    })
  })

  describe('Rate Limiting & Lockout', () => {
    it('allows up to 5 attempts before locking out', () => {
      const username = 'bad-actor'
      
      // Attempts 1 to 4 should be allowed
      for (let i = 1; i <= 4; i++) {
        expect(AuthService.checkRateLimit(username).allowed).toBe(true)
        AuthService.recordFailedAttempt(username)
      }

      // 5th attempt is still checked before failing
      expect(AuthService.checkRateLimit(username).allowed).toBe(true)
      AuthService.recordFailedAttempt(username)

      // 6th attempt should now be locked out
      const check = AuthService.checkRateLimit(username)
      expect(check.allowed).toBe(false)
      expect(check.error || '').toContain('Too many failed login attempts')
    })

    it('clears rate limit upon successful login', () => {
      const username = 'bad-actor'
      AuthService.recordFailedAttempt(username)
      AuthService.recordFailedAttempt(username)
      expect(AuthService.checkRateLimit(username).allowed).toBe(true)

      AuthService.clearRateLimit(username)
      // Should reset failed count to 0
      for (let i = 1; i <= 4; i++) {
        AuthService.recordFailedAttempt(username)
      }
      expect(AuthService.checkRateLimit(username).allowed).toBe(true)
    })
  })

  describe('Legacy PIN Backwards Compatibility & Migration Indicator', () => {
    it('verifies legacy PBKDF2 PIN and marks requiresPasswordMigration = true', async () => {
      const username = 'legacy-user'
      const legacyPin = '1234'
      const legacyHash = AuthService.hashPin(legacyPin, username)
      
      // Ensure legacy hash does NOT have scrypt: prefix
      expect(legacyHash.startsWith('scrypt:')).toBe(false)

      const { db } = await import('@/lib/db')
      const origFindUnique = db.user.findUnique
      ;(db.user as unknown as { findUnique: (args: unknown) => unknown }).findUnique = () =>
        Promise.resolve({
          id: 'user-legacy-id',
          username,
          passwordHash: legacyHash,
          email: 'legacy@example.com',
        })

      try {
        const result = await AuthService.verifyCredentials(username, legacyPin)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.requiresPasswordMigration).toBe(true)
        }
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = origFindUnique
      }
    })

    it('verifies modern scrypt password and marks requiresPasswordMigration = false', async () => {
      const username = 'modern-user'
      const password = 'CorrectPassword123'
      const modernHash = AuthService.hashPassword(password, username)

      const { db } = await import('@/lib/db')
      const origFindUnique = db.user.findUnique
      ;(db.user as unknown as { findUnique: (args: unknown) => unknown }).findUnique = () =>
        Promise.resolve({
          id: 'user-modern-id',
          username,
          passwordHash: modernHash,
          email: 'modern@example.com',
        })

      try {
        const result = await AuthService.verifyCredentials(username, password)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.requiresPasswordMigration).toBe(false)
        }
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = origFindUnique
      }
    })
  })
})
