import { apiSuccess, apiError, apiZodError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { assertUserModuleAccess } from '@/lib/auth-guards'
import { db } from '@/lib/db'
import { ActivityService } from '@/lib/services/ActivityService'
import { LeaveType, LeaveStatus } from '@prisma/client'
import {
  createLeaveSchema,
  updateLeaveAllowanceSchema,
} from '@/lib/validations/leave'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await assertUserModuleAccess(user, 'leave')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Leave module', 403)
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()

    if (isNaN(year) || year < 2000 || year > 2100) {
      return apiError('VALIDATION_ERROR', 'Invalid year parameter', 400)
    }

    // Ensure default allowances exist for the user for this year
    const defaultAllowances: { leaveType: LeaveType; allowance: number }[] = [
      { leaveType: LeaveType.CASUAL, allowance: 12 },
      { leaveType: LeaveType.SICK, allowance: 8 },
      { leaveType: LeaveType.PTO, allowance: 15 },
      { leaveType: LeaveType.COMP_OFF, allowance: 0 },
      { leaveType: LeaveType.HALF_DAY, allowance: 0 },
      { leaveType: LeaveType.WFH, allowance: 0 },
    ]

    for (const def of defaultAllowances) {
      await db.leaveAllowance.upsert({
        where: {
          userId_year_leaveType: {
            userId: user.id,
            year,
            leaveType: def.leaveType,
          },
        },
        create: {
          userId: user.id,
          year,
          leaveType: def.leaveType,
          allowance: def.allowance,
        },
        update: {},
      })
    }

    const [allowances, records] = await Promise.all([
      db.leaveAllowance.findMany({
        where: { userId: user.id, year },
        orderBy: { leaveType: 'asc' },
      }),
      db.leaveRecord.findMany({
        where: {
          userId: user.id,
          deletedAt: null,
          startDate: {
            gte: new Date(`${year}-01-01T00:00:00.000Z`),
            lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
        orderBy: { startDate: 'desc' },
      }),
    ])

    return apiSuccess({
      year,
      allowances,
      records: records.map((r) => ({
        id: r.id,
        userId: r.userId,
        leaveType: r.leaveType,
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0],
        totalDays: r.totalDays,
        status: r.status,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[MobileLeave GET] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve leave records', 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await assertUserModuleAccess(user, 'leave')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Leave module', 403)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = createLeaveSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const validated = parsed.data
    const startUtc = new Date(`${validated.startDate}T00:00:00.000Z`)
    const endUtc = new Date(`${validated.endDate}T23:59:59.999Z`)

    // Precalculate dates for the range
    const start = new Date(`${validated.startDate}T12:00:00.000Z`)
    const end = new Date(`${validated.endDate}T12:00:00.000Z`)
    const dates: string[] = []
    const curr = new Date(start)
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0])
      curr.setUTCDate(curr.getUTCDate() + 1)
    }

    const record = await db.$transaction(async (tx) => {
      // Serialize concurrent leave requests for the same user to prevent overlap race conditions (#159)
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('leave-overlap:' || ${user.id}))`
      } catch {
        // Fallback for SQLite / mock test environments
      }

      // Concurrency protection: check overlapping active leave
      const existingOverlap = await tx.leaveRecord.findFirst({
        where: {
          userId: user.id,
          deletedAt: null,
          status: { not: LeaveStatus.REJECTED },
          startDate: { lte: endUtc },
          endDate: { gte: startUtc },
        },
      })

      if (existingOverlap) {
        const overlapStart = existingOverlap.startDate.toISOString().split('T')[0]
        const overlapEnd = existingOverlap.endDate.toISOString().split('T')[0]
        throw new Error(
          `Overlapping leave already exists for ${existingOverlap.leaveType} (${overlapStart} to ${overlapEnd}).`
        )
      }

      const createdRecord = await tx.leaveRecord.create({
        data: {
          userId: user.id,
          leaveType: validated.leaveType,
          startDate: new Date(`${validated.startDate}T00:00:00.000Z`),
          endDate: new Date(`${validated.endDate}T00:00:00.000Z`),
          totalDays: validated.totalDays,
          notes: validated.notes ?? null,
          status: validated.status ?? LeaveStatus.APPROVED,
        },
      })

      const template = await ActivityService.getOrCreateDefaultTemplate(
        user.id,
        'LEAVE',
        'Time Off',
        'personal',
        'Calendar',
        'purple',
        tx
      )

      for (let i = 0; i < dates.length; i++) {
        const dateStr = dates[i]
        await ActivityService.logActivity(
          {
            userId: user.id,
            templateId: template.id,
            date: dateStr,
            status: 'done',
            leaveRecordId: i === 0 ? createdRecord.id : null,
            payload: {
              leaveRecordId: createdRecord.id,
              leaveType: validated.leaveType,
              dayIndex: i,
              totalDays: validated.totalDays,
            },
            note: validated.notes ?? `Time Off: ${validated.leaveType}`,
          },
          tx
        )
      }

      return createdRecord
    })

    return apiSuccess(
      {
        record: {
          id: record.id,
          userId: record.userId,
          leaveType: record.leaveType,
          startDate: record.startDate.toISOString().split('T')[0],
          endDate: record.endDate.toISOString().split('T')[0],
          totalDays: record.totalDays,
          status: record.status,
          notes: record.notes,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        },
      },
      201
    )
  } catch (error) {
    console.error('[MobileLeave POST] Internal error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create leave request'
    return apiError('VALIDATION_ERROR', msg, 400)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await assertUserModuleAccess(user, 'leave')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Leave module', 403)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return apiError('VALIDATION_ERROR', 'Leave record ID is required', 400)
    }

    await db.$transaction(async (tx) => {
      const { count } = await tx.leaveRecord.updateMany({
        where: { id, userId: user.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })

      if (count === 0) {
        throw new Error('Leave record not found')
      }

      // Soft-delete corresponding activity logs for single-day and multi-day ranges scoped to user
      await tx.activityLog.updateMany({
        where: {
          userId: user.id,
          deletedAt: null,
          OR: [
            { leaveRecordId: id },
            { payload: { path: ['leaveRecordId'], equals: id } },
          ],
        },
        data: { deletedAt: new Date() },
      })
    })

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[MobileLeave DELETE] Internal error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to delete leave record'
    return apiError('INTERNAL_ERROR', msg, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await assertUserModuleAccess(user, 'leave')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Leave module', 403)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const parsed = updateLeaveAllowanceSchema.safeParse(body)
    if (!parsed.success) {
      return apiZodError(parsed.error)
    }

    const { leaveType, year, allowance } = parsed.data

    const updated = await db.leaveAllowance.upsert({
      where: {
        userId_year_leaveType: {
          userId: user.id,
          year,
          leaveType,
        },
      },
      update: { allowance },
      create: {
        userId: user.id,
        year,
        leaveType,
        allowance,
      },
    })

    return apiSuccess({ allowance: updated })
  } catch (error) {
    console.error('[MobileLeave PATCH] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to update leave allowance', 500)
  }
}
