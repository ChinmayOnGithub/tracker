"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireOwnership } from '@/lib/auth-guards'
import { LeaveType, LeaveStatus } from '@prisma/client'
import { ActivityService } from '@/lib/services/ActivityService'
import { createLeaveSchema, updateLeaveStatusSchema, updateLeaveAllowanceSchema } from '@/lib/validations'

/** Get leave allowances for a given year for the current user. */
export async function getLeaveAllowances(year: number) {
  try {
    const user = await requireAuth()
    const allowances = await db.leaveAllowance.findMany({
      where: { userId: user.id, year },
      orderBy: { leaveType: 'asc' },
    })
    return { success: true, allowances }
  } catch (error) {
    console.error('Failed to get leave allowances:', error)
    return { success: false, error: String(error), allowances: [] }
  }
}

/** Get all leave records for the current user (optionally filtered by year). */
export async function getLeaveRecords(year?: number) {
  try {
    const user = await requireAuth()

    const records = await db.leaveRecord.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        ...(year ? {
          startDate: {
            gte: new Date(`${year}-01-01`),
            lte: new Date(`${year}-12-31`),
          },
        } : {}),
      },
      orderBy: { startDate: 'desc' },
    })
    return { success: true, records }
  } catch (error) {
    console.error('Failed to get leave records:', error)
    return { success: false, error: String(error), records: [] }
  }
}

/** Create a new leave request (defaults to APPROVED for self-service). */
export async function createLeaveRequest(data: {
  leaveType: LeaveType
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  totalDays: number
  notes?: string
  status?: LeaveStatus
}) {
  const parsed = createLeaveSchema.safeParse(data)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    const user = await requireAuth()

    // Check for overlapping active leave in the same range
    const startUtc = new Date(`${data.startDate}T00:00:00.000Z`)
    const endUtc = new Date(`${data.endDate}T23:59:59.999Z`)

    const existingOverlap = await db.leaveRecord.findFirst({
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
      return {
        success: false,
        error: `Overlapping leave already exists for ${existingOverlap.leaveType} (${overlapStart} to ${overlapEnd}).`,
      }
    }

    const record = await db.leaveRecord.create({
      data: {
        userId: user.id,
        leaveType: data.leaveType,
        startDate: new Date(`${data.startDate}T00:00:00.000Z`),
        endDate: new Date(`${data.endDate}T00:00:00.000Z`),
        totalDays: data.totalDays,
        notes: data.notes ?? null,
        status: data.status ?? LeaveStatus.APPROVED,
      },
    })

    // Log this leave activity to ActivityLog for each date in the range
    const start = new Date(`${data.startDate}T12:00:00.000Z`)
    const end = new Date(`${data.endDate}T12:00:00.000Z`)
    const dates: string[] = []
    const curr = new Date(start)
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0])
      curr.setUTCDate(curr.getUTCDate() + 1)
    }

    const template = await ActivityService.getOrCreateDefaultTemplate(
      user.id,
      'LEAVE',
      'Time Off',
      'personal',
      'Calendar',
      'purple'
    )

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i]
      // Day 0 maintains the foreign key relation.
      // Days > 0 store the leaveRecordId in the payload JSON to satisfy the @unique constraint on leaveRecordId.
      await ActivityService.logActivity({
        userId: user.id,
        templateId: template.id,
        date: dateStr,
        status: 'done',
        leaveRecordId: i === 0 ? record.id : null,
        payload: {
          leaveRecordId: record.id,
          leaveType: data.leaveType,
          dayIndex: i,
          totalDays: data.totalDays,
        },
        note: data.notes ?? `Time Off: ${data.leaveType}`
      })
    }

    revalidatePath('/')
    return { success: true, record }
  } catch (error) {
    console.error('Failed to create leave request:', error)
    return { success: false, error: String(error) }
  }
}

