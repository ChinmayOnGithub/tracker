import { BaseLocalRepository } from '@/lib/database/repository/BaseRepository';
import { Note } from '../types';

export class LocalNoteRepository extends BaseLocalRepository<Note> {
  constructor() {
    super('notes');
  }

  public async searchNotes(userId: string, query: string): Promise<Note[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(n =>
      (!userId || n.userId === userId) &&
      !n.deletedAt &&
      ((n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
    );
  }
}
export default LocalNoteRepository;
