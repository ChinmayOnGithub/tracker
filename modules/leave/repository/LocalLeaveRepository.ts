import { BaseLocalRepository } from '@/lib/database/repository/BaseRepository';
import { LeaveRecord } from '@/lib/store/store';
import { ILeaveRepository } from './ILeaveRepository';

export class LocalLeaveRepository 
  extends BaseLocalRepository<LeaveRecord> 
  implements ILeaveRepository 
{
  constructor() {
    super('leave_records');
  }
}
export default LocalLeaveRepository;