/** Update the status of an existing leave record. */
export async function updateLeaveStatus(id: string, status: LeaveStatus) {
  const parsed = updateLeaveStatusSchema.safeParse({ id, status })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    await requireOwnership('leaveRecord', id)

    const updated = await db.leaveRecord.update({
      where: { id },
      data: { status },
    })

    if (status === LeaveStatus.REJECTED) {
      // Soft-delete corresponding logs across both 1:1 foreign key and multi-day payloads
      await db.activityLog.updateMany({
        where: {
          OR: [
            { leaveRecordId: id },
            { payload: { path: ['leaveRecordId'], equals: id } },
          ],
        },
        data: { deletedAt: new Date() }
      })
    } else if (status === LeaveStatus.APPROVED) {
      // Restore corresponding logs if they were soft-deleted
      await db.activityLog.updateMany({
        where: {
          OR: [
            { leaveRecordId: id },
            { payload: { path: ['leaveRecordId'], equals: id } },
          ],
        },
        data: { deletedAt: null }
      })
    }

    revalidatePath('/')
    return { success: true, record: updated }
  } catch (error) {
    console.error('Failed to update leave status:', error)
    return { success: false, error: String(error) }
  }
}

/** Soft-delete a leave record. */
export async function deleteLeaveRecord(id: string) {
  try {
    await requireOwnership('leaveRecord', id)

    await db.leaveRecord.update({ where: { id }, data: { deletedAt: new Date() } })
    
    // Soft-delete corresponding activity logs for single-day and multi-day ranges
    await db.activityLog.updateMany({
      where: {
        OR: [
          { leaveRecordId: id },
          { payload: { path: ['leaveRecordId'], equals: id } },
        ],
      },
      data: { deletedAt: new Date() }
    })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete leave record:', error)
    return { success: false, error: String(error) }
  }
}

/** Ensure allowance rows exist for a user for the given year (seed defaults if missing). */
export async function ensureLeaveAllowances(year: number) {
  try {
    const user = await requireAuth()
    const defaults: { leaveType: LeaveType; allowance: number }[] = [
      { leaveType: LeaveType.CASUAL, allowance: 12 },
      { leaveType: LeaveType.SICK, allowance: 8 },
      { leaveType: LeaveType.PTO, allowance: 15 },
      { leaveType: LeaveType.COMP_OFF, allowance: 0 },
      { leaveType: LeaveType.HALF_DAY, allowance: 0 },
      { leaveType: LeaveType.WFH, allowance: 0 },
    ]

    for (const d of defaults) {
      await db.leaveAllowance.upsert({
        where: { userId_year_leaveType: { userId: user.id, year, leaveType: d.leaveType } },
        create: { userId: user.id, year, leaveType: d.leaveType, allowance: d.allowance },
        update: {},
      })
    }
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to ensure leave allowances:', error)
    return { success: false, error: String(error) }
  }
}

/** Update an allowance amount for a specific leave type and year. */
export async function updateLeaveAllowance(leaveType: LeaveType, year: number, allowance: number) {
  const parsed = updateLeaveAllowanceSchema.safeParse({ leaveType, year, allowance })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: message }
  }

  try {
    const user = await requireAuth()
    const updated = await db.leaveAllowance.upsert({
      where: {
        userId_year_leaveType: {
          userId: user.id,
          year,
          leaveType,
        },
      },
      create: {
        userId: user.id,
        year,
        leaveType,
        allowance,
      },
      update: {
        allowance,
      },
    })
    revalidatePath('/')
    return { success: true, allowance: updated }
  } catch (error) {
    console.error('Failed to update leave allowance:', error)
    return { success: false, error: String(error) }
  }
}

/** Batch update multiple leave allowances for a year. */
export async function batchUpdateLeaveAllowances(year: number, updates: { leaveType: LeaveType; allowance: number }[]) {
  try {
    const user = await requireAuth()
    for (const u of updates) {
      await db.leaveAllowance.upsert({
        where: {
          userId_year_leaveType: {
            userId: user.id,
            year,
            leaveType: u.leaveType,
          },
        },
        create: {
          userId: user.id,
          year,
          leaveType: u.leaveType,
          allowance: u.allowance,
        },
        update: {
          allowance: u.allowance,
        },
      })
    }
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Failed to batch update leave allowances:', error)
    return { success: false, error: String(error) }
  }
}


