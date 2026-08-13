import { BaseRepository } from '@/lib/database/repository/BaseRepository';
import { JournalEntry } from '@/lib/store/store';
import { IJournalRepository } from './IJournalRepository';
import { LocalJournalRepository } from './LocalJournalRepository';

export class JournalRepository 
  extends BaseRepository<JournalEntry> 
  implements IJournalRepository 
{
  constructor() {
    super(new LocalJournalRepository(), 'journal_entries');
  }

  public async getJournalByDate(userId: string, dateStr: string): Promise<JournalEntry | null> {
    return (this.local as LocalJournalRepository).getJournalByDate(userId, dateStr);
  }

  public async getJournalRange(userId: string, startDateStr: string, endDateStr: string): Promise<JournalEntry[]> {
    return (this.local as LocalJournalRepository).getJournalRange(userId, startDateStr, endDateStr);
  }

  public async searchJournal(userId: string, query: string): Promise<JournalEntry[]> {
    return (this.local as LocalJournalRepository).searchJournal(userId, query);
  }
}
export default JournalRepository;
