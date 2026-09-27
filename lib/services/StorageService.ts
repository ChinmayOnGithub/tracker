import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { logger } from '@/lib/logger'

export interface StorageInput {
  key: string
  body: Buffer | Uint8Array
  contentType: string
}

export interface IStorageService {
  put(input: StorageInput): Promise<void>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

/**
 * Returns whether durable cloud object storage is configured in the environment.
 */
export function isProductionStorageConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY
  return Boolean(url && key)
}

export class StorageService implements IStorageService {
  private static instance: StorageService

  public static getInstance(): StorageService {
    if (!this.instance) {
      this.instance = new StorageService()
    }
    return this.instance
  }

  private getSupabaseConfig(): { url: string; key: string } | null {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_ANON_KEY
    if (url && key) {
      return { url, key }
    }
    return null
  }

  private parseBucketAndObject(key: string): { bucket: string; objectPath: string } {
    const cleanKey = key.replace(/^\/+/, '')
    const parts = cleanKey.split('/')
    if (parts.length < 2) {
      return { bucket: 'vault', objectPath: cleanKey }
    }
    const bucket = parts[0]
    const objectPath = parts.slice(1).join('/')
    return { bucket, objectPath }
  }

  private getLocalFilePath(key: string): string {
    const cleanKey = key.replace(/^\/+/, '')
    return path.join(process.cwd(), 'uploads', cleanKey)
  }

  /**
   * Puts an object into durable storage.
   */
  async put(input: StorageInput): Promise<void> {
    const { bucket, objectPath } = this.parseBucketAndObject(input.key)
    const supabase = this.getSupabaseConfig()

    if (supabase) {
      try {
        const uploadUrl = `${supabase.url}/storage/v1/object/${bucket}/${objectPath}`
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabase.key}`,
            'Content-Type': input.contentType,
            'x-upsert': 'true'
          },
          body: new Uint8Array(input.body)
        })
        if (res.ok) {
          logger.info('StorageService', `Persisted object to cloud: ${input.key}`)
          return
        }
        logger.warn('StorageService', `Cloud storage put returned ${res.status} for ${input.key}`)
      } catch (err) {
        logger.warn('StorageService', `Cloud storage unreachable during put: ${input.key}`, { error: String(err) })
      }
    }

    if (process.env.NODE_ENV === 'production' && !isProductionStorageConfigured()) {
      throw new Error('Durable storage is required in production.')
    }

    // Local filesystem storage for development and test environments
    const filePath = this.getLocalFilePath(input.key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from(input.body))
  }

  /**
   * Retrieves an object from durable storage.
   */
  async get(key: string): Promise<Buffer> {
    const { bucket, objectPath } = this.parseBucketAndObject(key)
    const supabase = this.getSupabaseConfig()

    if (supabase) {
      try {
        const downloadUrl = `${supabase.url}/storage/v1/object/${bucket}/${objectPath}`
        const res = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${supabase.key}`
          }
        })
        if (res.ok) {
          const ab = await res.arrayBuffer()
          return Buffer.from(ab)
        }
      } catch (err) {
        logger.warn('StorageService', `Cloud storage read failed for ${key}`, { error: String(err) })
      }
    }

    if (process.env.NODE_ENV === 'production' && !isProductionStorageConfigured()) {
      throw new Error('Durable storage is required in production.')
    }

    const filePath = this.getLocalFilePath(key)
    return await fs.readFile(filePath)
  }

  /**
   * Deletes an object from durable storage.
   */
  async delete(key: string): Promise<void> {
    const { bucket, objectPath } = this.parseBucketAndObject(key)
    const supabase = this.getSupabaseConfig()

    if (supabase) {
      try {
        const deleteUrl = `${supabase.url}/storage/v1/object/${bucket}/${objectPath}`
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${supabase.key}`
          }
        })
      } catch (err) {
        logger.warn('StorageService', `Cloud storage delete failed for ${key}`, { error: String(err) })
      }
    }

    const filePath = this.getLocalFilePath(key)
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath)
      }
    } catch {
      // Ignore if not present
    }
  }

  /**
   * Checks whether an object exists in durable storage.
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.get(key)
      return true
    } catch {
      return false
    }
  }

  // ─── Static Facade & Helpers ───────────────────────────────────────────────

  public static async put(input: StorageInput): Promise<void> {
    return this.getInstance().put(input)
  }

  public static async get(key: string): Promise<Buffer> {
    return this.getInstance().get(key)
  }

  public static async delete(key: string): Promise<void> {
    return this.getInstance().delete(key)
  }

  public static async exists(key: string): Promise<boolean> {
    return this.getInstance().exists(key)
  }

  public static async saveVaultFile(userId: string, storageKey: string, encryptedBuffer: Buffer): Promise<void> {
    await this.put({
      key: `vault/${userId}/${storageKey}.enc`,
      body: encryptedBuffer,
      contentType: 'application/octet-stream'
    })
  }

  public static async readVaultFile(userId: string, storageKey: string): Promise<Buffer> {
    return this.get(`vault/${userId}/${storageKey}.enc`)
  }

  public static async deleteVaultFile(userId: string, storageKey: string): Promise<void> {
    await this.delete(`vault/${userId}/${storageKey}.enc`)
  }

  public static async saveJournalImage(userId: string, fileId: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.put({
      key: `journal/${userId}/${fileId}`,
      body: buffer,
      contentType: mimeType
    })
  }

  public static async readJournalImage(userId: string, fileId: string): Promise<Buffer> {
    return this.get(`journal/${userId}/${fileId}`)
  }

  public static async deleteJournalImage(userId: string, fileId: string): Promise<void> {
    await this.delete(`journal/${userId}/${fileId}`)
  }
}
