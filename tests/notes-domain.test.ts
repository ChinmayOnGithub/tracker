import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { NoteRepository } from '@/modules/notes/repository/NoteRepository';
import { LocalNoteRepository } from '@/modules/notes/repository/LocalNoteRepository';
import { Note } from '@/modules/notes/types';
import { setupMockIndexedDB } from './helpers/mockIndexedDB';

describe('Notes Domain & Repository Tests', () => {
  let dbMock: ReturnType<typeof setupMockIndexedDB> | null = null;

  beforeEach(() => {
    dbMock = setupMockIndexedDB();
  });

  afterEach(() => {
    if (dbMock) dbMock.restore();
  });

  it('should save a new note locally with atomic transaction queue', async () => {
    const noteRepo = new NoteRepository();
    const db = IndexedDBEngine.getInstance();
    db.putAtomic = mock(async () => {});
    db.get = mock(async () => null);
    db.queryIndex = mock(async () => []);

    const note: Note = {
      id: 'note-uuid-1',
      title: 'Interview Architecture Prep',
      content: '<p>Windows Internals, EDR, C++, Security Design</p>',
      date: '2026-09-04',
      userId: 'usr-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await noteRepo.save(note);
    expect(db.putAtomic).toHaveBeenCalled();
  });

  it('should search notes by title and content substring', async () => {
    const localRepo = new LocalNoteRepository();
    const mockNotes: Note[] = [
      {
        id: 'n-1',
        title: 'Tracker Ideas',
        content: '<p>Improve mobile journal UX and rich text editor</p>',
        date: '2026-09-04',
        userId: 'usr-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'n-2',
        title: 'Things to Buy',
        content: '<p>Ergonomic chair and standing desk</p>',
        date: '2026-09-04',
        userId: 'usr-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ];

    localRepo.getAll = mock(async () => mockNotes);

    const result = await localRepo.searchNotes('usr-1', 'chair');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('n-2');

    const resultTitle = await localRepo.searchNotes('usr-1', 'Tracker');
    expect(resultTitle.length).toBe(1);
    expect(resultTitle[0].id).toBe('n-1');
  });

  it('should soft delete a note atomically', async () => {
    const localRepo = new LocalNoteRepository();
    const noteRepo = new NoteRepository(localRepo);
    const db = IndexedDBEngine.getInstance();
    db.putAtomic = mock(async () => {});
    localRepo.getById = mock(async () => ({
      id: 'n-delete-1',
      title: 'To Delete',
      content: 'Bye',
      date: '2026-09-04',
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await noteRepo.delete('n-delete-1');
    expect(db.putAtomic).toHaveBeenCalled();
  });
});
