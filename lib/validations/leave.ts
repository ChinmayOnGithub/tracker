import { z } from 'zod'

export const LEAVE_TYPES = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF', 'HALF_DAY', 'WFH'] as const
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

export function calculateInclusiveDays(startDateStr: string, endDateStr: string): number {
  const [sy, sm, sd] = startDateStr.split('-').map(Number)
  const [ey, em, ed] = endDateStr.split('-').map(Number)
  const startUtc = Date.UTC(sy, sm - 1, sd)
  const endUtc = Date.UTC(ey, em - 1, ed)
  if (isNaN(startUtc) || isNaN(endUtc)) return 0
  const diffDays = Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000))
  return diffDays + 1
}

export const createLeaveSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES, {
      errorMap: () => ({ message: 'Invalid leave type' }),
    }),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
    totalDays: z
      .number({ invalid_type_error: 'Total days must be a number' })
      .min(0.5, 'Must be at least 0.5 days'),
    notes: z.string().max(1000, 'Notes must be 1000 characters or fewer').optional(),
    status: z.enum(LEAVE_STATUSES).optional(),
  })
  .refine(
    (data) => calculateInclusiveDays(data.startDate, data.endDate) >= 1,
    { message: 'End date must be on or after start date', path: ['endDate'] }
  )
  .refine(
    (data) => (data.totalDays * 2) % 1 === 0,
    { message: 'Total days must be a whole or half day increment (e.g. 0.5, 1, 1.5)', path: ['totalDays'] }
  )
  .refine(
    (data) => {
      if (data.leaveType === 'HALF_DAY') {
        return data.startDate === data.endDate && data.totalDays === 0.5
      }
      return true
    },
    { message: 'HALF_DAY leave must be on a single date with totalDays = 0.5', path: ['totalDays'] }
  )
  .refine(
    (data) => {
      const span = calculateInclusiveDays(data.startDate, data.endDate)
      if (span < 1) return true
      return data.totalDays <= span
    },
    { message: 'Total days cannot exceed the date range duration', path: ['totalDays'] }
  )

export const updateLeaveStatusSchema = z.object({
  id: z.string().min(1, 'Invalid leave record ID'),
  status: z.enum(LEAVE_STATUSES, {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
})

export const updateLeaveAllowanceSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  year: z.number().int().min(2000).max(2100),
  allowance: z
    .number({ invalid_type_error: 'Allowance must be a number' })
    .min(0, 'Allowance cannot be negative')
    .max(365, 'Allowance cannot exceed 365 days'),
})

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>
export type UpdateLeaveStatusInput = z.infer<typeof updateLeaveStatusSchema>
export type UpdateLeaveAllowanceInput = z.infer<typeof updateLeaveAllowanceSchema>
