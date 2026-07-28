import { BaseRepository } from '@/lib/database/repository/BaseRepository';
import { IActivityTemplateRepository, IActivityLogRepository } from './IActivityRepository';
import { LocalActivityTemplateRepository, LocalActivityLogRepository } from './LocalActivityRepository';
import { ActivityTemplate, ActivityLog } from '@/types';

export class ActivityTemplateRepository 
  extends BaseRepository<ActivityTemplate> 
  implements IActivityTemplateRepository 
{
  private localTemplateRepo: LocalActivityTemplateRepository;

  constructor() {
    const local = new LocalActivityTemplateRepository();
    super(local, 'activity_templates');
    this.localTemplateRepo = local;
  }

  public async reorder(ids: string[]): Promise<void> {
    await this.localTemplateRepo.reorder(ids);
    const { SyncEngine } = await import('@/lib/database/sync/SyncEngine');
    await SyncEngine.getInstance().enqueue('activity_templates', 'UPDATE', { reorderIds: ids });
  }
}

export class ActivityLogRepository 
  extends BaseRepository<ActivityLog> 
  implements IActivityLogRepository 
{
  private localLogRepo: LocalActivityLogRepository;

  constructor() {
    const local = new LocalActivityLogRepository();
    super(local, 'activity_logs');
    this.localLogRepo = local;
  }

  public async getLogsForDate(dateStr: string): Promise<ActivityLog[]> {
    return this.localLogRepo.getLogsForDate(dateStr);
  }
}
export default ActivityTemplateRepository;
