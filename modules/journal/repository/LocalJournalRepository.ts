import { BaseLocalRepository } from '@/lib/database/repository/BaseRepository';
import { JournalEntry } from '@/lib/store/store';
import { IJournalRepository } from './IJournalRepository';

export class LocalJournalRepository 
  extends BaseLocalRepository<JournalEntry> 
  implements IJournalRepository 
{
  constructor() {
    super('journal_entries');
  }

  public async getJournalByDate(userId: string, dateStr: string): Promise<JournalEntry | null> {
    const range = typeof IDBKeyRange !== 'undefined' 
      ? IDBKeyRange.bound(dateStr, dateStr + '\uffff')
      : (dateStr as unknown as IDBKeyRange);
    const results = await this.engine.queryIndex<JournalEntry>(this.storeName, 'journalDate', range);
    const matched = results.filter(e => e.userId === userId && !e.deletedAt);
    return matched[0] || null;
  }

  public async getJournalRange(userId: string, startDateStr: string, endDateStr: string): Promise<JournalEntry[]> {
    const range = typeof IDBKeyRange !== 'undefined' 
      ? IDBKeyRange.bound(startDateStr, endDateStr + '\uffff')
      : (startDateStr as unknown as IDBKeyRange);
    const results = await this.engine.queryIndex<JournalEntry>(this.storeName, 'journalDate', range);
    return results.filter(e => e.userId === userId && !e.deletedAt);
  }

  public async searchJournal(userId: string, query: string): Promise<JournalEntry[]> {
    const results = await this.getAll();
    const q = query.toLowerCase();
    return results.filter(e => 
      e.userId === userId && 
      !e.deletedAt &&
      ((e.content || '').toLowerCase().includes(q) ||
       (e.gratitude || '').toLowerCase().includes(q) ||
       (e.lessonsLearned || '').toLowerCase().includes(q))
    );
  }
}
export default LocalJournalRepository;
