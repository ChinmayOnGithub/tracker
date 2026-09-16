import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { ActivityService } from '@/lib/services/ActivityService'
import { createLogSchema, queryLogsSchema, type CreateLogInput } from '@/lib/validations/log'
import { db } from '@/lib/db'
import { Prisma, type ActivityLog } from '@prisma/client'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    const { searchParams } = new URL(request.url)
    const queryParsed = queryLogsSchema.safeParse({
      date: searchParams.get('date') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    })

    if (!queryParsed.success) {
      return apiZodError(queryParsed.error)
    }

    const { date, startDate, endDate } = queryParsed.data

    const where: Prisma.ActivityLogWhereInput = {
      userId: user.id,
      deletedAt: null,
    }

    if (date) {
      const targetDate = new Date(`${date}T12:00:00.000Z`)
      where.logDate = targetDate
    } else if (startDate || endDate) {
      where.logDate = {
        ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
      }
    }

    const records = await db.activityLog.findMany({
      where,
      orderBy: [{ logDate: 'desc' }, { createdAt: 'desc' }],
    })

    const logs = records.map((record) => ({
      id: record.id,
      activityId: record.activityId,
      date: record.logDate.toISOString().split('T')[0],
      status: record.status,
      note: record.note,
      amount: record.amount,
      payload: record.payload,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }))

    return apiSuccess({ logs })
  } catch (error) {
    console.error('[MobileLogsGet] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve activity logs', 500)
  }
}

export function arePayloadsEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true

  const isAEmpty =
    a === undefined ||
    a === null ||
    (typeof a === 'object' && !Array.isArray(a) && Object.keys(a as object).length === 0)
  const isBEmpty =
    b === undefined ||
    b === null ||
    (typeof b === 'object' && !Array.isArray(b) && Object.keys(b as object).length === 0)

  if (isAEmpty && isBEmpty) return true
  if (isAEmpty !== isBEmpty) return false

  return deepEqual(a, b)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (typeof a !== typeof b) return false
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  if (typeof a !== 'object') {
    if (typeof a === 'number' && typeof b === 'number') {
      return Number.isNaN(a) && Number.isNaN(b)
    }
    return a === b
  }

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)

  if (aIsArray !== bIsArray) return false

  if (aIsArray && bIsArray) {
    const arrA = a as unknown[]
    const arrB = b as unknown[]
    if (arrA.length !== arrB.length) return false
    for (let i = 0; i < arrA.length; i++) {
      if (!deepEqual(arrA[i], arrB[i])) return false
    }
    return true
  }

  // Both are non-null plain objects
  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>

  const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined).sort()
  const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined).sort()

  if (keysA.length !== keysB.length) return false

  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false
  }

  for (const key of keysA) {
    if (!deepEqual(objA[key], objB[key])) return false
  }

  return true
}

function isP2002Error(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002'
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code: unknown }).code === 'P2002'
  }
  return false
}

function formatLogResponse(record: {
  id: string
  activityId: string
  logDate: Date
  status: string
  note: string | null
  amount: number | null
  payload: unknown
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: record.id,
    activityId: record.activityId,
    date: record.logDate.toISOString().split('T')[0],
    status: record.status,
    note: record.note,
    amount: record.amount,
    payload: record.payload,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function handleExistingLogConflictOrIdempotency(
  existingLog: ActivityLog,
  userId: string,
  parsedData: CreateLogInput
) {
  // Cross-user isolation: If this ID belongs to another user, deny access
  if (existingLog.userId !== userId) {
    return apiError('FORBIDDEN', 'Log record not found or unauthorized', 403)
  }

  // Soft-deleted record cannot be modified or recreated normally
  if (existingLog.deletedAt !== null) {
    return apiError(
      'CONFLICT',
      'Idempotency conflict: A record with this ID has been deleted',
      409
    )
  }

  const existingDateStr = existingLog.logDate.toISOString().split('T')[0]
  const isEquivalent =
    existingLog.activityId === parsedData.activityId &&
    existingDateStr === parsedData.date &&
    existingLog.status === parsedData.status &&
    (existingLog.note ?? null) === (parsedData.note ?? null) &&
    (existingLog.amount ?? null) === (parsedData.amount ?? null) &&
    arePayloadsEquivalent(existingLog.payload, parsedData.payload)

  if (isEquivalent) {
    // Idempotent retry: return existing record deterministically
    return apiSuccess({ log: formatLogResponse(existingLog) }, 200)
  }

  // ID collision with materially different data
  return apiError(
    'CONFLICT',
    'Idempotency conflict: An activity log with this ID already exists with different data',
    409,
    {
      id: parsedData.id,
      existing: {
        activityId: existingLog.activityId,
        date: existingDateStr,
        status: existingLog.status,
      },
    }
  )
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

    const parsed = createLogSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    // 1. If client supplies an explicit ID, check for existing record (fast-path retry-safe idempotency & conflict handling)
    if (parsed.data.id) {
      const existingLog = await db.activityLog.findUnique({
        where: { id: parsed.data.id },
      })

      if (existingLog) {
        return handleExistingLogConflictOrIdempotency(existingLog, user.id, parsed.data)
      }
    }

    // 2. Verify ownership of the template before logging
    const template = await db.activityTemplate.findUnique({
      where: { id: parsed.data.activityId },
    })

    if (!template || (template.userId && template.userId !== user.id)) {
      return apiError('FORBIDDEN', 'Template not found or unauthorized', 403)
    }

    let logRecord: ActivityLog
    try {
      logRecord = await ActivityService.logActivity({
        id: parsed.data.id,
        userId: user.id,
        templateId: parsed.data.activityId,
        date: parsed.data.date,
        status: parsed.data.status,
        note: parsed.data.note,
        amount: parsed.data.amount,
        payload: parsed.data.payload,
      })
    } catch (createError) {
      // 3. Handle concurrent collision: if a concurrent request created the record with this client ID
      if (parsed.data.id && isP2002Error(createError)) {
        const collidedLog = await db.activityLog.findUnique({
          where: { id: parsed.data.id },
        })

        if (collidedLog) {
          return handleExistingLogConflictOrIdempotency(collidedLog, user.id, parsed.data)
        }
      }

      // Re-throw unhandled or unrelated errors
      throw createError
    }

    return apiSuccess({ log: formatLogResponse(logRecord) }, 201)
  } catch (error) {
    console.error('[MobileLogsPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to record activity log', 500)
  }
}
