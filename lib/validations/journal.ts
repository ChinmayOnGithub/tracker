import { z } from 'zod'

export const upsertJournalSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  content: z.string().optional(),
  mood: z.string().max(50).nullable().optional(),
  gratitude: z.string().max(2000).nullable().optional(),
  reflections: z.string().max(2000).nullable().optional(),
  lessonsLearned: z.string().max(2000).nullable().optional(),
  tomorrowPlan: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

export type UpsertJournalInput = z.infer<typeof upsertJournalSchema>
