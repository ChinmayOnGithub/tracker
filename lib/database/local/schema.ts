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
      { name: 'deletedAt', keyPath: 'deletedAt' }
    ]
  },
  {
    name: 'journal_entries',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId' },
      { name: 'journalDate', keyPath: 'journalDate' },
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
      { name: 'deletedAt', keyPath: 'deletedAt' }
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
    name: 'sync_queue',
    keyPath: 'id',
    indexes: [
      { name: 'syncStatus', keyPath: 'syncStatus' },
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'module', keyPath: 'module' }
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
