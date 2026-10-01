import { db } from '@/lib/db';
import { ActivityService } from '@/lib/services/ActivityService';
import { createLocalDateTime } from '@/lib/dateUtils';

export interface WorkSessionUpdateInput {
  mode?: string;
  durationMinutes?: number;
  status?: string;
}

export class WorkSessionService {
  /**
   * Starts a new work session using a timer.
   */
  public static async startSession(
    userId: string,
    date: string,
    mode: 'office' | 'wfh',
    id?: string,
    requestedStartTime?: string
  ) {
    // Check if there is already an active or paused session (#155)
    const active = await db.workSession.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PAUSED'] },
        deletedAt: null
      }
    });
    if (active) {
      // Idempotent protection against double-click: return the existing active session
      if (active.date === date) {
        return active;
      }
      throw new Error('A work session is already active on another date.');
    }

    const now = new Date();
    const effectiveStart = requestedStartTime
      ? createLocalDateTime(date, requestedStartTime)
      : now;

    if (effectiveStart.getTime() > now.getTime()) {
      throw new Error('Work session start time cannot be in the future.');
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const inTime = `${pad(effectiveStart.getHours())}:${pad(effectiveStart.getMinutes())}`;

    // Atomically create WorkSession and ActivityLog in one transaction (#156)
    return await db.$transaction(async (tx) => {
      const session = await tx.workSession.create({
        data: {
          id: id || undefined,
          userId,
          date,
          mode,
          status: 'ACTIVE',
          startedAt: effectiveStart,
          loggingMode: 'timer',
          durationMinutes: 0
        }
      });

      const template = await ActivityService.getOrCreateDefaultTemplate(
        userId,
        'PERSONAL',
        'Work Tracker',
        'productivity',
        'Briefcase',
        'amber'
      );

      // Create corresponding ActivityLog inside the same transaction
      await ActivityService.logActivity({
        userId,
        templateId: template.id,
        date,
        status: mode === 'office' ? 'done' : 'wfh',
        workSessionId: session.id,
        amount: 0,
        note: `Started work session (${mode.toUpperCase()})`,
        payload: {
          sessionState: 'running',
          accumulatedSeconds: 0,
          currentSegmentStartedAt: effectiveStart.toISOString(),
          inTime,
          outTime: null,
          loggingMode: 'time',
          workSessionId: session.id,
          isWfh: mode === 'wfh'
        }
      }, tx);

      return session;
    });
  }

  /**
   * Pauses an active work session, calculating the elapsed segment duration and accumulating it.
   * Session status is set to PAUSED without setting endedAt (#155).
   */
  public static async pauseSession(userId: string, id: string) {
    const session = await db.workSession.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!session) {
      throw new Error('Work session not found.');
    }
    // Idempotent: already paused
    if (session.status === 'PAUSED') {
      return session;
    }

    const now = new Date();
    const started = session.startedAt ? new Date(session.startedAt) : now;
    const segmentMs = Math.max(0, now.getTime() - started.getTime());
    const segmentMinutes = Math.round(segmentMs / 60000);
    const totalMinutes = session.durationMinutes + segmentMinutes;

    const updatedSession = await db.workSession.update({
      where: { id },
      data: {
        status: 'PAUSED',
        durationMinutes: totalMinutes
      }
    });

    const log = await db.activityLog.findFirst({
      where: { workSessionId: id, userId, deletedAt: null }
    });
    if (log) {
      const prevPayload = (log.payload || {}) as Record<string, unknown>;
      await ActivityService.logActivity({
        id: log.id,
        userId,
        templateId: log.activityId,
        date: session.date,
        status: session.mode === 'office' ? 'done' : 'wfh',
        workSessionId: id,
        amount: parseFloat((totalMinutes / 60).toFixed(1)),
        note: `Paused work session: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m (${session.mode.toUpperCase()})`,
        payload: {
          ...prevPayload,
          sessionState: 'paused',
          accumulatedSeconds: totalMinutes * 60,
          currentSegmentStartedAt: null,
          workSessionId: id,
        }
      });
    }

    return updatedSession;
  }

  /**
   * Resumes a paused work session without losing accumulated duration.
   */
  public static async resumeSession(userId: string, id: string) {
    const session = await db.workSession.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!session) {
      throw new Error('Work session not found.');
    }
    // Idempotent: already running
    if (session.status === 'ACTIVE' && session.endedAt === null) {
      return session;
    }

    const now = new Date();
    const updatedSession = await db.workSession.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        startedAt: now,
        endedAt: null,
      }
    });

    const log = await db.activityLog.findFirst({
      where: { workSessionId: id, userId, deletedAt: null }
    });
    if (log) {
      const prevPayload = (log.payload || {}) as Record<string, unknown>;
      await ActivityService.logActivity({
        id: log.id,
        userId,
        templateId: log.activityId,
        date: session.date,
        status: session.mode === 'office' ? 'done' : 'wfh',
        workSessionId: id,
        amount: parseFloat((session.durationMinutes / 60).toFixed(1)),
        note: `Resumed work session (${session.mode.toUpperCase()})`,
        payload: {
          ...prevPayload,
          sessionState: 'running',
          accumulatedSeconds: session.durationMinutes * 60,
          currentSegmentStartedAt: now.toISOString(),
          workSessionId: id,
        }
      });
    }

    return updatedSession;
  }

  /**
   * Finalizes/stops a work session and logs the final duration.
   */
  public static async finishSession(userId: string, id: string) {
    const session = await db.workSession.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!session) {
      throw new Error('Work session not found.');
    }

    const now = new Date();
    let finalDurationMinutes = session.durationMinutes;

    // If currently running, add the elapsed time of the active segment
    if (session.status === 'ACTIVE' && session.startedAt !== null) {
      const started = new Date(session.startedAt);
      const segmentMinutes = Math.max(0, Math.round((now.getTime() - started.getTime()) / 60000));
      finalDurationMinutes += segmentMinutes;
    }

    const updatedSession = await db.workSession.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endedAt: now,
        durationMinutes: finalDurationMinutes
      }
    });

    const log = await db.activityLog.findFirst({
      where: { workSessionId: id, userId, deletedAt: null }
    });
    if (log) {
      const prevPayload = (log.payload || {}) as Record<string, unknown>;
      const pad = (n: number) => String(n).padStart(2, '0');
      const outTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      await ActivityService.logActivity({
        id: log.id,
        userId,
        templateId: log.activityId,
        date: session.date,
        status: session.mode === 'office' ? 'done' : 'wfh',
        workSessionId: id,
        amount: parseFloat((finalDurationMinutes / 60).toFixed(1)),
        note: `Worked ${Math.floor(finalDurationMinutes / 60)}h ${finalDurationMinutes % 60}m (${session.mode.toUpperCase()})`,
        payload: {
          ...prevPayload,
          sessionState: 'completed',
          outTime,
          accumulatedSeconds: finalDurationMinutes * 60,
          currentSegmentStartedAt: null,
          hours: parseFloat((finalDurationMinutes / 60).toFixed(1)),
          workSessionId: id,
        }
      });
    }

    return updatedSession;
  }

  /**
   * Stops an active work session (alias for finishSession for backward compatibility).
   */
  public static async stopSession(userId: string, id: string) {
    return this.finishSession(userId, id);
  }

  /**
   * Updates an existing work session. Rejects invalid updates without false success reports (#192).
   */
  public static async updateSession(userId: string, id: string, updates: WorkSessionUpdateInput) {
    const session = await db.workSession.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!session) {
      throw new Error('Work session not found or unauthorized.');
    }

    const data: { mode?: string; durationMinutes?: number; status?: string } = {};
    if (updates.mode !== undefined) data.mode = updates.mode;
    if (updates.durationMinutes !== undefined) data.durationMinutes = updates.durationMinutes;
    if (updates.status !== undefined) data.status = updates.status;

    if (Object.keys(data).length === 0) {
      throw new Error('No valid update fields provided.');
    }

    return await db.workSession.update({
      where: { id },
      data
    });
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
      'Work Tracker',
      'productivity',
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
      where: { workSessionId: id, userId, deletedAt: null },
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
