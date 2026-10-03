import { db } from '@/lib/db';
import { ActivityService, type TransactionalDbClient } from '@/lib/services/ActivityService';
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
    const now = new Date();
    const effectiveStart = requestedStartTime
      ? createLocalDateTime(date, requestedStartTime)
      : now;

    if (effectiveStart.getTime() > now.getTime()) {
      throw new Error('Work session start time cannot be in the future.');
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const inTime = `${pad(effectiveStart.getHours())}:${pad(effectiveStart.getMinutes())}`;

    // Atomically acquire per-user advisory lock, verify state, and create session + log (#155, #156)
    return await db.$transaction(async (tx) => {
      // 1. Acquire per-user advisory lock to serialize concurrent start requests
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-session:' || ${userId}))`;
      } catch {
        // Non-fatal if advisory locking is not supported in isolated test/mock environments
      }

      // 2. Re-check if there is already an active or paused session under the lock
      const active = await tx.workSession.findFirst({
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

      // 3. Create session record
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

      // 4. Retrieve or create template using the active transaction
      const template = await ActivityService.getOrCreateDefaultTemplate(
        userId,
        'PERSONAL',
        'Work Tracker',
        'productivity',
        'Briefcase',
        'amber',
        tx
      );

      // 5. Create corresponding ActivityLog inside the exact same transaction
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
   * Fully atomic: WorkSession update and ActivityLog update commit or rollback together.
   */
  public static async pauseSession(userId: string, id: string) {
    return await db.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-session:' || ${userId}))`;
      } catch {
        // Non-fatal in mock/test environments
      }

      const session = await tx.workSession.findFirst({
        where: { id, userId, deletedAt: null }
      });
      if (!session) {
        throw new Error('Work session not found.');
      }

      const currentStatus = session.status?.toUpperCase() || (session.endedAt ? 'COMPLETED' : 'ACTIVE');

      // Idempotent: already paused
      if (currentStatus === 'PAUSED') {
        return session;
      }
      if (currentStatus === 'COMPLETED') {
        throw new Error('Cannot pause a completed work session.');
      }

      const now = new Date();
      const started = session.startedAt ? new Date(session.startedAt) : now;
      const segmentMs = Math.max(0, now.getTime() - started.getTime());
      const segmentSeconds = Math.max(0, Math.floor(segmentMs / 1000));
      const currentAccumulated = (session.durationSeconds && session.durationSeconds > 0)
        ? session.durationSeconds
        : (session.durationMinutes * 60);
      const totalSeconds = currentAccumulated + segmentSeconds;
      const totalMinutes = Math.round(totalSeconds / 60);

      const updatedSession = await tx.workSession.update({
        where: { id },
        data: {
          status: 'PAUSED',
          durationSeconds: totalSeconds,
          durationMinutes: totalMinutes,
          startedAt: null,
        }
      });

      const log = await tx.activityLog.findFirst({
        where: { workSessionId: id, userId, deletedAt: null }
      });
      if (log) {
        const prevPayload = (log.payload || {}) as Record<string, unknown>;
        const hours = parseFloat((totalSeconds / 3600).toFixed(2));
        await ActivityService.logActivity({
          id: log.id,
          userId,
          templateId: log.activityId,
          date: session.date,
          status: session.mode === 'office' ? 'done' : 'wfh',
          workSessionId: id,
          amount: hours,
          note: `Paused work session: ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m (${session.mode.toUpperCase()})`,
          payload: {
            ...prevPayload,
            sessionState: 'paused',
            accumulatedSeconds: totalSeconds,
            currentSegmentStartedAt: null,
            workSessionId: id,
          }
        }, tx as TransactionalDbClient);
      }

      return updatedSession;
    });
  }

  /**
   * Resumes a paused work session without losing accumulated duration.
   * Fully atomic: WorkSession update and ActivityLog update commit or rollback together.
   */
  public static async resumeSession(userId: string, id: string) {
    return await db.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-session:' || ${userId}))`;
      } catch {
        // Non-fatal in mock/test environments
      }

      const session = await tx.workSession.findFirst({
        where: { id, userId, deletedAt: null }
      });
      if (!session) {
        throw new Error('Work session not found.');
      }

      const currentStatus = session.status?.toUpperCase() || (session.endedAt ? 'COMPLETED' : 'ACTIVE');

      // Idempotent: already running
      if (currentStatus === 'ACTIVE' && session.endedAt === null) {
        return session;
      }
      if (currentStatus === 'COMPLETED') {
        throw new Error('Cannot resume a completed work session.');
      }

      const now = new Date();
      const updatedSession = await tx.workSession.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          startedAt: now,
          endedAt: null,
        }
      });

      const log = await tx.activityLog.findFirst({
        where: { workSessionId: id, userId, deletedAt: null }
      });
      if (log) {
        const prevPayload = (log.payload || {}) as Record<string, unknown>;
        const currentAccumulated = (session.durationSeconds && session.durationSeconds > 0)
          ? session.durationSeconds
          : (session.durationMinutes * 60);
        const hours = parseFloat((currentAccumulated / 3600).toFixed(2));
        await ActivityService.logActivity({
          id: log.id,
          userId,
          templateId: log.activityId,
          date: session.date,
          status: session.mode === 'office' ? 'done' : 'wfh',
          workSessionId: id,
          amount: hours,
          note: `Resumed work session (${session.mode.toUpperCase()})`,
          payload: {
            ...prevPayload,
            sessionState: 'running',
            accumulatedSeconds: currentAccumulated,
            currentSegmentStartedAt: now.toISOString(),
            workSessionId: id,
          }
        }, tx as TransactionalDbClient);
      }

      return updatedSession;
    });
  }

  /**
   * Finalizes/stops a work session and logs the final duration.
   * Fully atomic: WorkSession update and ActivityLog update commit or rollback together.
   */
  public static async finishSession(userId: string, id: string) {
    return await db.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-session:' || ${userId}))`;
      } catch {
        // Non-fatal in mock/test environments
      }

      const session = await tx.workSession.findFirst({
        where: { id, userId, deletedAt: null }
      });
      if (!session) {
        throw new Error('Work session not found.');
      }

      const currentStatus = session.status?.toUpperCase() || (session.endedAt ? 'COMPLETED' : 'ACTIVE');

      // Idempotent: already completed
      if (currentStatus === 'COMPLETED') {
        return session;
      }

      const now = new Date();
      let totalSeconds = (session.durationSeconds && session.durationSeconds > 0)
        ? session.durationSeconds
        : (session.durationMinutes * 60);

      // If currently running, add the elapsed time of the active segment
      if (currentStatus === 'ACTIVE' && session.startedAt !== null) {
        const started = new Date(session.startedAt);
        const segmentSeconds = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
        totalSeconds += segmentSeconds;
      }

      const finalDurationMinutes = Math.round(totalSeconds / 60);
      const finalHours = parseFloat((totalSeconds / 3600).toFixed(2));

      const updatedSession = await tx.workSession.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          durationSeconds: totalSeconds,
          durationMinutes: finalDurationMinutes
        }
      });

      const log = await tx.activityLog.findFirst({
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
          amount: finalHours,
          note: `Worked ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m (${session.mode.toUpperCase()})`,
          payload: {
            ...prevPayload,
            sessionState: 'completed',
            outTime,
            accumulatedSeconds: totalSeconds,
            currentSegmentStartedAt: null,
            hours: finalHours,
            workSessionId: id,
          }
        }, tx as TransactionalDbClient);
      }

      return updatedSession;
    });
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

    const data: { mode?: string; durationMinutes?: number; durationSeconds?: number; status?: string } = {};
    if (updates.mode !== undefined) data.mode = updates.mode;
    if (updates.durationMinutes !== undefined) {
      data.durationMinutes = updates.durationMinutes;
      data.durationSeconds = updates.durationMinutes * 60;
    }
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
    // Atomically create session + ActivityLog; set status=COMPLETED immediately (#P0, #P1)
    return await db.$transaction(async (tx) => {
      const session = await tx.workSession.create({
        data: {
          id: params.id || undefined,
          userId: params.userId,
          date: params.date,
          mode: params.mode,
          status: 'COMPLETED', // Manual sessions are already complete — never ACTIVE
          loggingMode: 'manual',
          durationMinutes: params.durationMinutes,
          durationSeconds: params.durationMinutes * 60,
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
        'amber',
        tx
      );

      const hours = parseFloat((params.durationMinutes / 60).toFixed(2));
      await ActivityService.logActivity({
        userId: params.userId,
        templateId: template.id,
        date: params.date,
        status: params.mode === 'office' ? 'done' : 'wfh',
        workSessionId: session.id,
        amount: hours,
        note: `Manually logged work: ${Math.floor(params.durationMinutes / 60)}h ${params.durationMinutes % 60}m (${params.mode.toUpperCase()})`
      }, tx);

      return session;
    });
  }

  /**
   * Soft deletes a work session and removes the corresponding ActivityLog atomically.
   */
  public static async deleteSession(userId: string, id: string) {
    return await db.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-session:' || ${userId}))`;
      } catch {
        // Non-fatal in mock/test environments
      }

      const session = await tx.workSession.findFirst({
        where: { id, userId, deletedAt: null }
      });
      if (!session) {
        throw new Error('Work session not found.');
      }

      await tx.workSession.update({
        where: { id },
        data: { deletedAt: new Date() }
      });

      await tx.activityLog.updateMany({
        where: { workSessionId: id, userId, deletedAt: null },
        data: { deletedAt: new Date() }
      });
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
