import { db } from '@/lib/db'
import { AuthorizationService } from './AuthorizationService'

export type CredentialType = 'GOOGLE_OAUTH' | 'LEGACY_PIN' | 'SCRYPT_PASSWORD' | 'UNCONFIGURED'

export interface UserMigrationAuditRecord {
  userId: string
  username: string
  maskedEmail: string | null
  isOwner: boolean
  credentialType: CredentialType
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
   * Scans all users in the system and produces an audit report.
   * Never leaks password hashes or raw secrets.
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
      },
      orderBy: { createdAt: 'asc' },
    })

    let googleUsers = 0
    let legacyPinUsers = 0
    let passwordUsers = 0
    let unconfiguredUsers = 0
    let pendingMigrationsCount = 0

    const userRecords: UserMigrationAuditRecord[] = allUsers.map(user => {
      const isOwner = AuthorizationService.isOwner(user)
      const { credentialType, requiresMigration } = this.categorizeCredential(user.googleId, user.passwordHash)

      if (credentialType === 'GOOGLE_OAUTH') googleUsers++
      else if (credentialType === 'LEGACY_PIN') {
        legacyPinUsers++
        pendingMigrationsCount++
      } else if (credentialType === 'SCRYPT_PASSWORD') passwordUsers++
      else unconfiguredUsers++

      return {
        userId: user.id,
        username: user.username,
        maskedEmail: this.maskEmail(user.email),
        isOwner,
        credentialType,
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
      users: userRecords,
    }
  }
}
