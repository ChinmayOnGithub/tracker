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
}
export default JournalRepository;
