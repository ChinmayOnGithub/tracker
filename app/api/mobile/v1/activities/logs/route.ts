import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { ActivityService } from '@/lib/services/ActivityService'
import { createLogSchema, queryLogsSchema } from '@/lib/validations/log'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

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

    // Verify ownership of the template before logging
    const template = await db.activityTemplate.findUnique({
      where: { id: parsed.data.activityId },
    })

    if (!template || (template.userId && template.userId !== user.id)) {
      return apiError('FORBIDDEN', 'Template not found or unauthorized', 403)
    }

    const logRecord = await ActivityService.logActivity({
      id: parsed.data.id,
      userId: user.id,
      templateId: parsed.data.activityId,
      date: parsed.data.date,
      status: parsed.data.status,
      note: parsed.data.note,
      amount: parsed.data.amount,
      payload: parsed.data.payload,
    })

    const log = {
      id: logRecord.id,
      activityId: logRecord.activityId,
      date: logRecord.logDate.toISOString().split('T')[0],
      status: logRecord.status,
      note: logRecord.note,
      amount: logRecord.amount,
      payload: logRecord.payload,
      createdAt: logRecord.createdAt,
      updatedAt: logRecord.updatedAt,
    }

    return apiSuccess({ log }, 201)
  } catch (error) {
    console.error('[MobileLogsPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to record activity log', 500)
  }
}
