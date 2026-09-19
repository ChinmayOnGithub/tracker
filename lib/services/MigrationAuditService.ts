import { db } from '@/lib/db'
import { AuthorizationService } from './AuthorizationService'
import { CredentialService } from './CredentialService'
import { AuditService } from './AuditService'

export type CredentialType = 'GOOGLE_OAUTH' | 'LEGACY_PIN' | 'SCRYPT_PASSWORD' | 'UNCONFIGURED'

export type BillingClassification =
  | 'GOOGLE_ONLY'
  | 'PASSWORD_USER'
  | 'LEGACY_PIN_USER'
  | 'FREE_USER'
  | 'TEST_MODE_PRO'
  | 'PRODUCTION_PRO'
  | 'HISTORICAL_CANCELLED'
  | 'MANUAL_LEGACY_PREMIUM'

export interface UserMigrationAuditRecord {
  userId: string
  username: string
  maskedEmail: string | null
  isOwner: boolean
  credentialType: CredentialType
  billingClassification: BillingClassification
  requiresMigration: boolean
  createdAt: string
}

export interface MigrationAuditSummary {
  totalUsers: number
  googleUsers: number
  legacyPinUsers: number
  passwordUsers: number
  unconfiguredUsers: number
  pendingMigrationsCount: number
  freeUsersCount: number
  testModeProCount: number
  productionProCount: number
  historicalCancelledCount: number
  manualLegacyPremiumCount: number
  users: UserMigrationAuditRecord[]
}

export class MigrationAuditService {
  /**
   * Safe email masking helper: e.g. "chinmaydpatil09@gmail.com" -> "ch***09@gmail.com"
   */
  public static maskEmail(email: string | null): string | null {
    if (!email) return null
    const parts = email.split('@')
    if (parts.length !== 2) return '***@***'
    const name = parts[0]
    const domain = parts[1]
    if (name.length <= 2) {
      return `${name.charAt(0)}***@${domain}`
    }
    const visiblePrefix = name.slice(0, 2)
    const visibleSuffix = name.slice(-2)
    return `${visiblePrefix}***${visibleSuffix}@${domain}`
  }

  /**
   * Inspects credentials type safely without returning raw hashes or plaintexts.
   */
  public static categorizeCredential(googleId: string | null, passwordHash: string | null): {
    credentialType: CredentialType
    requiresMigration: boolean
  } {
    if (googleId) {
      return { credentialType: 'GOOGLE_OAUTH', requiresMigration: false }
    }
    if (!passwordHash) {
      return { credentialType: 'UNCONFIGURED', requiresMigration: false }
    }
    if (passwordHash.startsWith('scrypt:')) {
      return { credentialType: 'SCRYPT_PASSWORD', requiresMigration: false }
    }
    // Any other hash is legacy PBKDF2 PIN
    return { credentialType: 'LEGACY_PIN', requiresMigration: true }
  }

  /**
   * Classifies user billing state deterministically without guessing.
   */
  public static classifyBilling(
    isOwner: boolean,
    subscriptions: Array<{
      status: string
      provider: string
      providerSubscriptionId: string
      plan: string
      currentPeriodEnd: Date | null
      deletedAt: Date | null
    }>
  ): BillingClassification {
    if (isOwner) {
      return 'MANUAL_LEGACY_PREMIUM'
    }

    const activeSub = subscriptions.find(
      s => !s.deletedAt && (s.status === 'ACTIVE' || s.status === 'AUTHENTICATED') &&
           (!s.currentPeriodEnd || s.currentPeriodEnd.getTime() > Date.now())
    )

    if (activeSub) {
      const isTestProvider = activeSub.provider === 'MOCK' ||
        activeSub.providerSubscriptionId.startsWith('sub_test_') ||
        activeSub.providerSubscriptionId.includes('mock') ||
        activeSub.plan.includes('TEST')

      return isTestProvider ? 'TEST_MODE_PRO' : 'PRODUCTION_PRO'
    }

    const hasHistoricalSub = subscriptions.some(
      s => s.status === 'CANCELLED' || s.status === 'EXPIRED' ||
           (s.currentPeriodEnd && s.currentPeriodEnd.getTime() <= Date.now())
    )

    if (hasHistoricalSub) {
      return 'HISTORICAL_CANCELLED'
    }

    return 'FREE_USER'
  }

