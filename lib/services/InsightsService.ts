import { db } from '../db'
import { getTodayDateStr, diffUTCDays } from '../recurrence'
import { LeaveType } from '@prisma/client'

export class InsightsService {
  /**
   * Calculates completion streak for a given template.
   */
  static async getStreak(userId: string, templateId: string): Promise<number> {
    const logs = await db.activityLog.findMany({
      where: { userId, activityId: templateId, status: 'done', deletedAt: null },
      orderBy: { logDate: 'desc' }
    })

    if (logs.length === 0) return 0

    const todayStr = getTodayDateStr()
    const lastLogDateStr = logs[0].logDate.toISOString().split('T')[0]
    const daysSinceLast = diffUTCDays(todayStr, lastLogDateStr)

    // Streak broken if last completed was before yesterday
    if (daysSinceLast > 1) return 0

    let streak = 1
    for (let i = 1; i < logs.length; i++) {
      const prevDateStr = logs[i - 1].logDate.toISOString().split('T')[0]
      const currDateStr = logs[i].logDate.toISOString().split('T')[0]
      const gap = diffUTCDays(prevDateStr, currDateStr)

      if (gap === 1) {
        streak++
      } else if (gap > 1) {
        break
      }
    }

    return streak
  }

  /**
   * Aggregates weight history analytics.
   */
  static async getWeightTrends(userId: string, days = 90) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const records = await db.weightRecord.findMany({
      where: { userId, deletedAt: null, date: { gte: cutoff } },
      orderBy: { date: 'asc' }
    })

    if (records.length === 0) {
      return { current: 0, lowest: 0, highest: 0, average: 0, history: [] }
    }

    const weights = records.map(r => r.weight)
    const current = weights[weights.length - 1]
    const lowest = Math.min(...weights)
    const highest = Math.max(...weights)
    const average = parseFloat((weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1))

    return {
      current,
      lowest,
      highest,
      average,
      history: records
    }
  }

  /**
   * Computes leave allowances and remaining balances for a given year.
   */
  static async getLeaveAllowancesUsage(userId: string, year: number) {
    const [allowances, records] = await Promise.all([
      db.leaveAllowance.findMany({ where: { userId, year } }),
      db.leaveRecord.findMany({
        where: { userId, status: 'APPROVED', deletedAt: null, startDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } }
      })
    ])

    const usage: Record<LeaveType, number> = {
      CASUAL: 0,
      SICK: 0,
      PTO: 0,
      COMP_OFF: 0,
      HALF_DAY: 0,
      WFH: 0
    }

    for (const record of records) {
      usage[record.leaveType] += record.totalDays
    }

    return allowances.map(allowance => {
      const used = usage[allowance.leaveType] || 0
      const remaining = Math.max(0, allowance.allowance - used)
      return {
        leaveType: allowance.leaveType,
        allowance: allowance.allowance,
        used,
        remaining
      }
    })
  }
}
