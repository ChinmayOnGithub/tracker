import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { WorkSessionService } from '@/modules/work/services/WorkSessionService'
import { db } from '@/lib/db'
import { getWeekDates } from '@/lib/recurrence'
import { z } from 'zod'

const startOrManualSchema = z.object({
  action: z.enum(['start', 'manual']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  mode: z.enum(['office', 'wfh']).default('office'),
  inTime: z.string().optional(),
  durationMinutes: z.number().int().min(1).optional(),
})

const patchSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
  action: z.enum(['pause', 'resume', 'finish', 'update']),
  mode: z.enum(['office', 'wfh']).optional(),
  durationMinutes: z.number().int().min(0).optional(),
})

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const weekDates = getWeekDates(date, 'monday')

    const [activeSession, sessionForDate, weekSessions, rangeSessions] = await Promise.all([
      db.workSession.findFirst({
        where: {
          userId: user.id,
          status: { in: ['ACTIVE', 'PAUSED'] },
          deletedAt: null,
        },
      }),
      db.workSession.findFirst({
        where: {
          userId: user.id,
          date,
          deletedAt: null,
        },
      }),
      db.workSession.findMany({
        where: {
          userId: user.id,
          date: { in: weekDates },
          deletedAt: null,
        },
        orderBy: { date: 'asc' },
      }),
      startDate && endDate
        ? db.workSession.findMany({
            where: {
              userId: user.id,
              date: { gte: startDate, lte: endDate },
              deletedAt: null,
            },
            orderBy: { date: 'asc' },
          })
        : Promise.resolve([]),
    ])

    // Compute weekly hours with 2 decimal precision
    const now = Date.now()
    let weeklyOfficeSec = 0
    let weeklyWfhSec = 0

    for (const ws of weekSessions) {
      let sec = (ws.durationSeconds && ws.durationSeconds > 0)
        ? ws.durationSeconds
        : (ws.durationMinutes * 60)

      if (ws.status === 'ACTIVE' && ws.startedAt) {
        const seg = Math.max(0, Math.floor((now - new Date(ws.startedAt).getTime()) / 1000))
        sec += seg
      }

      if (ws.mode === 'office') {
        weeklyOfficeSec += sec
      } else {
        weeklyWfhSec += sec
      }
    }

    const weeklyOfficeHours = parseFloat((weeklyOfficeSec / 3600).toFixed(2))
    const weeklyWfhHours = parseFloat((weeklyWfhSec / 3600).toFixed(2))
    const weeklyTotalHours = parseFloat(((weeklyOfficeSec + weeklyWfhSec) / 3600).toFixed(2))

    return apiSuccess({
      activeSession,
      sessionForDate,
      weekDates,
      weekSessions,
      rangeSessions,
      weeklyTotalHours,
      weeklyOfficeHours,
      weeklyWfhHours,
      weeklyGoal: 40.0,
    })
  } catch (error) {
    console.error('[MobileWorkSession GET] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve work session', 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = startOrManualSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
        400
      )
    }

    const { action, date, mode, inTime, durationMinutes } = parsed.data

    if (action === 'manual') {
      if (durationMinutes === undefined) {
        return apiError('VALIDATION_ERROR', 'durationMinutes is required for manual sessions', 400)
      }
      const session = await WorkSessionService.createManualSession({
        userId: user.id,
        date,
        mode,
        durationMinutes,
      })
      return apiSuccess({ session })
    }

    const session = await WorkSessionService.startSession(
      user.id,
      date,
      mode,
      undefined,
      inTime
    )
    return apiSuccess({ session })
  } catch (error) {
    console.error('[MobileWorkSession POST] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create work session'
    return apiError('INTERNAL_ERROR', message, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
        400
      )
    }

    const { id, action, mode, durationMinutes } = parsed.data

    let session: unknown
    if (action === 'pause') {
      session = await WorkSessionService.pauseSession(user.id, id)
    } else if (action === 'resume') {
      session = await WorkSessionService.resumeSession(user.id, id)
    } else if (action === 'finish') {
      session = await WorkSessionService.finishSession(user.id, id)
    } else if (action === 'update') {
      session = await WorkSessionService.updateSession(user.id, id, {
        mode,
        durationMinutes,
      })
    }

    return apiSuccess({ session })
  } catch (error) {
    console.error('[MobileWorkSession PATCH] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update work session'
    return apiError('INTERNAL_ERROR', message, 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return apiError('VALIDATION_ERROR', 'Session ID query parameter is required', 400)
    }

    await WorkSessionService.deleteSession(user.id, id)
    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('[MobileWorkSession DELETE] Internal error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete work session'
    return apiError('INTERNAL_ERROR', message, 500)
  }
}
