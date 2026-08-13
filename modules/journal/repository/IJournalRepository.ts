import { IRepository } from '@/lib/database/repository/IRepository';
import { JournalEntry } from '@/lib/store/store';

export interface IJournalRepository extends IRepository<JournalEntry> {
  getJournalByDate(userId: string, dateStr: string): Promise<JournalEntry | null>;
  getJournalRange(userId: string, startDateStr: string, endDateStr: string): Promise<JournalEntry[]>;
  searchJournal(userId: string, query: string): Promise<JournalEntry[]>;
}
export default IJournalRepository;
