import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { WorkSession } from '../types';
import { IWorkSessionRepository } from './IWorkSessionRepository';
import { createWorkSession, updateWorkSession, deleteWorkSession } from '../actions';

export class RemoteWorkSessionRepository
  extends BaseRemoteRepository<WorkSession>
  implements IWorkSessionRepository
{
  public async getById(_id: string): Promise<WorkSession | null> {
    return null;
  }

  public async getAll(): Promise<WorkSession[]> {
    return [];
  }

  public async save(_session: WorkSession): Promise<void> {}

  public async create(session: WorkSession): Promise<unknown> {
    return createWorkSession(session);
  }

  public async update(id: string, session: Partial<WorkSession>): Promise<unknown> {
    return updateWorkSession(id, session);
  }

  public async delete(id: string): Promise<void> {
    await deleteWorkSession(id);
  }

  public async getSessionsForDate(_userId: string, _dateStr: string): Promise<WorkSession[]> {
    return [];
  }
}
export default RemoteWorkSessionRepository;
