export interface StoreConfig {
  name: string;
  keyPath: string;
  autoIncrement?: boolean;
  indexes: { name: string; keyPath: string | string[]; unique?: boolean; multiEntry?: boolean }[];
}

export const DB_NAME = 'tracker_local_db';

export const STORES: StoreConfig[] = [
  {
    name: 'activity_templates',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'category', keyPath: 'category' },
      { name: 'recurrenceType', keyPath: 'recurrenceType' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'activity_logs',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'activityId', keyPath: 'activityId' },
      { name: 'logDate', keyPath: 'logDate' },
      { name: 'status', keyPath: 'status' },
      { name: 'deletedAt', keyPath: 'deletedAt' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'user_logDate', keyPath: ['userId', 'logDate'] },
      { name: 'logDate_status', keyPath: ['logDate', 'status'] }
    ]
  },
  {
    name: 'journal_entries',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'journalDate', keyPath: 'journalDate' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'notes',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'weight_records',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'date', keyPath: 'date' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'leave_records',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'status', keyPath: 'status' },
      { name: 'startDate', keyPath: 'startDate' },
      { name: 'endDate', keyPath: 'endDate' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'secure_vault_metadata',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'mimeGroup', keyPath: 'mimeGroup' },
      { name: 'isFolder', keyPath: 'isFolder' },
      { name: 'deletedAt', keyPath: 'deletedAt' },
      { name: 'parentId', keyPath: 'parentId' }
    ]
  },
  {
    name: 'link_library',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'work_sessions',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'date', keyPath: 'date' },
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'sync_queue',
    keyPath: 'id',
    indexes: [
      { name: 'syncStatus', keyPath: 'syncStatus' },
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'module', keyPath: 'module' },
      { name: 'entityId', keyPath: 'entityId' },
      { name: 'module_entityId', keyPath: ['module', 'entityId'] }
    ]
  },
  {
    name: 'sync_metadata',
    keyPath: 'key',
    indexes: []
  },
  {
    name: 'settings',
    keyPath: 'key',
    indexes: []
  }
];
