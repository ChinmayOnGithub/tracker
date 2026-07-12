"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getLoggedUser } from './auth'
import { LeaveType, LeaveStatus } from '@prisma/client'
import { ActivityService } from '@/lib/services/ActivityService'

async function getAuthSession() {
  const user = await getLoggedUser()
  if (!user) throw new Error('Authentication required')
  return user
}

/** Get leave allowances for a given year for the current user. */
export async function getLeaveAllowances(year: number) {
  try {
    const user = await getAuthSession()
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
    const user = await getAuthSession()

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
  try {
    const user = await getAuthSession()
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
      curr.setDate(curr.getDate() + 1)
    }

    const template = await ActivityService.getOrCreateDefaultTemplate(
      user.id,
      'LEAVE',
      'Time Off',
      'personal',
      'Calendar',
      'purple'
    )

    for (const dateStr of dates) {
      await ActivityService.logActivity({
        userId: user.id,
        templateId: template.id,
        date: dateStr,
        status: 'done',
        leaveRecordId: record.id,
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
  try {
    const user = await getAuthSession()
    const record = await db.leaveRecord.findUnique({ where: { id } })
    if (!record || record.userId !== user.id) throw new Error('Unauthorized')

    const updated = await db.leaveRecord.update({
      where: { id },
      data: { status },
    })
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
    const user = await getAuthSession()
    const record = await db.leaveRecord.findUnique({ where: { id } })
    if (!record || record.userId !== user.id) throw new Error('Unauthorized')

    await db.leaveRecord.update({ where: { id }, data: { deletedAt: new Date() } })
    
    // Soft-delete corresponding activity logs
    await db.activityLog.updateMany({
      where: { leaveRecordId: id },
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
    const user = await getAuthSession()
    const defaults: { leaveType: LeaveType; allowance: number }[] = [
      { leaveType: LeaveType.CASUAL, allowance: 12 },
      { leaveType: LeaveType.SICK, allowance: 8 },
      { leaveType: LeaveType.PTO, allowance: 15 },
      { leaveType: LeaveType.COMP_OFF, allowance: 0 },
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
  try {
    const user = await getAuthSession()
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

