export interface WorkSession {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  mode: 'office' | 'wfh';
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  durationMinutes: number;
  loggingMode: 'timer' | 'manual';
  manualMinutes: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  deletedAt?: string | Date | null;
}
