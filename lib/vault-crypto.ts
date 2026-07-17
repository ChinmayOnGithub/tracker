import crypto from 'crypto'
import { env } from '@/lib/env'

const ALGORITHM = 'aes-256-gcm'
const VAULT_SALT = 'tracker-vault-encryption-salt-2026'
const IV_LENGTH = 12 // 96-bit IV for GCM
const TAG_LENGTH = 16 // 128-bit auth tag

let cachedKey: Buffer | null = null

/**
 * Derives a 256-bit encryption key from the environment secret using PBKDF2.
 * Uses a vault-specific salt to isolate from OAuth token encryption.
 */
function getVaultKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = env.GOOGLE_OAUTH_ENCRYPTION_KEY
  cachedKey = crypto.pbkdf2Sync(secret, VAULT_SALT, 100000, 32, 'sha256')
  return cachedKey
}

// ─── Text Encryption (filenames, MIME types) ──────────────────────────────────

export interface EncryptedText {
  encrypted: string // hex-encoded ciphertext
  iv: string        // hex-encoded IV
  tag: string       // hex-encoded auth tag
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 */
export function encryptText(plainText: string): EncryptedText {
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getVaultKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  }
}

/**
 * Decrypts an AES-256-GCM encrypted text string.
 */
export function decryptText(encrypted: string, ivHex: string, tagHex: string): string {
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const key = getVaultKey()

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

// ─── Buffer Encryption (file contents) ────────────────────────────────────────

export interface EncryptedBuffer {
  encryptedBuffer: Buffer
  iv: string  // hex-encoded
  tag: string // hex-encoded
}

/**
 * Encrypts a file buffer using AES-256-GCM.
 * Returns the encrypted buffer along with the IV and auth tag needed for decryption.
 */
export function encryptBuffer(buffer: Buffer): EncryptedBuffer {
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getVaultKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encryptedBuffer = Buffer.concat([
    cipher.update(buffer),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return {
    encryptedBuffer,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  }
}

/**
 * Decrypts an AES-256-GCM encrypted file buffer.
 * Requires the original IV and auth tag used during encryption.
 */
export function decryptBuffer(encryptedBuffer: Buffer, ivHex: string, tagHex: string): Buffer {
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const key = getVaultKey()

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ])
}

// ─── Title-only encryption (compact format for folder/file names) ─────────────

/**
 * Encrypts a title and returns a single colon-separated string: "iv:encrypted:tag"
 * Used for the encryptedTitle field in the database.
 */
export function encryptTitle(title: string): string {
  const { encrypted, iv, tag } = encryptText(title)
  return `${iv}:${encrypted}:${tag}`
}

/**
 * Decrypts a colon-separated encrypted title string.
 */
export function decryptTitle(encryptedTitle: string): string {
  const parts = encryptedTitle.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted title format. Expected iv:data:tag')
  }
  const [iv, encrypted, tag] = parts
  return decryptText(encrypted, iv, tag)
}

// ─── MIME type encryption (same compact format) ───────────────────────────────

/**
 * Encrypts a MIME type string into colon-separated format.
 */
export function encryptMimeType(mimeType: string): string {
  return encryptTitle(mimeType) // Same format
}

/**
 * Decrypts a MIME type from colon-separated format.
 */
export function decryptMimeType(encrypted: string): string {
  return decryptTitle(encrypted) // Same format
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const VAULT_MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
export { IV_LENGTH, TAG_LENGTH }
