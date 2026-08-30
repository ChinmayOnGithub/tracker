import { z } from 'zod'

const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly', 'yearly', 'custom', 'milestone', 'one_time'] as const
const ACTIVITY_TYPES = ['PERSONAL', 'WORKOUT', 'MEETING', 'BILL', 'MEDICINE', 'LEAVE', 'JOURNAL', 'LEARNING', 'REMINDER', 'TASK', 'CUSTOM'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'NORMAL', 'HIGH', 'CRITICAL'] as const
const CALENDAR_PROVIDERS = ['NONE', 'GOOGLE', 'OUTLOOK', 'APPLE'] as const
const COMPLETION_METHODS = ['CHECKBOX', 'VALUE', 'FORM'] as const

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, 'Activity name is required')
    .max(200, 'Activity name must be 200 characters or fewer')
    .trim(),
  category: z.string().min(1, 'Category is required'),
  type: z.enum(ACTIVITY_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  estimatedDuration: z.number().int().min(0).optional(),
  energyRequired: z.string().optional(),
  calendarProvider: z.enum(CALENDAR_PROVIDERS).optional(),
  calendarEventId: z.string().nullable().optional(),
  notificationRules: z.unknown().optional(),
  icon: z.string().min(1, 'Icon is required'),
  color: z.string().min(1, 'Color is required'),
  notes: z.string().max(2000).nullable().optional(),
  amount: z.number().nullable().optional(),
  recurrenceType: z.enum(RECURRENCE_TYPES),
  recurrenceInterval: z.number().int().nullable().optional(),
  recurrenceDaysOfWeek: z.string().nullable().optional(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  recurrenceMonth: z.number().int().min(1).max(12).nullable().optional(),
  targetDate: z.string().nullable().optional(),
  remindBeforeDays: z.number().int().nullable().optional(),
  tagNames: z.array(z.string().trim()).optional(),
  metadata: z.unknown().optional(),
  scheduledTime: z.string().nullable().optional(),
})

export const updateTemplateSchema = createTemplateSchema.partial()

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>

// ── Form-level schema for React Hook Form (stricter, user-facing messages) ──

export const templateFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Please specify an activity name')
    .max(200, 'Name must be 200 characters or fewer')
    .trim(),
  category: z.string().min(1, 'Category is required'),
  icon: z.string().min(1),
  color: z.string().min(1),
  recurrenceType: z.enum(RECURRENCE_TYPES),
  selectedWeekdays: z.array(z.number().int().min(0).max(6)),
  recurrenceDayOfMonth: z.string(),
  targetDate: z.string(),
  isAllDay: z.boolean(),
  startTime: z.string(),
  completionMethod: z.enum(COMPLETION_METHODS),
  completionHook: z.string(),
  valueLabel: z.string().max(100),
  valueInputType: z.string(),
  valueUnit: z.string().max(20),
  valueRequired: z.boolean(),
  valueMinimum: z.string(),
  valueMaximum: z.string(),
  priority: z.enum(PRIORITIES),
  type: z.enum(ACTIVITY_TYPES),
  notes: z.string().max(2000),
  location: z.string().max(500),
  amount: z.string(),
  tagsInput: z.string(),
  estimatedDuration: z.string(),
  calendarProvider: z.enum(CALENDAR_PROVIDERS),
  hasReminder: z.boolean(),
})

export type TemplateFormValues = z.infer<typeof templateFormSchema>

// ── Canonical Task Form Schema for TaskCreateDialog (Create & Edit) ──

export const taskCreateSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .min(1, 'Task title is required')
    .max(200, 'Title must be 200 characters or fewer')
    .trim(),
  category: z.string().default('general'),
  icon: z.string().default('CheckSquare'),
  color: z.string().default('blue'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  type: z.enum(ACTIVITY_TYPES).default('TASK'),
  isAllDay: z.boolean().default(true),
  targetDate: z.string().min(1, 'Target date is required'),
  startTime: z.string().optional(),
  estimatedDuration: z.string().optional(),
  notes: z.string().max(2000).optional(),
  amount: z.string().optional(),
})

export type TaskCreateFormValues = z.infer<typeof taskCreateSchema>

