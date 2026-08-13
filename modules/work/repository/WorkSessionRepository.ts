import { BaseRepository } from '@/lib/database/repository/BaseRepository';
import { WorkSession } from '../types';
import { LocalWorkSessionRepository } from './LocalWorkSessionRepository';
import { IWorkSessionRepository } from './IWorkSessionRepository';

export class WorkSessionRepository
  extends BaseRepository<WorkSession>
  implements IWorkSessionRepository
{
  constructor() {
    super(new LocalWorkSessionRepository(), 'work_sessions');
  }

  public async getSessionsForDate(userId: string, dateStr: string): Promise<WorkSession[]> {
    return (this.local as LocalWorkSessionRepository).getSessionsForDate(userId, dateStr);
  }
}
export default WorkSessionRepository;
