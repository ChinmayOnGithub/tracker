import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { logger } from '@/lib/logger'

export class StorageService {
  private static getVaultDir(userId: string): string {
    return path.join(process.cwd(), 'uploads', 'vault', userId)
  }

  private static getJournalDir(userId: string): string {
    return path.join(process.cwd(), 'uploads', 'journal', userId)
  }

  /**
   * Check if Supabase storage is configured via environment.
   */
  private static getSupabaseConfig(): { url: string; key: string } | null {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY
    if (url && key) {
      return { url, key }
    }
    return null
  }

  /**
   * Persists an encrypted vault file into storage.
   */
  public static async saveVaultFile(userId: string, storageKey: string, encryptedBuffer: Buffer): Promise<void> {
    const supabase = this.getSupabaseConfig()
    const objectPath = `${userId}/${storageKey}.enc`

    if (supabase) {
      try {
        const uploadUrl = `${supabase.url}/storage/v1/object/vault/${objectPath}`
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabase.key}`,
            'Content-Type': 'application/octet-stream',
            'x-upsert': 'true'
          },
          body: new Uint8Array(encryptedBuffer)
        })
        if (res.ok) {
          logger.info('StorageService', `Persisted vault file to object storage: ${objectPath}`)
          return
        }
        logger.warn('StorageService', `Object storage upload failed with ${res.status}. Falling back to filesystem storage.`)
      } catch (err) {
        logger.warn('StorageService', 'Object storage unreachable. Falling back to filesystem storage.', { error: String(err) })
      }
    }

    // Filesystem fallback
    const vaultDir = this.getVaultDir(userId)
    await fs.mkdir(vaultDir, { recursive: true })
    const filePath = path.join(vaultDir, `${storageKey}.enc`)
    await fs.writeFile(filePath, encryptedBuffer)
  }

  /**
   * Reads an encrypted vault file from storage.
   */
  public static async readVaultFile(userId: string, storageKey: string): Promise<Buffer> {
    const supabase = this.getSupabaseConfig()
    const objectPath = `${userId}/${storageKey}.enc`

    if (supabase) {
      try {
        const downloadUrl = `${supabase.url}/storage/v1/object/vault/${objectPath}`
        const res = await fetch(downloadUrl, {
          headers: {
            'Authorization': `Bearer ${supabase.key}`
          }
        })
        if (res.ok) {
          const ab = await res.arrayBuffer()
          return Buffer.from(ab)
        }
      } catch (err) {
        logger.warn('StorageService', 'Failed reading from object storage. Checking filesystem.', { error: String(err) })
      }
    }

    // Filesystem fallback
    const vaultDir = this.getVaultDir(userId)
    const filePath = path.join(vaultDir, `${storageKey}.enc`)
    return await fs.readFile(filePath)
  }

  /**
   * Deletes an encrypted vault file from storage.
   */
  public static async deleteVaultFile(userId: string, storageKey: string): Promise<void> {
    const supabase = this.getSupabaseConfig()
    const objectPath = `${userId}/${storageKey}.enc`

    if (supabase) {
      try {
        const deleteUrl = `${supabase.url}/storage/v1/object/vault/${objectPath}`
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabase.key}`
          }
        })
      } catch (err) {
        logger.warn('StorageService', 'Failed deleting from object storage.', { error: String(err) })
      }
    }

    const vaultDir = this.getVaultDir(userId)
    const filePath = path.join(vaultDir, `${storageKey}.enc`)
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath)
      }
    } catch {
      // Ignore if already deleted
    }
  }

  /**
   * Persists a journal image into storage.
   */
  public static async saveJournalImage(userId: string, fileId: string, buffer: Buffer, mimeType: string): Promise<void> {
    const supabase = this.getSupabaseConfig()
    const objectPath = `${userId}/${fileId}`

    if (supabase) {
      try {
        const uploadUrl = `${supabase.url}/storage/v1/object/journal/${objectPath}`
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabase.key}`,
            'Content-Type': mimeType,
            'x-upsert': 'true'
          },
          body: new Uint8Array(buffer)
        })
        if (res.ok) {
          logger.info('StorageService', `Persisted journal image to object storage: ${objectPath}`)
          return
        }
        logger.warn('StorageService', `Object storage upload failed with ${res.status}. Falling back to filesystem storage.`)
      } catch (err) {
        logger.warn('StorageService', 'Object storage unreachable. Falling back to filesystem storage.', { error: String(err) })
      }
    }

    // Filesystem fallback
    const journalDir = this.getJournalDir(userId)
    await fs.mkdir(journalDir, { recursive: true })
    const filePath = path.join(journalDir, fileId)
    await fs.writeFile(filePath, buffer)
  }

  /**
   * Reads a journal image from storage.
   */
  public static async readJournalImage(userId: string, fileId: string): Promise<Buffer> {
    const supabase = this.getSupabaseConfig()
    const objectPath = `${userId}/${fileId}`

    if (supabase) {
      try {
        const downloadUrl = `${supabase.url}/storage/v1/object/journal/${objectPath}`
        const res = await fetch(downloadUrl, {
          headers: {
            'Authorization': `Bearer ${supabase.key}`
          }
        })
        if (res.ok) {
          const ab = await res.arrayBuffer()
          return Buffer.from(ab)
        }
      } catch (err) {
        logger.warn('StorageService', 'Failed reading journal image from object storage. Checking filesystem.', { error: String(err) })
      }
    }

    const journalDir = this.getJournalDir(userId)
    const filePath = path.join(journalDir, fileId)
    return await fs.readFile(filePath)
  }

  /**
   * Deletes a journal image from storage.
   */
  public static async deleteJournalImage(userId: string, fileId: string): Promise<void> {
    const supabase = this.getSupabaseConfig()
    const objectPath = `${userId}/${fileId}`

    if (supabase) {
      try {
        const deleteUrl = `${supabase.url}/storage/v1/object/journal/${objectPath}`
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabase.key}`
          }
        })
      } catch (err) {
        logger.warn('StorageService', 'Failed deleting journal image from object storage.', { error: String(err) })
      }
    }

    const journalDir = this.getJournalDir(userId)
    const filePath = path.join(journalDir, fileId)
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath)
      }
    } catch {
      // Ignore if already deleted
    }
  }
}
