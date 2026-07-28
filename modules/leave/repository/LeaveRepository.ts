import { BaseRepository } from '@/lib/database/repository/BaseRepository';
import { LeaveRecord } from '@/lib/store/store';
import { ILeaveRepository } from './ILeaveRepository';
import { LocalLeaveRepository } from './LocalLeaveRepository';

export class LeaveRepository 
  extends BaseRepository<LeaveRecord> 
  implements ILeaveRepository 
{
  constructor() {
    super(new LocalLeaveRepository(), 'leave_records');
  }
}
export default LeaveRepository;
