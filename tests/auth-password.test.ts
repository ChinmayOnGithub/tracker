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
    it('hashes passwords using scrypt prefix', async () => {
      const hash = await AuthService.hashPassword('MySecretPassphrase', 'test-user')
      expect(hash.startsWith('scrypt:')).toBe(true)
      expect(hash.length).toBeGreaterThan(40)
    })

    it('successfully verifies valid scrypt password', async () => {
      const password = 'MySecretPassphrase'
      const username = 'test-user'
      const hash = await AuthService.hashPassword(password, username)
      
      const verified = await AuthService.verifyPassword(password, username, hash)
      expect(verified).toBe(true)
    })

    it('rejects wrong scrypt password', async () => {
      const password = 'MySecretPassphrase'
      const username = 'test-user'
      const hash = await AuthService.hashPassword(password, username)
      
      const verified = await AuthService.verifyPassword('WrongPassword', username, hash)
      expect(verified).toBe(false)
    })
  })

  describe('Rate Limiting & Lockout', () => {
    it('allows up to 5 attempts before locking out', () => {
      const key = 'user-test-lockout'
      // First 5 attempts should be allowed
      for (let i = 0; i < 5; i++) {
        expect(AuthService.checkRateLimit(key).allowed).toBe(true)
        AuthService.recordFailedAttempt(key)
      }

      // 6th attempt onwards should be rejected
      const rateCheck = AuthService.checkRateLimit(key)
      expect(rateCheck.allowed).toBe(false)
      expect(rateCheck.waitSeconds).toBeGreaterThan(0)
    })

    it('clears rate limits properly upon reset', () => {
      const key = 'user-reset-test'
      for (let i = 0; i < 5; i++) {
        AuthService.recordFailedAttempt(key)
      }
      expect(AuthService.checkRateLimit(key).allowed).toBe(false)

      AuthService.clearRateLimit(key)
      expect(AuthService.checkRateLimit(key).allowed).toBe(true)
    })
  })

  describe('Credential Verification Flow (Integration)', () => {
    it('verifies legacy PBKDF2 PIN and marks requiresPasswordMigration = true', async () => {
      const username = 'legacy-pin-user'
      const pin = '1234'
      const legacyHash = AuthService.hashPin(pin, username)

      const { db } = await import('@/lib/db')
      const origFindUnique = db.user.findUnique
      ;(db.user as unknown as { findUnique: (args: unknown) => unknown }).findUnique = () =>
        Promise.resolve({
          id: 'user-pin-id',
          username,
          passwordHash: legacyHash,
          email: 'test@example.com',
        })

      try {
        const result = await AuthService.verifyCredentials(username, pin)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.requiresPasswordMigration).toBe(true)
          expect(result.token).toBeDefined()
        }
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = origFindUnique
      }
    })

    it('verifies modern scrypt password and marks requiresPasswordMigration = false', async () => {
      const username = 'modern-user'
      const password = 'CorrectPassword123'
      const modernHash = await AuthService.hashPassword(password, username)

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
