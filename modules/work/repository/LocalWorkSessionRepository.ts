import { BaseLocalRepository } from '@/lib/database/repository/BaseRepository';
import { WorkSession } from '../types';
import { IWorkSessionRepository } from './IWorkSessionRepository';

export class LocalWorkSessionRepository
  extends BaseLocalRepository<WorkSession>
  implements IWorkSessionRepository
{
  constructor() {
    super('work_sessions');
  }

  public async getSessionsForDate(_userId: string, dateStr: string): Promise<WorkSession[]> {
    return this.engine.queryIndex<WorkSession>(this.storeName, 'date', dateStr);
  }
}
export default LocalWorkSessionRepository;
