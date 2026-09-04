import { z } from 'zod'

export const upsertNoteSchema = z.object({
  id: z.string().optional(),
  date: z.string().optional(),
  content: z.string().min(0),
  title: z.string().max(250).nullable().optional(),
})

export type UpsertNoteInput = z.infer<typeof upsertNoteSchema>
