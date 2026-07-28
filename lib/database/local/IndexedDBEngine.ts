import { DB_NAME } from './schema';
import { DB_VERSION, runMigrations } from './migrations';

export class IndexedDBEngine {
  private static instance: IndexedDBEngine | null = null;
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {}

  public static getInstance(): IndexedDBEngine {
    if (!IndexedDBEngine.instance) {
      IndexedDBEngine.instance = new IndexedDBEngine();
    }
    return IndexedDBEngine.instance;
  }

  /**
   * Helper to verify if running in a client-side environment.
   */
  private isClient(): boolean {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  /**
   * Opens the IndexedDB connection and runs schema migrations if needed.
   */
  public async getDb(): Promise<IDBDatabase> {
    if (!this.isClient()) {
      throw new Error('IndexedDB is only accessible in the browser client environment.');
    }

    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        // Clear promise so the next call can retry instead of permanently failing
        this.dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB database.'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        // Clear promise — this.db fast-path will be used from now on
        this.dbPromise = null;

        // Handle unexpected connection loss (e.g. browser deletes DB externally)
        this.db.onclose = () => {
          this.db = null;
          this.dbPromise = null;
          console.warn('[IndexedDBEngine] Database connection closed unexpectedly. Will reopen on next access.');
        };

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction!;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion || DB_VERSION;
        runMigrations(db, transaction, oldVersion, newVersion);
      };
    });

    return this.dbPromise;
  }

  /**
   * Performs an operation within a database transaction.
   */
  private async runTransaction<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    callback: (tx: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const db = await this.getDb();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      
      let result: T;

      transaction.oncomplete = () => {
        resolve(result);
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error('Transaction execution aborted due to error.'));
      };

      transaction.onabort = () => {
        reject(transaction.error || new Error('Transaction was aborted.'));
      };

      // Execute callback asynchronously
      callback(transaction)
        .then((res) => {
          result = res;
          return res;
        })
        .catch((err) => {
          transaction.abort();
          reject(err);
          return null as unknown as T;
        });
    });
  }

  /**
   * Puts an item in a store.
   */
  public async put<T>(storeName: string, item: T): Promise<void> {
    return this.runTransaction([storeName], 'readwrite', async (tx) => {
      const store = tx.objectStore(storeName);
      return new Promise<void>((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Transactionally puts a record and enqueues a sync item.
   */
  public async putAtomic(storeName: string, item: unknown, queueItem: unknown): Promise<void> {
    return this.runTransaction([storeName, 'sync_queue'], 'readwrite', async (tx) => {
      const store = tx.objectStore(storeName);
      const queue = tx.objectStore('sync_queue');
      return new Promise<void>((resolve, reject) => {
        const req1 = store.put(item);
        req1.onsuccess = () => {
          const req2 = queue.put(queueItem);
          req2.onsuccess = () => resolve();
          req2.onerror = () => reject(req2.error);
        };
        req1.onerror = () => reject(req1.error);
      });
    });
  }

  /**
   * Transactionally deletes a record and enqueues a sync item.
   */
  public async deleteAtomic(storeName: string, key: IDBValidKey, queueItem: unknown): Promise<void> {
    return this.runTransaction([storeName, 'sync_queue'], 'readwrite', async (tx) => {
      const store = tx.objectStore(storeName);
      const queue = tx.objectStore('sync_queue');
      return new Promise<void>((resolve, reject) => {
        const req1 = store.delete(key);
        req1.onsuccess = () => {
          const req2 = queue.put(queueItem);
          req2.onsuccess = () => resolve();
          req2.onerror = () => reject(req2.error);
        };
        req1.onerror = () => reject(req1.error);
      });
    });
  }

  /**
   * Gets an item from a store by key.
   */
  public async get<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    return this.runTransaction([storeName], 'readonly', async (tx) => {
      const store = tx.objectStore(storeName);
      return new Promise<T | null>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Deletes an item from a store by key.
   */
  public async delete(storeName: string, key: IDBValidKey): Promise<void> {
    return this.runTransaction([storeName], 'readwrite', async (tx) => {
      const store = tx.objectStore(storeName);
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Gets all items from a store.
   */
  public async getAll<T>(storeName: string): Promise<T[]> {
    return this.runTransaction([storeName], 'readonly', async (tx) => {
      const store = tx.objectStore(storeName);
      return new Promise<T[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Queries a store using an index.
   */
  public async queryIndex<T>(
    storeName: string,
    indexName: string,
    queryValue: IDBValidKey | IDBKeyRange
  ): Promise<T[]> {
    return this.runTransaction([storeName], 'readonly', async (tx) => {
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      return new Promise<T[]>((resolve, reject) => {
        const request = index.getAll(queryValue);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    });
  }
}
