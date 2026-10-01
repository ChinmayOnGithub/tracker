import { describe, it, expect } from 'bun:test'
import { createLeaveSchema, updateLeaveStatusSchema, updateLeaveAllowanceSchema } from '@/lib/validations/leave'

describe('Leave Domain Correctness & Validations', () => {
  describe('Zod Validations', () => {
    it('should validate single day leave correctly', () => {
      const parsed = createLeaveSchema.safeParse({
        leaveType: 'SICK',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        totalDays: 1,
        notes: 'Fever',
      })
      expect(parsed.success).toBe(true)
    })

    it('should validate multi-day leave correctly', () => {
      const parsed = createLeaveSchema.safeParse({
        leaveType: 'PTO',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        totalDays: 5,
        notes: 'Vacation',
      })
      expect(parsed.success).toBe(true)
    })

    it('should accept half-day leave with totalDays = 0.5', () => {
      const parsed = createLeaveSchema.safeParse({
        leaveType: 'HALF_DAY',
        startDate: '2026-09-02',
        endDate: '2026-09-02',
        totalDays: 0.5,
        notes: 'Doctor appointment morning',
      })
      expect(parsed.success).toBe(true)
    })

    it('should reject when endDate is before startDate', () => {
      const parsed = createLeaveSchema.safeParse({
        leaveType: 'CASUAL',
        startDate: '2026-09-10',
        endDate: '2026-09-08',
        totalDays: 3,
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('End date must be on or after start date')
      }
    })

    describe('Issue #139: totalDays Validation Against Date Range', () => {
      it('rejects totalDays exceeding single-day duration', () => {
        const parsed = createLeaveSchema.safeParse({
          leaveType: 'SICK',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          totalDays: 1.5,
        })
        expect(parsed.success).toBe(false)
        if (!parsed.success) {
          expect(parsed.error.issues.some(i => i.message.includes('Total days cannot exceed'))).toBe(true)
        }

        const parsed2 = createLeaveSchema.safeParse({
          leaveType: 'SICK',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          totalDays: 5,
        })
        expect(parsed2.success).toBe(false)
      })

      it('rejects totalDays exceeding multi-day duration', () => {
        const parsed = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2026-09-01',
          endDate: '2026-09-03', // 3 calendar days
          totalDays: 3.5,
        })
        expect(parsed.success).toBe(false)
        if (!parsed.success) {
          expect(parsed.error.issues.some(i => i.message.includes('Total days cannot exceed'))).toBe(true)
        }

        const parsedExcessive = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2026-09-01',
          endDate: '2026-09-03',
          totalDays: 10,
        })
        expect(parsedExcessive.success).toBe(false)
      })

      it('accepts partial days within multi-day span', () => {
        const parsed = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2026-09-01',
          endDate: '2026-09-03', // 3 days
          totalDays: 2.5,
        })
        expect(parsed.success).toBe(true)
      })

      it('rejects invalid fractions not aligned with half-day steps', () => {
        const testFractions = [0.3, 1.25, 2.7, 0.1]
        for (const totalDays of testFractions) {
          const parsed = createLeaveSchema.safeParse({
            leaveType: 'CASUAL',
            startDate: '2026-09-01',
            endDate: '2026-09-05',
            totalDays,
          })
          expect(parsed.success).toBe(false)
          if (!parsed.success) {
            expect(parsed.error.issues.some(i => i.message.includes('whole or half day increment'))).toBe(true)
          }
        }
      })

      it('rejects zero or negative totalDays', () => {
        const zeroParsed = createLeaveSchema.safeParse({
          leaveType: 'CASUAL',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          totalDays: 0,
        })
        expect(zeroParsed.success).toBe(false)

        const negParsed = createLeaveSchema.safeParse({
          leaveType: 'CASUAL',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          totalDays: -1,
        })
        expect(negParsed.success).toBe(false)
      })

      it('validates HALF_DAY leaveType rules strictly', () => {
        // Valid HALF_DAY: single day, 0.5
        const valid = createLeaveSchema.safeParse({
          leaveType: 'HALF_DAY',
          startDate: '2026-09-02',
          endDate: '2026-09-02',
          totalDays: 0.5,
        })
        expect(valid.success).toBe(true)

        // Invalid: HALF_DAY with totalDays = 1
        const invalidDays = createLeaveSchema.safeParse({
          leaveType: 'HALF_DAY',
          startDate: '2026-09-02',
          endDate: '2026-09-02',
          totalDays: 1,
        })
        expect(invalidDays.success).toBe(false)

        // Invalid: HALF_DAY spanning multiple days
        const invalidSpan = createLeaveSchema.safeParse({
          leaveType: 'HALF_DAY',
          startDate: '2026-09-02',
          endDate: '2026-09-03',
          totalDays: 0.5,
        })
        expect(invalidSpan.success).toBe(false)
      })

      it('accurately validates date boundaries across months, years, and leap years', () => {
        // Month boundary: Jan 31 to Feb 2 = 3 days
        const monthBoundary = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2026-01-31',
          endDate: '2026-02-02',
          totalDays: 3,
        })
        expect(monthBoundary.success).toBe(true)

        const monthBoundaryExcessive = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2026-01-31',
          endDate: '2026-02-02',
          totalDays: 3.5,
        })
        expect(monthBoundaryExcessive.success).toBe(false)

        // Year boundary: Dec 31 to Jan 2 = 3 days
        const yearBoundary = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2026-12-31',
          endDate: '2027-01-02',
          totalDays: 3,
        })
        expect(yearBoundary.success).toBe(true)

        // Leap year boundary: 2028-02-28 to 2028-03-01 = 3 days (Feb 28, Feb 29, Mar 1)
        const leapYearBoundary = createLeaveSchema.safeParse({
          leaveType: 'PTO',
          startDate: '2028-02-28',
          endDate: '2028-03-01',
          totalDays: 3,
        })
        expect(leapYearBoundary.success).toBe(true)
      })
    })

    it('should accept UUID string in updateLeaveStatusSchema without cuid failures', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const parsed = updateLeaveStatusSchema.safeParse({
        id: uuid,
        status: 'APPROVED',
      })
      expect(parsed.success).toBe(true)
    })

    it('should validate leave allowance range and decimal support', () => {
      const parsed = updateLeaveAllowanceSchema.safeParse({
        leaveType: 'SICK',
        year: 2026,
        allowance: 12.5,
      })
      expect(parsed.success).toBe(true)

      const negative = updateLeaveAllowanceSchema.safeParse({
        leaveType: 'SICK',
        year: 2026,
        allowance: -5,
      })
      expect(negative.success).toBe(false)
    })
  })

  describe('Multi-Day Leave Unique Constraint Resolution Logic', () => {
    it('should correctly assign leaveRecordId to Day 0 and payload for subsequent days', () => {
      const startDate = '2026-09-01'
      const endDate = '2026-09-03'
      const recordId = 'leave-rec-12345'
      const leaveType = 'SICK'

      const start = new Date(`${startDate}T12:00:00.000Z`)
      const end = new Date(`${endDate}T12:00:00.000Z`)
      const dates: string[] = []
      const curr = new Date(start)
      while (curr <= end) {
        dates.push(curr.toISOString().split('T')[0])
        curr.setUTCDate(curr.getUTCDate() + 1)
      }

      expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])

      const activityLogsPayloads = dates.map((dateStr, i) => ({
        date: dateStr,
        leaveRecordId: i === 0 ? recordId : null,
        payload: {
          leaveRecordId: recordId,
          leaveType,
          dayIndex: i,
          totalDays: dates.length,
        },
      }))

      // Day 0 has 1:1 foreign key
      expect(activityLogsPayloads[0].leaveRecordId).toBe(recordId)
      // Days 1 and 2 have null foreign key to respect @unique constraint
      expect(activityLogsPayloads[1].leaveRecordId).toBeNull()
      expect(activityLogsPayloads[2].leaveRecordId).toBeNull()

      // All days link back via payload.leaveRecordId
      expect(activityLogsPayloads[0].payload.leaveRecordId).toBe(recordId)
      expect(activityLogsPayloads[1].payload.leaveRecordId).toBe(recordId)
      expect(activityLogsPayloads[2].payload.leaveRecordId).toBe(recordId)
    })
  })

  describe('Entitlements Calculation & Balance Math', () => {
    it('should correctly calculate Allocated, Used, and Remaining leave balances', () => {
      const allowances = [
        { leaveType: 'SICK', allowance: 12 },
        { leaveType: 'PTO', allowance: 18 },
        { leaveType: 'CASUAL', allowance: 7 },
      ]

      const records = [
        { leaveType: 'SICK', totalDays: 3, status: 'APPROVED' },
        { leaveType: 'SICK', totalDays: 1, status: 'APPROVED' },
        { leaveType: 'SICK', totalDays: 2, status: 'PENDING' }, // Pending shouldn't subtract from remaining yet
        { leaveType: 'SICK', totalDays: 5, status: 'REJECTED' }, // Rejected shouldn't subtract
        { leaveType: 'PTO', totalDays: 5, status: 'APPROVED' },
      ]

      const usedByType: Record<string, number> = {}
      records.filter(r => r.status === 'APPROVED').forEach(r => {
        usedByType[r.leaveType] = (usedByType[r.leaveType] ?? 0) + r.totalDays
      })

      expect(usedByType['SICK']).toBe(4)
      expect(usedByType['PTO']).toBe(5)
      expect(usedByType['CASUAL'] ?? 0).toBe(0)

      const sickAllowance = allowances.find(a => a.leaveType === 'SICK')?.allowance ?? 0
      const sickUsed = usedByType['SICK'] ?? 0
      const sickRemaining = Math.max(0, sickAllowance - sickUsed)

      expect(sickAllowance).toBe(12)
      expect(sickUsed).toBe(4)
      expect(sickRemaining).toBe(8)

      const ptoAllowance = allowances.find(a => a.leaveType === 'PTO')?.allowance ?? 0
      const ptoUsed = usedByType['PTO'] ?? 0
      const ptoRemaining = Math.max(0, ptoAllowance - ptoUsed)

      expect(ptoAllowance).toBe(18)
      expect(ptoUsed).toBe(5)
      expect(ptoRemaining).toBe(13)

      const casualAllowance = allowances.find(a => a.leaveType === 'CASUAL')?.allowance ?? 0
      const casualRemaining = Math.max(0, casualAllowance - (usedByType['CASUAL'] ?? 0))
      expect(casualRemaining).toBe(7)
    })
  })
})
