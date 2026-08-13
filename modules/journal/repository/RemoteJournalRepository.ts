import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { JournalEntry } from '@/lib/store/store';
import { upsertJournalEntry, deleteJournalEntry } from '@/app/actions/journal';

export class RemoteJournalRepository extends BaseRemoteRepository<JournalEntry> {
  public async create(entity: JournalEntry): Promise<unknown> {
    const dateStr = typeof entity.journalDate === 'string' 
      ? entity.journalDate.split('T')[0]
      : new Date(entity.journalDate).toISOString().split('T')[0];

    const fields = {
      content: entity.content,
      mood: entity.mood,
      gratitude: entity.gratitude,
      reflections: entity.reflections,
      lessonsLearned: entity.lessonsLearned,
      tomorrowPlan: entity.tomorrowPlan,
      metadata: typeof entity.metadata === 'string' ? JSON.parse(entity.metadata) : entity.metadata
    };

    return upsertJournalEntry(dateStr, fields);
  }

  public async update(_id: string, entity: Partial<JournalEntry>): Promise<unknown> {
    const dateStr = entity.journalDate
      ? (typeof entity.journalDate === 'string' ? entity.journalDate.split('T')[0] : new Date(entity.journalDate).toISOString().split('T')[0])
      : new Date().toISOString().split('T')[0];

    const fields = {
      content: entity.content,
      mood: entity.mood,
      gratitude: entity.gratitude,
      reflections: entity.reflections,
      lessonsLearned: entity.lessonsLearned,
      tomorrowPlan: entity.tomorrowPlan,
      metadata: typeof entity.metadata === 'string' ? JSON.parse(entity.metadata) : entity.metadata
    };

    return upsertJournalEntry(dateStr, fields);
  }

  public async delete(id: string): Promise<unknown> {
    return deleteJournalEntry(id);
  }

  public async getJournalByDate(_userId: string, _dateStr: string): Promise<JournalEntry | null> {
    return null;
  }

  public async getJournalRange(_userId: string, _startDateStr: string, _endDateStr: string): Promise<JournalEntry[]> {
    return [];
  }

  public async searchJournal(_userId: string, _query: string): Promise<JournalEntry[]> {
    return [];
  }
}
export default RemoteJournalRepository;
