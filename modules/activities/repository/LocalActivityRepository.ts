import { BaseLocalRepository } from '@/lib/database/repository/BaseRepository';
import { ActivityTemplate, ActivityLog } from '@/types';
import { IActivityTemplateRepository, IActivityLogRepository } from './IActivityRepository';

export class LocalActivityTemplateRepository 
  extends BaseLocalRepository<ActivityTemplate> 
  implements IActivityTemplateRepository 
{
  constructor() {
    super('activity_templates');
  }

  public async reorder(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const template = await this.getById(id);
      if (template) {
        template.sortOrder = i + 1;
        template.updatedAt = new Date();
        await this.save(template);
      }
    }
  }
}

export class LocalActivityLogRepository 
  extends BaseLocalRepository<ActivityLog> 
  implements IActivityLogRepository 
{
  constructor() {
    super('activity_logs');
  }

  public async getLogsForDate(dateStr: string): Promise<ActivityLog[]> {
    const all = await this.getAll();
    return all.filter(l => l.date === dateStr);
  }
}
