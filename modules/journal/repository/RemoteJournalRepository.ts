import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { JournalEntry } from '@/lib/store/store';
import { upsertJournalEntry, deleteJournalEntry } from '@/app/actions/journal';
import { toYMD, todayYMD } from '@/lib/dateUtils';

export class RemoteJournalRepository extends BaseRemoteRepository<JournalEntry> {
  public async create(entity: JournalEntry): Promise<unknown> {
    return upsertJournalEntry(toYMD(entity.journalDate), this._fields(entity));
  }

  public async update(_id: string, entity: Partial<JournalEntry>): Promise<unknown> {
    const dateStr = entity.journalDate ? toYMD(entity.journalDate) : todayYMD();
    return upsertJournalEntry(dateStr, this._fields(entity));
  }

  public async delete(id: string): Promise<unknown> {
    return deleteJournalEntry(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private _fields(entity: Partial<JournalEntry>) {
    return {
      content:       entity.content,
      mood:          entity.mood,
      gratitude:     entity.gratitude,
      reflections:   entity.reflections,
      lessonsLearned: entity.lessonsLearned,
      tomorrowPlan:  entity.tomorrowPlan,
      metadata:      typeof entity.metadata === 'string'
                       ? JSON.parse(entity.metadata)
                       : entity.metadata,
    };
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
