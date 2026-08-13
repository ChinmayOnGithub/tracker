import { IndexedDBEngine } from './IndexedDBEngine';

export class SeedService {
  /**
   * Seeds the IndexedDB with a large realistic 3-year dataset.
   */
  public static async seedLargeDataset(onProgress?: (progress: number) => void): Promise<{ durationMs: number; recordsAdded: number }> {
    const start = performance.now();
    const engine = IndexedDBEngine.getInstance();
    const db = await engine.getDb();
    
    // We will generate:
    // - 5 activity templates
    // - ~10,000 activity logs (10/day for 3 years)
    // - ~1,000 journal entries (1 every 1 days for 3 years)
    // - ~300 weight records (1 every 3 days)
    // - ~50 secure vault metadata entries
    
    const userId = 'dev-seeded-user-123';
    const templates = [
      { id: 't-1', userId, name: 'Morning Exercise', category: 'HEALTH', recurrenceType: 'DAILY', targetDate: null, deletedAt: null },
      { id: 't-2', userId, name: 'Check Work Mail', category: 'WORK', recurrenceType: 'DAILY', targetDate: null, deletedAt: null },
      { id: 't-3', userId, name: 'Review Daily Tasks', category: 'WORK', recurrenceType: 'DAILY', targetDate: null, deletedAt: null },
      { id: 't-4', userId, name: 'Read a Book', category: 'PERSONAL', recurrenceType: 'DAILY', targetDate: null, deletedAt: null },
      { id: 't-5', userId, name: 'Log Expense', category: 'FINANCE', recurrenceType: 'DAILY', targetDate: null, deletedAt: null }
    ];

    // Write templates
    const txT = db.transaction(['activity_templates'], 'readwrite');
    const storeT = txT.objectStore('activity_templates');
    templates.forEach(t => storeT.put(t));
    await new Promise<void>((resolve) => { txT.oncomplete = () => resolve(); });

    // Generate dates for the last 3 years (1095 days)
    const dates: string[] = [];
    const today = new Date();
    for (let i = 1095; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    let recordsCount = templates.length;
    const batchSize = 100; // write in batches to avoid locking up IndexedDB tx/UI
    const totalBatches = Math.ceil(dates.length / batchSize);

    for (let b = 0; b < totalBatches; b++) {
      const batchDates = dates.slice(b * batchSize, (b + 1) * batchSize);
      
      // Perform writes inside a single transaction for each batch
      const tx = db.transaction(['activity_logs', 'journal_entries', 'weight_records'], 'readwrite');
      const logStore = tx.objectStore('activity_logs');
      const journalStore = tx.objectStore('journal_entries');
      const weightStore = tx.objectStore('weight_records');

      for (const dateStr of batchDates) {
        // 10 activity logs per day (5 templates + 5 custom logs)
        for (let i = 0; i < 5; i++) {
          const logId = `l-${dateStr}-${i}`;
          logStore.put({
            id: logId,
            userId,
            activityId: `t-${i + 1}`,
            logDate: dateStr,
            status: Math.random() > 0.15 ? 'DONE' : 'SKIPPED',
            notes: `Auto-seeded log for template ${i + 1}`,
            createdAt: new Date(`${dateStr}T08:00:00Z`).toISOString(),
            updatedAt: new Date(`${dateStr}T09:00:00Z`).toISOString(),
            deletedAt: null
          });
          recordsCount++;

          const logId2 = `l-custom-${dateStr}-${i}`;
          logStore.put({
            id: logId2,
            userId,
            activityId: `custom-act-${i}`,
            logDate: dateStr,
            status: 'DONE',
            notes: `Auto-seeded custom activity ${i}`,
            createdAt: new Date(`${dateStr}T10:00:00Z`).toISOString(),
            updatedAt: new Date(`${dateStr}T11:00:00Z`).toISOString(),
            deletedAt: null
          });
          recordsCount++;
        }

        // 1 journal entry every day
        const journalId = `j-${dateStr}`;
        journalStore.put({
          id: journalId,
          userId,
          journalDate: dateStr,
          title: `Journal for ${dateStr}`,
          content: `Today was a productive day. Seeded entries for testing.`,
          createdAt: new Date(`${dateStr}T20:00:00Z`).toISOString(),
          updatedAt: new Date(`${dateStr}T20:05:00Z`).toISOString(),
          deletedAt: null
        });
        recordsCount++;

        // 1 weight record every 3 days
        if (Math.random() > 0.66) {
          const weightId = `w-${dateStr}`;
          weightStore.put({
            id: weightId,
            userId,
            date: dateStr,
            weight: 70 + Math.random() * 5,
            notes: 'Morning weight',
            createdAt: new Date(`${dateStr}T07:00:00Z`).toISOString(),
            updatedAt: new Date(`${dateStr}T07:01:00Z`).toISOString(),
            deletedAt: null
          });
          recordsCount++;
        }
      }

      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
      
      if (onProgress) {
        onProgress(Math.round(((b + 1) / totalBatches) * 100));
      }
    }

    // Seed secure vault metadata (50 records)
    const txV = db.transaction(['secure_vault_metadata'], 'readwrite');
    const vaultStore = txV.objectStore('secure_vault_metadata');
    for (let i = 0; i < 50; i++) {
      const isFolder = i < 10;
      vaultStore.put({
        id: `v-${i}`,
        userId,
        name: isFolder ? `Folder ${i}` : `Document ${i}.txt`,
        isFolder,
        parentId: isFolder ? null : `v-${i % 10}`,
        mimeGroup: isFolder ? 'folder' : 'text',
        size: isFolder ? 0 : 1024 * (i + 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      });
      recordsCount++;
    }
    await new Promise<void>((resolve) => { txV.oncomplete = () => resolve(); });

    const end = performance.now();
    return {
      durationMs: end - start,
      recordsAdded: recordsCount
    };
  }

  /**
   * Clears all seeded/existing records from local IndexedDB.
   */
  public static async clearAllLocalData(): Promise<void> {
    const engine = IndexedDBEngine.getInstance();
    const db = await engine.getDb();
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');
    storeNames.forEach(name => {
      tx.objectStore(name).clear();
    });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  }
}
