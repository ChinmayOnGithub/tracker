import { IRepository } from '@/lib/database/repository/IRepository';
import { LeaveRecord } from '@/lib/store/store';

export type ILeaveRepository = IRepository<LeaveRecord>;
