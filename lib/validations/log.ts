import { z } from 'zod'

export const createLogSchema = z.object({
  id: z.string().optional(),
  activityId: z.string().min(1, 'activityId is required'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  status: z.string().min(1, 'Status is required'),
  note: z.string().max(2000).nullable().optional(),
  amount: z.number().nullable().optional(),
  payload: z.unknown().optional(),
})

export const updateLogSchema = z.object({
  status: z.string().min(1, 'Status cannot be empty').optional(),
  note: z.string().max(2000).nullable().optional(),
  amount: z.number().nullable().optional(),
  payload: z.unknown().optional(),
})

export const queryLogsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be formatted as YYYY-MM-DD')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be formatted as YYYY-MM-DD')
    .optional(),
})

export type CreateLogInput = z.infer<typeof createLogSchema>
export type UpdateLogInput = z.infer<typeof updateLogSchema>
export type QueryLogsInput = z.infer<typeof queryLogsSchema>
