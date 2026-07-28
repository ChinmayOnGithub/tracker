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
}
