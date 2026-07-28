import { ActivityTemplate, ActivityLog } from '@/types';

export interface IActivityTemplateRepository {
  getById(id: string): Promise<ActivityTemplate | null>;
  getAll(): Promise<ActivityTemplate[]>;
  save(template: ActivityTemplate): Promise<void>;
  delete(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
}

export interface IActivityLogRepository {
  getById(id: string): Promise<ActivityLog | null>;
  getAll(): Promise<ActivityLog[]>;
  save(log: ActivityLog): Promise<void>;
  delete(id: string): Promise<void>;
  getLogsForDate(dateStr: string): Promise<ActivityLog[]>;
}
