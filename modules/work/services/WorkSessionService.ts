import { db } from '@/lib/db';
import { ActivityService } from '@/lib/services/ActivityService';

export class WorkSessionService {
  /**
   * Starts a new work session using a timer.
   */
  public static async startSession(userId: string, date: string, mode: 'office' | 'wfh', id?: string) {
    // Check if there is an active session (endedAt is null)
    const active = await db.workSession.findFirst({
      where: { userId, endedAt: null, deletedAt: null }
    });
    if (active) {
      throw new Error('A work session is already active.');
    }

    const session = await db.workSession.create({
      data: {
        id: id || undefined,
        userId,
        date,
        mode,
        startedAt: new Date(),
        loggingMode: 'timer',
        durationMinutes: 0
      }
    });

    const template = await ActivityService.getOrCreateDefaultTemplate(
      userId,
      'PERSONAL',
      'Work Session',
      'work',
      'Briefcase',
      'amber'
    );

    // Create corresponding ActivityLog
    await ActivityService.logActivity({
      userId,
      templateId: template.id,
      date,
      status: 'done',
      workSessionId: session.id,
      amount: 0,
      note: `Started work session (${mode.toUpperCase()})`
    });

    return session;
  }

  /**
   * Stops an active work session and calculates duration in minutes.
   */
  public static async stopSession(userId: string, id: string) {
    const session = await db.workSession.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!session) {
      throw new Error('Work session not found.');
    }
    if (session.endedAt) {
      throw new Error('Work session has already ended.');
    }

    const endedAt = new Date();
    const started = session.startedAt ? new Date(session.startedAt) : new Date();
    const durationMinutes = Math.max(0, Math.round((endedAt.getTime() - started.getTime()) / 60000));

    const updatedSession = await db.workSession.update({
      where: { id },
      data: {
        endedAt,
        durationMinutes
      }
    });

    // Update corresponding ActivityLog note & amount
    const log = await db.activityLog.findFirst({
      where: { workSessionId: id }
    });
    if (log) {
      await ActivityService.logActivity({
        id: log.id,
        userId,
        templateId: log.activityId,
        date: session.date,
        status: 'done',
        workSessionId: id,
        amount: durationMinutes,
        note: `Worked ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m (${session.mode.toUpperCase()})`
      });
    }

    return updatedSession;
  }

  /**
   * Manually logs a completed work session with duration in minutes.
   */
  public static async createManualSession(params: {
    id?: string;
    userId: string;
    date: string;
    mode: 'office' | 'wfh';
    durationMinutes: number;
  }) {
    const session = await db.workSession.create({
      data: {
        id: params.id || undefined,
        userId: params.userId,
        date: params.date,
        mode: params.mode,
        loggingMode: 'manual',
        durationMinutes: params.durationMinutes,
        manualMinutes: params.durationMinutes,
        startedAt: null,
        endedAt: null
      }
    });

    const template = await ActivityService.getOrCreateDefaultTemplate(
      params.userId,
      'PERSONAL',
      'Work Session',
      'work',
      'Briefcase',
      'amber'
    );

    await ActivityService.logActivity({
      userId: params.userId,
      templateId: template.id,
      date: params.date,
      status: 'done',
      workSessionId: session.id,
      amount: params.durationMinutes,
      note: `Manually logged work: ${Math.floor(params.durationMinutes / 60)}h ${params.durationMinutes % 60}m (${params.mode.toUpperCase()})`
    });

    return session;
  }

  /**
   * Soft deletes a work session and removes the corresponding ActivityLog.
   */
  public static async deleteSession(userId: string, id: string) {
    const session = await db.workSession.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!session) {
      throw new Error('Work session not found.');
    }

    await db.workSession.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await db.activityLog.updateMany({
      where: { workSessionId: id },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * Retrieves work sessions for a user and date range.
   */
  public static async getSessionsForRange(userId: string, startDate: string, endDate: string) {
    return db.workSession.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: startDate, lte: endDate }
      },
      orderBy: { date: 'asc' }
    });
  }
}
