import crypto from 'crypto'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { GOOGLE_OAUTH } from '@/lib/constants'

const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const KEY_SALT = 'tracker-google-oauth-encryption-salt-2026'

// Derive a static 256-bit key from the environment variable
function getEncryptionKey(): Buffer {
  const secret = env.GOOGLE_OAUTH_ENCRYPTION_KEY
  return crypto.pbkdf2Sync(secret, KEY_SALT, 100000, 32, 'sha256')
}

export class GoogleCredentialService {
  /**
   * Encrypts a plain text string using AES-256-GCM.
   * Returns a colon-separated string: "iv:encryptedData:tag"
   */
  static encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12)
    const key = getEncryptionKey()
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv)
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const tag = cipher.getAuthTag().toString('hex')
    
    logger.debug('GoogleCredentialService', 'Encrypted value', {
      ivLength: iv.length,
      encryptedLength: encrypted.length
    })
    
    return `${iv.toString('hex')}:${encrypted}:${tag}`
  }

  /**
   * Decrypts an encrypted token string using AES-256-GCM.
   */
  static decrypt(encryptedValue: string): string {
    const parts = encryptedValue.split(':')
    if (parts.length !== 3) {
      logger.error('GoogleCredentialService', 'Invalid encrypted value format', {
        partsCount: parts.length
      })
      throw new Error('Invalid encrypted value format. Expected iv:data:tag')
    }
    
    const [ivHex, encryptedHex, tagHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const key = getEncryptionKey()
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    logger.debug('GoogleCredentialService', 'Decryption successful', {
      decryptedLength: decrypted.length
    })
    
    return decrypted
  }

  /**
   * Securely saves or updates the Google refresh token for a user.
   * The expiryDate field tracks when the credential was last refreshed.
   */
  static async saveCredentials(userId: string, refreshToken: string) {
    const encryptedRefreshToken = this.encrypt(refreshToken)
    
    logger.info('GoogleCredentialService', 'Saving Google credentials', {
      userId,
      encryptedTokenLength: encryptedRefreshToken.length
    })
    
    return await db.googleCredential.upsert({
      where: { userId },
      create: {
        userId,
        refreshToken: encryptedRefreshToken,
        expiryDate: new Date() // Track when credential was stored
      },
      update: {
        refreshToken: encryptedRefreshToken,
        expiryDate: new Date() // Track when credential was updated
      }
    })
  }

  /**
   * Retrieves and decrypts the plain text refresh token for a user.
   */
  static async getRefreshToken(userId: string): Promise<string | null> {
    logger.debug('GoogleCredentialService', 'Retrieving refresh token', { userId })

    const credential = await db.googleCredential.findUnique({
      where: { userId }
    })
    
    if (!credential) {
      logger.debug('GoogleCredentialService', 'No credential found for user', { userId })
      return null
    }
    
    try {
      const decryptedToken = this.decrypt(credential.refreshToken)
      logger.debug('GoogleCredentialService', 'Refresh token decrypted successfully', {
        userId,
        tokenLength: decryptedToken.length
      })
      return decryptedToken
    } catch (err) {
      logger.error('GoogleCredentialService', 'Failed to decrypt refresh token — credential may be corrupted', {
        userId,
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  }

  /**
   * Disconnects a user's Google integration.
   * First revokes the token at Google, then deletes the credential row.
   */
  static async disconnect(userId: string): Promise<boolean> {
    logger.info('GoogleCredentialService', 'Disconnecting Google account', { userId })

    try {
      // Try to revoke the token at Google before deleting locally
      const refreshToken = await this.getRefreshToken(userId)
      if (refreshToken) {
        try {
          const revokeResponse = await fetch(GOOGLE_OAUTH.REVOKE_URI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshToken })
          })
          
          if (revokeResponse.ok) {
            logger.info('GoogleCredentialService', 'Token revoked at Google successfully', { userId })
          } else {
            logger.warn('GoogleCredentialService', 'Token revocation at Google returned non-OK status', {
              userId,
              status: revokeResponse.status
            })
          }
        } catch (revokeErr) {
          // Log but don't fail — still delete the local credential
          logger.warn('GoogleCredentialService', 'Failed to revoke token at Google (network error)', {
            userId,
            error: revokeErr instanceof Error ? revokeErr.message : String(revokeErr)
          })
        }
      }

      await db.googleCredential.delete({
        where: { userId }
      })
      
      logger.info('GoogleCredentialService', 'Google credential deleted from database', { userId })
      return true
    } catch {
      logger.warn('GoogleCredentialService', 'Disconnect failed — credential may not exist', { userId })
      return false
    }
  }

  /**
   * Checks if a user has a connected Google account.
   */
  static async isConnected(userId: string): Promise<boolean> {
    const count = await db.googleCredential.count({
      where: { userId }
    })
    logger.debug('GoogleCredentialService', 'Connection check', { userId, connected: count > 0 })
    return count > 0
  }
}
