import { IndexedDBEngine } from './IndexedDBEngine';
import { STORES } from './schema';
import { DB_VERSION } from './migrations';

export interface BackupPayload {
  appVersion: string;
  formatVersion: number;
  dbVersion: number;
  timestamp: string;
  data: Record<string, unknown[]>;
}

export class BackupService {
  private static APP_VERSION = '1.0.0';
  private static FORMAT_VERSION = 1;

  /**
   * Exports all IndexedDB data into a single JSON string.
   */
  public static async exportBackup(): Promise<string> {
    const engine = IndexedDBEngine.getInstance();
    const data: Record<string, unknown[]> = {};

    for (const store of STORES) {
      // Don't back up temporary caches (if any are designated, though here we back up all configured persistent stores)
      const records = await engine.getAll<unknown>(store.name);
      data[store.name] = records;
    }

    const payload: BackupPayload = {
      appVersion: this.APP_VERSION,
      formatVersion: this.FORMAT_VERSION,
      dbVersion: DB_VERSION,
      timestamp: new Date().toISOString(),
      data,
    };

    return JSON.stringify(payload, null, 2);
  }

  /**
   * Validates the structure and compatibility of a backup payload.
   */
  public static validateBackup(payload: unknown): { success: boolean; error?: string } {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Backup is not a valid JSON object.' };
    }

    const p = payload as Record<string, unknown>;

    if (p.formatVersion === undefined || typeof p.formatVersion !== 'number') {
      return { success: false, error: 'Missing format version metadata.' };
    }

    if ((p.formatVersion as number) > this.FORMAT_VERSION) {
      return { success: false, error: `Incompatible backup format version: ${p.formatVersion}. Expected <= ${this.FORMAT_VERSION}` };
    }

    if (p.dbVersion === undefined || typeof p.dbVersion !== 'number') {
      return { success: false, error: 'Missing database version metadata.' };
    }

    if ((p.dbVersion as number) > DB_VERSION) {
      return { success: false, error: `Database schema version mismatch: backup uses newer version ${p.dbVersion} than current app version ${DB_VERSION}.` };
    }

    if (!p.data || typeof p.data !== 'object') {
      return { success: false, error: 'Backup data payload is empty or invalid.' };
    }

    // Verify all stores in backup data map to our schema stores
    const knownStoreNames = new Set(STORES.map(s => s.name));
    const backupData = p.data as Record<string, unknown[]>;
    for (const storeName of Object.keys(backupData)) {
      if (!knownStoreNames.has(storeName)) {
        return { success: false, error: `Backup contains unknown store name: "${storeName}"` };
      }
      if (!Array.isArray(backupData[storeName])) {
        return { success: false, error: `Store data for "${storeName}" must be an array of records.` };
      }
    }

    return { success: true };
  }

  /**
   * Transactionally restores local database from backup.
   * Either all stores are restored successfully, or database is rolled back to original state.
   */
  public static async restoreBackup(payload: BackupPayload): Promise<void> {
    const validation = this.validateBackup(payload);
    if (!validation.success) {
      throw new Error(validation.error || 'Backup validation failed.');
    }

    const engine = IndexedDBEngine.getInstance();
    const db = await engine.getDb();
    const storeNames = STORES.map(s => s.name);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readwrite');

      tx.oncomplete = () => {
        resolve();
      };

      tx.onerror = () => {
        reject(tx.error || new Error('Restore transaction failed and was rolled back.'));
      };

      tx.onabort = () => {
        reject(new Error('Restore transaction was aborted and successfully rolled back.'));
      };

      try {
        // 1. Clear existing data in all stores
        for (const name of storeNames) {
          const store = tx.objectStore(name);
          store.clear();
        }

        // 2. Put backup records in stores
        for (const [storeName, records] of Object.entries(payload.data)) {
          const store = tx.objectStore(storeName);
          for (const record of records) {
            store.put(record);
          }
        }
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }
}
export default BackupService;
