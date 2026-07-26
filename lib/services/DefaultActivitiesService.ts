import { Prisma } from '@prisma/client'

export class DefaultActivitiesService {
  /**
   * Seeds default templates for a new user.
   * Can run within a Prisma transaction.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async seedDefaultActivities(userId: string, tx: any) {
    const templates = [
      {
        userId,
        name: 'Write Daily Journal',
        category: 'personal',
        icon: 'BookOpen',
        color: 'amber',
        recurrenceType: 'daily' as const,
        type: 'JOURNAL' as const,
        sortOrder: 1,
        notes: 'Write at least 3 bullet points about the day',
        metadata: {},
      },
      {
        userId,
        name: 'Log Weight',
        category: 'health',
        icon: 'Scale',
        color: 'blue',
        recurrenceType: 'daily' as const,
        type: 'PERSONAL' as const,
        sortOrder: 2,
        notes: 'Track daily weight fluctuations',
        metadata: {
          completion: {
            method: 'VALUE',
            hook: 'weight',
            value: {
              label: 'Weight',
              unit: 'kg',
              required: true,
              inputType: 'number',
              minimum: 0,
              maximum: 500,
            },
          },
        },
      },
      {
        userId,
        name: 'Fuel Refill',
        category: 'finance',
        icon: 'Fuel',
        color: 'orange',
        recurrenceType: 'one_time' as const,
        type: 'CUSTOM' as const,
        sortOrder: 3,
        notes: 'Log fuel liters on fill-up',
        metadata: {
          completion: {
            method: 'VALUE',
            hook: 'none',
            value: {
              label: 'Fuel Amount',
              unit: 'L',
              required: true,
              inputType: 'number',
              minimum: 0,
              maximum: 1000,
            },
          },
        },
      },
      {
        userId,
        name: 'Water Intake',
        category: 'health',
        icon: 'Droplet',
        color: 'blue',
        recurrenceType: 'daily' as const,
        type: 'PERSONAL' as const,
        sortOrder: 4,
        notes: 'Drink water to stay hydrated',
        metadata: {
          completion: {
            method: 'VALUE',
            hook: 'none',
            value: {
              label: 'Water Amount',
              unit: 'ml',
              required: true,
              inputType: 'number',
              minimum: 0,
              maximum: 10000,
            },
          },
        },
      },
      {
        userId,
        name: 'Reading Book',
        category: 'personal',
        icon: 'BookOpen',
        color: 'green',
        recurrenceType: 'daily' as const,
        type: 'PERSONAL' as const,
        sortOrder: 5,
        notes: 'Read at least 15 pages',
        metadata: {},
      },
      {
        userId,
        name: 'Exercise Session',
        category: 'fitness',
        icon: 'Dumbbell',
        color: 'blue',
        recurrenceType: 'daily' as const,
        type: 'WORKOUT' as const,
        sortOrder: 6,
        notes: 'Workout, cardio, or yoga',
        metadata: {},
      },
      {
        userId,
        name: 'Brush Teeth',
        category: 'personal',
        icon: 'Sparkles',
        color: 'zinc',
        recurrenceType: 'daily' as const,
        type: 'PERSONAL' as const,
        sortOrder: 7,
        metadata: {},
      },
    ]

    for (const t of templates) {
      await tx.activityTemplate.create({
        data: {
          userId: t.userId,
          name: t.name,
          category: t.category,
          icon: t.icon,
          color: t.color,
          recurrenceType: t.recurrenceType,
          type: t.type,
          sortOrder: t.sortOrder,
          notes: t.notes || null,
          metadata: t.metadata as Prisma.InputJsonValue,
        },
      })
    }
  }
}