  /**
   * Scans all users in the system and produces an audit report across all required categories.
   * Never leaks password hashes or payment secrets.
   */
  public static async runAudit(): Promise<MigrationAuditSummary> {
    const allUsers = await db.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        googleId: true,
        passwordHash: true,
        createdAt: true,
        subscriptions: {
          select: {
            status: true,
            provider: true,
            providerSubscriptionId: true,
            plan: true,
            currentPeriodEnd: true,
            deletedAt: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' },
    })

    let googleUsers = 0
    let legacyPinUsers = 0
    let passwordUsers = 0
    let unconfiguredUsers = 0
    let pendingMigrationsCount = 0

    let freeUsersCount = 0
    let testModeProCount = 0
    let productionProCount = 0
    let historicalCancelledCount = 0
    let manualLegacyPremiumCount = 0

    const userRecords: UserMigrationAuditRecord[] = allUsers.map(user => {
      const isOwner = AuthorizationService.isOwner(user)
      const { credentialType, requiresMigration } = this.categorizeCredential(user.googleId, user.passwordHash)

      if (credentialType === 'GOOGLE_OAUTH') googleUsers++
      else if (credentialType === 'LEGACY_PIN') {
        legacyPinUsers++
        pendingMigrationsCount++
      } else if (credentialType === 'SCRYPT_PASSWORD') passwordUsers++
      else unconfiguredUsers++

      const billingClassification = this.classifyBilling(isOwner, user.subscriptions || [])

      if (billingClassification === 'FREE_USER') freeUsersCount++
      else if (billingClassification === 'TEST_MODE_PRO') testModeProCount++
      else if (billingClassification === 'PRODUCTION_PRO') productionProCount++
      else if (billingClassification === 'HISTORICAL_CANCELLED') historicalCancelledCount++
      else if (billingClassification === 'MANUAL_LEGACY_PREMIUM') manualLegacyPremiumCount++

      return {
        userId: user.id,
        username: user.username,
        maskedEmail: this.maskEmail(user.email),
        isOwner,
        credentialType,
        billingClassification,
        requiresMigration,
        createdAt: user.createdAt.toISOString(),
      }
    })

    return {
      totalUsers: allUsers.length,
      googleUsers,
      legacyPinUsers,
      passwordUsers,
      unconfiguredUsers,
      pendingMigrationsCount,
      freeUsersCount,
      testModeProCount,
      productionProCount,
      historicalCancelledCount,
      manualLegacyPremiumCount,
      users: userRecords,
    }
  }

  /**
   * Safely migrates a legacy PIN user to a modern scrypt password.
   * Invariant: Requires user authentication with current PIN before establishing password.
   * Never automatically resets password or opens an account takeover path.
   */
  public static async upgradeLegacyPinToPassword(
    userId: string,
    currentPin: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new Error('User not found')
    }

    if (!user.passwordHash) {
      throw new Error('User has no existing credential to migrate')
    }

    const { credentialType } = this.categorizeCredential(user.googleId, user.passwordHash)
    if (credentialType !== 'LEGACY_PIN') {
      throw new Error('Account does not use a legacy PIN')
    }

    // Authenticate current PIN
    const perUserHash = CredentialService.hashLegacyPin(currentPin, user.username)
    const globalHash = CredentialService.legacyHashPin(currentPin)
    const pinMatches = user.passwordHash === perUserHash || user.passwordHash === globalHash

    if (!pinMatches) {
      throw new Error('Invalid current PIN')
    }

    const validation = CredentialService.validatePassword(newPassword)
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid new password')
    }

    // Securely hash with scrypt
    const newScryptHash = await CredentialService.hashPassword(newPassword, user.username)

    // Update user credential atomically and invalidate legacy PIN
    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash: newScryptHash,
        updatedAt: new Date()
      }
    })

    // Log security audit event
    await AuditService.log({
      userId,
      entityType: 'User',
      entityId: userId,
      action: 'LEGACY_PIN_MIGRATED_TO_PASSWORD',
      performedBy: userId
    }).catch(() => {})

    return {
      success: true,
      message: 'Password established successfully. Legacy PIN invalidated.'
    }
  }
}
