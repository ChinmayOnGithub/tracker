import { BaseRepository } from '@/lib/database/repository/BaseRepository';
import { Note } from '../types';
import { LocalNoteRepository } from './LocalNoteRepository';

export class NoteRepository extends BaseRepository<Note> {
  constructor(localRepo: LocalNoteRepository = new LocalNoteRepository()) {
    super(localRepo, 'notes');
  }

  public async searchNotes(userId: string, query: string): Promise<Note[]> {
    return (this.local as LocalNoteRepository).searchNotes(userId, query);
  }
}
export default NoteRepository;
