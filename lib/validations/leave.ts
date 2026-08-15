import { z } from 'zod'

const LEAVE_TYPES = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF', 'HALF_DAY', 'WFH'] as const
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

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
      .int('Total days must be a whole number')
      .min(1, 'Must be at least 1 day'),
    notes: z.string().max(1000, 'Notes must be 1000 characters or fewer').optional(),
    status: z.enum(LEAVE_STATUSES).optional(),
  })
  .refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    { message: 'End date must be on or after start date', path: ['endDate'] }
  )

export const updateLeaveStatusSchema = z.object({
  id: z.string().cuid('Invalid leave record ID'),
  status: z.enum(LEAVE_STATUSES, {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
})

export const updateLeaveAllowanceSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  year: z.number().int().min(2000).max(2100),
  allowance: z
    .number({ invalid_type_error: 'Allowance must be a number' })
    .int('Allowance must be a whole number')
    .min(0, 'Allowance cannot be negative')
    .max(365, 'Allowance cannot exceed 365 days'),
})

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>
export type UpdateLeaveStatusInput = z.infer<typeof updateLeaveStatusSchema>
export type UpdateLeaveAllowanceInput = z.infer<typeof updateLeaveAllowanceSchema>
