import { IRepository } from '@/lib/database/repository/IRepository';
import { JournalEntry } from '@/lib/store/store';

export type IJournalRepository = IRepository<JournalEntry>;
