import { IRepository } from '@/lib/database/repository/IRepository';
import { WorkSession } from '../types';

export interface IWorkSessionRepository extends IRepository<WorkSession> {
  getSessionsForDate(userId: string, dateStr: string): Promise<WorkSession[]>;
}
export default IWorkSessionRepository;
