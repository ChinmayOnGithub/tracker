import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { WorkSessionService } from '@/modules/work/services/WorkSessionService'
import { ActivityService } from '@/lib/services/ActivityService'
import { db } from '@/lib/db'
import { WorkSession, ActivityLog } from '@prisma/client'

describe('WorkSession Atomicity & State Transition Invariants', () => {
  const userIdA = 'usr_alice_work'
  const userIdB = 'usr_bob_work'
  const sessionId = 'ws_atomic_1'

  let mockSessions: Record<string, WorkSession>
  let mockLogs: Record<string, ActivityLog>
  let txCommitted: boolean

  const origTransaction = db.$transaction

  afterEach(() => {
    db.$transaction = origTransaction
  })

  beforeEach(() => {
    mockSessions = {}
    mockLogs = {}
    txCommitted = false

    mockSessions[sessionId] = {
      id: sessionId,
      userId: userIdA,
      date: '2026-10-01',
      mode: 'office',
      status: 'ACTIVE',
      loggingMode: 'timer',
      durationMinutes: 30,
      durationSeconds: 1800,
      manualMinutes: 0,
      startedAt: new Date(Date.now() - 30 * 60000),
      endedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }

    mockLogs['log_1'] = {
      id: 'log_1',
      userId: userIdA,
      activityId: 'tmpl_work',
      logDate: new Date('2026-10-01T12:00:00Z'),
      status: 'done',
      amount: 0.5,
      note: 'Initial work log',
      payload: { sessionState: 'running', workSessionId: sessionId },
      workSessionId: sessionId,
      weightRecordId: null,
      leaveRecordId: null,
      journalEntryId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }

    // Mock transaction harness executing against in-memory session/log store with rollback semantics
    db.$transaction = (async <T>(cb: (tx: typeof db) => Promise<T>): Promise<T> => {
      const sessionSnapshot = { ...mockSessions, [sessionId]: { ...mockSessions[sessionId] } }
      const logSnapshot = { ...mockLogs, ['log_1']: { ...mockLogs['log_1'] } }

      const fakeTx = {
        $executeRaw: async () => 1,
        workSession: {
          findFirst: async ({ where }: { where: { id: string; userId: string; deletedAt?: null } }) => {
            const s = mockSessions[where.id]
            if (s && s.userId === where.userId && s.deletedAt === null) {
              return { ...s }
            }
            return null
          },
          update: async ({ where, data }: { where: { id: string }; data: Partial<WorkSession> }) => {
            const s = mockSessions[where.id]
            if (!s) throw new Error('Work session not found')
            const updated = { ...s, ...data, updatedAt: new Date() }
            mockSessions[where.id] = updated
            return updated
          },
        },
        activityLog: {
          findFirst: async ({ where }: { where: { workSessionId: string; userId: string; deletedAt?: null } }) => {
            const found = Object.values(mockLogs).find(
              (l) => l.workSessionId === where.workSessionId && l.userId === where.userId && l.deletedAt === null
            )
            return found ? { ...found } : null
          },
          findUnique: async ({ where }: { where: { id: string } }) => {
            const found = mockLogs[where.id]
            return found ? { ...found } : null
          },
          update: async ({ where, data }: { where: { id: string }; data: Partial<ActivityLog> }) => {
            const l = mockLogs[where.id]
            if (!l) throw new Error('Log not found')
            const updated = { ...l, ...data, updatedAt: new Date() }
            mockLogs[where.id] = updated
            return updated
          },
          updateMany: async ({ where, data }: { where: { workSessionId: string; userId: string }; data: Partial<ActivityLog> }) => {
            let count = 0
            for (const [k, l] of Object.entries(mockLogs)) {
              if (l.workSessionId === where.workSessionId && l.userId === where.userId) {
                mockLogs[k] = { ...l, ...data, updatedAt: new Date() }
                count++
              }
            }
            return { count }
          },
        },
      } as unknown as typeof db

      try {
        const result = await cb(fakeTx)
        txCommitted = true
        return result
      } catch (err) {
        mockSessions = sessionSnapshot
        mockLogs = logSnapshot
        throw err
      }
    }) as unknown as typeof db.$transaction
  })

  it('transitions ACTIVE -> PAUSED atomically and updates both WorkSession and ActivityLog', async () => {
    const updated = await WorkSessionService.pauseSession(userIdA, sessionId)

    expect(updated.status).toBe('PAUSED')
    expect(txCommitted).toBe(true)
    expect(mockSessions[sessionId].status).toBe('PAUSED')
    expect(mockLogs['log_1'].note).toContain('Paused work session')
    const payload = mockLogs['log_1'].payload as Record<string, unknown>
    expect(payload.sessionState).toBe('paused')
  })

  it('handles PAUSED -> PAUSED idempotently without modifying state', async () => {
    mockSessions[sessionId].status = 'PAUSED'
    const origDuration = mockSessions[sessionId].durationMinutes

    const res = await WorkSessionService.pauseSession(userIdA, sessionId)

    expect(res.status).toBe('PAUSED')
    expect(res.durationMinutes).toBe(origDuration)
  })

  it('rejects pausing an already COMPLETED session', async () => {
    mockSessions[sessionId].status = 'COMPLETED'
    mockSessions[sessionId].endedAt = new Date()

    await expect(WorkSessionService.pauseSession(userIdA, sessionId)).rejects.toThrow(
      'Cannot pause a completed work session'
    )
  })

  it('transitions PAUSED -> ACTIVE atomically on resume', async () => {
    mockSessions[sessionId].status = 'PAUSED'

    const res = await WorkSessionService.resumeSession(userIdA, sessionId)

    expect(res.status).toBe('ACTIVE')
    expect(mockSessions[sessionId].status).toBe('ACTIVE')
    expect(mockLogs['log_1'].note).toContain('Resumed work session')
    const payload = mockLogs['log_1'].payload as Record<string, unknown>
    expect(payload.sessionState).toBe('running')
  })

  it('handles ACTIVE -> ACTIVE resume idempotently', async () => {
    const res = await WorkSessionService.resumeSession(userIdA, sessionId)
    expect(res.status).toBe('ACTIVE')
  })

  it('rejects resuming an already COMPLETED session', async () => {
    mockSessions[sessionId].status = 'COMPLETED'

    await expect(WorkSessionService.resumeSession(userIdA, sessionId)).rejects.toThrow(
      'Cannot resume a completed work session'
    )
  })

  it('transitions ACTIVE -> COMPLETED atomically on finish', async () => {
    const res = await WorkSessionService.finishSession(userIdA, sessionId)

    expect(res.status).toBe('COMPLETED')
    expect(res.endedAt).toBeDefined()
    expect(mockSessions[sessionId].status).toBe('COMPLETED')
    const payload = mockLogs['log_1'].payload as Record<string, unknown>
    expect(payload.sessionState).toBe('completed')
  })

  it('handles COMPLETED -> COMPLETED finish idempotently', async () => {
    mockSessions[sessionId].status = 'COMPLETED'
    mockSessions[sessionId].endedAt = new Date()

    const res = await WorkSessionService.finishSession(userIdA, sessionId)
    expect(res.status).toBe('COMPLETED')
  })

  it('rolls back WorkSession and ActivityLog if ActivityLog update throws mid-transaction', async () => {
    const origLogActivity = ActivityService.logActivity
    ActivityService.logActivity = mock(() => {
      throw new Error('Database constraint violation during ActivityLog sync')
    }) as unknown as typeof ActivityService.logActivity

    const origSessionState = { ...mockSessions[sessionId] }

    try {
      await expect(WorkSessionService.pauseSession(userIdA, sessionId)).rejects.toThrow(
        'Database constraint violation during ActivityLog sync'
      )
      expect(mockSessions[sessionId].status).toBe(origSessionState.status)
    } finally {
      ActivityService.logActivity = origLogActivity
    }
  })

  it('prevents user B from pausing or mutating user A session', async () => {
    await expect(WorkSessionService.pauseSession(userIdB, sessionId)).rejects.toThrow(
      'Work session not found'
    )
    await expect(WorkSessionService.resumeSession(userIdB, sessionId)).rejects.toThrow(
      'Work session not found'
    )
    await expect(WorkSessionService.finishSession(userIdB, sessionId)).rejects.toThrow(
      'Work session not found'
    )
    expect(mockSessions[sessionId].status).toBe('ACTIVE')
  })
})
