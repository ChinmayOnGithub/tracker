import { STORES } from './schema';

export interface MigrationCallback {
  (db: IDBDatabase, transaction: IDBTransaction): void;
}

export const DB_VERSION = 1;

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
