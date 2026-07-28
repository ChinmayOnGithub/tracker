import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { LeaveRecord } from '@/lib/store/store';
import { createLeaveRequest, updateLeaveStatus, deleteLeaveRecord } from '@/app/actions/leave';
import { LeaveType, LeaveStatus } from '@prisma/client';

export class RemoteLeaveRepository extends BaseRemoteRepository<LeaveRecord> {
  public async create(entity: LeaveRecord): Promise<unknown> {
    const startDateStr = typeof entity.startDate === 'string' 
      ? entity.startDate.split('T')[0]
      : new Date(entity.startDate).toISOString().split('T')[0];
    const endDateStr = typeof entity.endDate === 'string'
      ? entity.endDate.split('T')[0]
      : new Date(entity.endDate).toISOString().split('T')[0];

    return createLeaveRequest({
      leaveType: entity.leaveType as LeaveType,
      startDate: startDateStr,
      endDate: endDateStr,
      totalDays: entity.totalDays,
      notes: entity.notes || undefined,
      status: entity.status as LeaveStatus,
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
