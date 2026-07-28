import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { IActivityTemplateRepository, IActivityLogRepository } from './IActivityRepository';
import { ActivityTemplate, ActivityLog } from '@/types';
import { createActivityTemplate, updateActivityTemplate, deleteActivityTemplate, reorderActivityTemplates } from '@/app/actions/template';
import { createLog, updateLog, deleteLog } from '@/app/actions/log';

export class RemoteActivityTemplateRepository 
  extends BaseRemoteRepository<ActivityTemplate> 
  implements IActivityTemplateRepository 
{
  public async getById(_id: string): Promise<ActivityTemplate | null> {
    return null;
  }

  public async getAll(): Promise<ActivityTemplate[]> {
    return [];
  }

  public async save(_template: ActivityTemplate): Promise<void> {
    // Handled via sync queue operation triggers
  }

  public async create(template: ActivityTemplate): Promise<unknown> {
    const payload = {
      ...template,
      metadata: typeof template.metadata === 'string' ? JSON.parse(template.metadata) : template.metadata,
      notificationRules: typeof template.notificationRules === 'string' ? JSON.parse(template.notificationRules) : template.notificationRules,
      tagNames: template.tags ? template.tags.map((t: { name: string }) => t.name) : []
    };
    return createActivityTemplate(payload as unknown as Parameters<typeof createActivityTemplate>[0]);
  }

  public async update(id: string, template: Partial<ActivityTemplate>): Promise<unknown> {
    const payload = {
      ...template,
      metadata: typeof template.metadata === 'string' ? JSON.parse(template.metadata) : template.metadata,
      notificationRules: typeof template.notificationRules === 'string' ? JSON.parse(template.notificationRules) : template.notificationRules,
    };
    return updateActivityTemplate(id, payload as unknown as Parameters<typeof updateActivityTemplate>[1]);
  }

  public async delete(id: string): Promise<void> {
    await deleteActivityTemplate(id);
  }

  public async reorder(ids: string[]): Promise<void> {
    await reorderActivityTemplates(ids);
  }
}

export class RemoteActivityLogRepository 
  extends BaseRemoteRepository<ActivityLog> 
  implements IActivityLogRepository 
{
  public async getById(_id: string): Promise<ActivityLog | null> {
    return null;
  }

  public async getAll(): Promise<ActivityLog[]> {
    return [];
  }

  public async save(_log: ActivityLog): Promise<void> {
    // Handled via sync queue operation triggers
  }

  public async create(log: ActivityLog): Promise<unknown> {
    return createLog({
      activityId: log.activityId,
      date: log.date,
      status: log.status,
      note: log.note,
      amount: log.amount,
      payload: typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload,
    });
  }

  public async update(id: string, log: Partial<ActivityLog>): Promise<unknown> {
    return updateLog(id, {
      status: log.status,
      note: log.note,
      amount: log.amount,
      payload: typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload,
    });
  }

  public async delete(id: string): Promise<void> {
    await deleteLog(id);
  }

  public async getLogsForDate(_dateStr: string): Promise<ActivityLog[]> {
    return [];
  }
}
