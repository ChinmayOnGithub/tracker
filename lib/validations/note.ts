import { z } from 'zod'

export const upsertNoteSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  content: z.string().min(1, 'Note content cannot be empty'),
  title: z.string().max(200).nullable().optional(),
})

export type UpsertNoteInput = z.infer<typeof upsertNoteSchema>
