import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { LeaveRecord } from '@/lib/store/store';
import { createLeaveRequest, updateLeaveStatus, deleteLeaveRecord } from '@/app/actions/leave';
import { LeaveType, LeaveStatus } from '@prisma/client';
import { toYMD } from '@/lib/dateUtils';

export class RemoteLeaveRepository extends BaseRemoteRepository<LeaveRecord> {
  public async create(entity: LeaveRecord): Promise<unknown> {
    return createLeaveRequest({
      leaveType: entity.leaveType as LeaveType,
      startDate: toYMD(entity.startDate),
      endDate:   toYMD(entity.endDate),
      totalDays: entity.totalDays,
      notes:     entity.notes || undefined,
      status:    entity.status as LeaveStatus,
    });
  }

  public async update(id: string, entity: Partial<LeaveRecord>): Promise<unknown> {
    if (entity.status) {
      return updateLeaveStatus(id, entity.status as LeaveStatus);
    }
    return { success: true };
  }

  public async delete(id: string): Promise<unknown> {
    return deleteLeaveRecord(id);
  }
}
export default RemoteLeaveRepository;
