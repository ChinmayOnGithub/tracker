import { z } from 'zod'

export const logWeightSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  weight: z
    .number({ invalid_type_error: 'Weight must be a number' })
    .min(20, 'Weight must be at least 20 kg')
    .max(500, 'Weight must be at most 500 kg'),
  notes: z.string().max(500, 'Notes must be 500 characters or fewer').nullable().optional(),
})

export type LogWeightInput = z.infer<typeof logWeightSchema>
