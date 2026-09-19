import { describe, it, expect } from 'bun:test'
import { MigrationAuditService } from '@/lib/services/MigrationAuditService'

describe('User Migration Audit Suite (#53)', () => {
  describe('Email Masking (PII Protection)', () => {
    it('safely masks standard emails', () => {
      const masked = MigrationAuditService.maskEmail('chinmaydpatil09@gmail.com')
      expect(masked).toBe('ch***09@gmail.com')
    })

    it('handles short email prefixes', () => {
      const masked = MigrationAuditService.maskEmail('ab@test.com')
      expect(masked).toBe('a***@test.com')
    })

    it('handles null or empty emails safely', () => {
      expect(MigrationAuditService.maskEmail(null)).toBeNull()
      expect(MigrationAuditService.maskEmail('')).toBeNull()
    })
  })

  describe('Credential Categorization', () => {
    it('categorizes googleId as GOOGLE_OAUTH and requiresMigration = false', () => {
      const cat = MigrationAuditService.categorizeCredential('google-oauth-sub-12345', null)
      expect(cat.credentialType).toBe('GOOGLE_OAUTH')
      expect(cat.requiresMigration).toBe(false)
    })

    it('categorizes scrypt password as SCRYPT_PASSWORD and requiresMigration = false', () => {
      const cat = MigrationAuditService.categorizeCredential(null, 'scrypt:deadbeef12345678')
      expect(cat.credentialType).toBe('SCRYPT_PASSWORD')
      expect(cat.requiresMigration).toBe(false)
    })

    it('categorizes PBKDF2 hash as LEGACY_PIN and requiresMigration = true', () => {
      const cat = MigrationAuditService.categorizeCredential(null, '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
      expect(cat.credentialType).toBe('LEGACY_PIN')
      expect(cat.requiresMigration).toBe(true)
    })

    it('categorizes unconfigured accounts as UNCONFIGURED and requiresMigration = false', () => {
      const cat = MigrationAuditService.categorizeCredential(null, null)
      expect(cat.credentialType).toBe('UNCONFIGURED')
      expect(cat.requiresMigration).toBe(false)
    })
  })

  describe('runAudit Engine Integration', () => {
    it('aggregates user accounts accurately and never exposes raw passwordHash', async () => {
      const { db } = await import('@/lib/db')
      const origFindMany = db.user.findMany

      ;(db.user as unknown as { findMany: (args: unknown) => unknown }).findMany = () =>
        Promise.resolve([
          {
            id: 'u-1',
            username: 'admin',
            email: 'admin@example.com',
            googleId: null,
            passwordHash: 'legacy-pbkdf2-hash',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'u-2',
            username: 'google_user',
            email: 'user@gmail.com',
            googleId: 'g-sub-99',
            passwordHash: null,
            createdAt: new Date('2026-02-01'),
          },
          {
            id: 'u-3',
            username: 'modern_user',
            email: 'modern@company.org',
            googleId: null,
            passwordHash: 'scrypt:a0b1c2d3e4f5',
            createdAt: new Date('2026-03-01'),
          },
        ])

      try {
        const audit = await MigrationAuditService.runAudit()

        expect(audit.totalUsers).toBe(3)
        expect(audit.googleUsers).toBe(1)
        expect(audit.legacyPinUsers).toBe(1)
        expect(audit.passwordUsers).toBe(1)
        expect(audit.pendingMigrationsCount).toBe(1)

        // Verify data minimization: no passwordHash exposed on records
        const record = audit.users[0]
        expect(((record as unknown) as Record<string, unknown>).passwordHash).toBeUndefined()
        expect(record.username).toBe('admin')
        expect(record.maskedEmail).toBe('ad***in@example.com')
        expect(record.credentialType).toBe('LEGACY_PIN')
        expect(record.requiresMigration).toBe(true)
      } finally {
        ;(db.user as unknown as { findMany: unknown }).findMany = origFindMany
      }
    })
  })
})
