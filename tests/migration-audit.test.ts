import { describe, it, expect } from 'bun:test'
import { MigrationAuditService } from '@/lib/services/MigrationAuditService'
import { CredentialService } from '@/lib/services/CredentialService'
import { db } from '@/lib/db'

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

  describe('Billing Categorization', () => {
    it('classifies owner account as MANUAL_LEGACY_PREMIUM', () => {
      const cat = MigrationAuditService.classifyBilling(true, [])
      expect(cat).toBe('MANUAL_LEGACY_PREMIUM')
    })

    it('classifies user with no subscriptions as FREE_USER', () => {
      const cat = MigrationAuditService.classifyBilling(false, [])
      expect(cat).toBe('FREE_USER')
    })

    it('classifies mock or test subscriptions as TEST_MODE_PRO', () => {
      const cat = MigrationAuditService.classifyBilling(false, [
        {
          status: 'ACTIVE',
          provider: 'MOCK',
          providerSubscriptionId: 'sub_test_mock_123',
          plan: 'PRO_MONTHLY',
          currentPeriodEnd: new Date(Date.now() + 1000000),
          deletedAt: null
        }
      ])
      expect(cat).toBe('TEST_MODE_PRO')
    })

    it('classifies live active subscriptions as PRODUCTION_PRO', () => {
      const cat = MigrationAuditService.classifyBilling(false, [
        {
          status: 'ACTIVE',
          provider: 'RAZORPAY',
          providerSubscriptionId: 'sub_live_real_999',
          plan: 'PRO_MONTHLY',
          currentPeriodEnd: new Date(Date.now() + 1000000),
          deletedAt: null
        }
      ])
      expect(cat).toBe('PRODUCTION_PRO')
    })

    it('classifies expired or cancelled subscriptions as HISTORICAL_CANCELLED', () => {
      const cat = MigrationAuditService.classifyBilling(false, [
        {
          status: 'CANCELLED',
          provider: 'RAZORPAY',
          providerSubscriptionId: 'sub_old',
          plan: 'PRO_MONTHLY',
          currentPeriodEnd: new Date(Date.now() - 100000),
          deletedAt: null
        }
      ])
      expect(cat).toBe('HISTORICAL_CANCELLED')
    })
  })

  describe('Safe Legacy PIN Migration (Zero-Trust Authentication)', () => {
    it('blocks migration if current PIN is incorrect', async () => {
      const originalFindUnique = db.user.findUnique
      try {
        const legacyHash = CredentialService.hashLegacyPin('1234', 'legacy_user')
        ;(db.user as unknown as { findUnique: () => Promise<unknown> }).findUnique = async () => ({
          id: 'u_leg_1',
          username: 'legacy_user',
          googleId: null,
          passwordHash: legacyHash
        })

        let error: Error | null = null
        try {
          await MigrationAuditService.upgradeLegacyPinToPassword('u_leg_1', '9999', 'SuperSecurePass123')
        } catch (e) {
          error = e as Error
        }

        expect(error).not.toBeNull()
        expect(error?.message).toContain('Invalid current PIN')
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique
      }
    })

    it('blocks migration if new password does not meet minimum length requirement', async () => {
      const originalFindUnique = db.user.findUnique
      try {
        const legacyHash = CredentialService.hashLegacyPin('1234', 'legacy_user')
        ;(db.user as unknown as { findUnique: () => Promise<unknown> }).findUnique = async () => ({
          id: 'u_leg_1',
          username: 'legacy_user',
          googleId: null,
          passwordHash: legacyHash
        })

        let error: Error | null = null
        try {
          await MigrationAuditService.upgradeLegacyPinToPassword('u_leg_1', '1234', 'short')
        } catch (e) {
          error = e as Error
        }

        expect(error).not.toBeNull()
        expect(error?.message).toContain('at least 8 characters long')
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique
      }
    })

    it('successfully migrates PIN to scrypt password and invalidates legacy PIN', async () => {
      const originalFindUnique = db.user.findUnique
      const originalUpdate = db.user.update
      let updatedData: { passwordHash: string } | null = null

      try {
        const legacyHash = CredentialService.hashLegacyPin('1234', 'legacy_user')
        ;(db.user as unknown as { findUnique: () => Promise<unknown> }).findUnique = async () => ({
          id: 'u_leg_1',
          username: 'legacy_user',
          googleId: null,
          passwordHash: legacyHash
        })

        ;(db.user as unknown as { update: (args: { data: { passwordHash: string } }) => Promise<unknown> }).update = async ({ data }) => {
          updatedData = data
          return { id: 'u_leg_1', ...data }
        }

        const result = await MigrationAuditService.upgradeLegacyPinToPassword(
          'u_leg_1',
          '1234',
          'ModernStrongPassword123'
        )

        expect(result.success).toBe(true)
        expect(updatedData).not.toBeNull()
        expect(updatedData!.passwordHash.startsWith('scrypt:')).toBe(true)

        // Verify that the new password verifies with CredentialService
        const verified = await CredentialService.verifyPassword(
          'ModernStrongPassword123',
          'legacy_user',
          updatedData!.passwordHash
        )
        expect(verified).toBe(true)
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique
        ;(db.user as unknown as { update: unknown }).update = originalUpdate
      }
    })
  })

  describe('runAudit Engine Integration', () => {
    it('aggregates user accounts accurately and never exposes raw passwordHash', async () => {
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
            subscriptions: []
          },
          {
            id: 'u-2',
            username: 'google_user',
            email: 'user@gmail.com',
            googleId: 'g-sub-99',
            passwordHash: null,
            createdAt: new Date('2026-02-01'),
            subscriptions: []
          },
          {
            id: 'u-3',
            username: 'modern_user',
            email: 'modern@company.org',
            googleId: null,
            passwordHash: 'scrypt:a0b1c2d3e4f5',
            createdAt: new Date('2026-03-01'),
            subscriptions: [
              {
                status: 'ACTIVE',
                provider: 'RAZORPAY',
                providerSubscriptionId: 'sub_live_real',
                plan: 'PRO_MONTHLY',
                currentPeriodEnd: new Date(Date.now() + 1000000),
                deletedAt: null
              }
            ]
          },
        ])

      try {
        const audit = await MigrationAuditService.runAudit()

        expect(audit.totalUsers).toBe(3)
        expect(audit.googleUsers).toBe(1)
        expect(audit.legacyPinUsers).toBe(1)
        expect(audit.passwordUsers).toBe(1)
        expect(audit.pendingMigrationsCount).toBe(1)
        expect(audit.productionProCount).toBe(1)

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
