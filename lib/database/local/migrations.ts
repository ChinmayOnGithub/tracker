import { STORES } from './schema';

export interface MigrationCallback {
  (db: IDBDatabase, transaction: IDBTransaction): void;
}

export const DB_VERSION = 5;

export const MIGRATIONS: Record<number, MigrationCallback> = {
  1: (db) => {
    // Version 1 initializes all configured stores
    for (const storeConfig of STORES) {
      if (!db.objectStoreNames.contains(storeConfig.name)) {
        const store = db.createObjectStore(storeConfig.name, {
          keyPath: storeConfig.keyPath,
          autoIncrement: storeConfig.autoIncrement || false,
        });
        for (const idx of storeConfig.indexes) {
          store.createIndex(idx.name, idx.keyPath, {
            unique: idx.unique || false,
            multiEntry: idx.multiEntry || false,
          });
        }
      }
    }
  },
  2: (db, transaction) => {
    // Version 2 adds indexes to activity_logs, secure_vault_metadata, and sync_queue
    if (db.objectStoreNames.contains('activity_logs')) {
      const store = transaction.objectStore('activity_logs');
      if (!store.indexNames.contains('updatedAt')) {
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!store.indexNames.contains('user_logDate')) {
        store.createIndex('user_logDate', ['userId', 'logDate'], { unique: false });
      }
      if (!store.indexNames.contains('logDate_status')) {
        store.createIndex('logDate_status', ['logDate', 'status'], { unique: false });
      }
    }
    if (db.objectStoreNames.contains('secure_vault_metadata')) {
      const store = transaction.objectStore('secure_vault_metadata');
      if (!store.indexNames.contains('parentId')) {
        store.createIndex('parentId', 'parentId', { unique: false });
      }
    }
    if (db.objectStoreNames.contains('sync_queue')) {
      const store = transaction.objectStore('sync_queue');
      if (!store.indexNames.contains('entityId')) {
        store.createIndex('entityId', 'entityId', { unique: false });
      }
      if (!store.indexNames.contains('module_entityId')) {
        store.createIndex('module_entityId', ['module', 'entityId'], { unique: false });
      }
    }
  },
  3: (db) => {
    // Version 3 adds the work_sessions store
    if (!db.objectStoreNames.contains('work_sessions')) {
      const store = db.createObjectStore('work_sessions', {
        keyPath: 'id',
        autoIncrement: false,
      });
      store.createIndex('userId', 'userId', { unique: false });
      store.createIndex('date', 'date', { unique: false });
      store.createIndex('deletedAt', 'deletedAt', { unique: false });
    }
  },
  4: (db, transaction) => {
    // Version 4 adds updatedAt index to journal_entries
    if (db.objectStoreNames.contains('journal_entries')) {
      const store = transaction.objectStore('journal_entries');
      if (!store.indexNames.contains('updatedAt')) {
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    }
  },
  5: (db) => {
    // Version 5 adds the notes store
    if (!db.objectStoreNames.contains('notes')) {
      const store = db.createObjectStore('notes', {
        keyPath: 'id',
        autoIncrement: false,
      });
      store.createIndex('userId', 'userId', { unique: false });
      store.createIndex('updatedAt', 'updatedAt', { unique: false });
      store.createIndex('deletedAt', 'deletedAt', { unique: false });
    }
  }
};

/**
 * Runs sequential migrations from the old version to the new version.
 */
export function runMigrations(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number, newVersion: number) {
  for (let version = oldVersion + 1; version <= newVersion; version++) {
    const migration = MIGRATIONS[version];
    if (migration) {
      console.log(`Running database migration to version ${version}`);
      migration(db, transaction);
    }
  }
}
