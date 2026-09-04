import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { Note } from '../types';
import { createNote, updateNote, deleteNote } from '@/app/actions/note';

export class RemoteNoteRepository extends BaseRemoteRepository<Note> {
  public async create(entity: Note): Promise<unknown> {
    return createNote(entity.content, entity.title, entity.date);
  }

  public async update(id: string, entity: Partial<Note>): Promise<unknown> {
    return updateNote(id, entity.content ?? '', entity.title);
  }

  public async delete(id: string): Promise<unknown> {
    return deleteNote(id);
  }
}
export default RemoteNoteRepository;
