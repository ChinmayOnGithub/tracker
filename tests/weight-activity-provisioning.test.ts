import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { logWeight } from '@/app/actions/weight'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { db } from '@/lib/db'
import { ActivityTemplate, WeightRecord } from '@prisma/client'

function createMockTemplate(overrides: Partial<ActivityTemplate> & { id: string; userId: string; name: string }): ActivityTemplate {
  return {
    id: overrides.id,
    userId: overrides.userId,
    name: overrides.name,
    category: overrides.category ?? 'general',
    type: overrides.type ?? 'PERSONAL',
    priority: overrides.priority ?? 'NORMAL',
    estimatedDuration: 0,
    scheduledTime: null,
    energyRequired: 'MEDIUM',
    calendarProvider: 'NONE',
    calendarEventId: null,
    notificationRules: null,
    icon: overrides.icon ?? 'star',
    color: overrides.color ?? 'blue',
    isActive: overrides.isActive ?? true,
    notes: null,
    amount: null,
    sortOrder: overrides.sortOrder ?? 0,
    recurrenceType: overrides.recurrenceType ?? 'daily',
    recurrenceInterval: null,
    recurrenceDaysOfWeek: null,
    recurrenceDayOfMonth: null,
    recurrenceMonth: null,
    targetDate: null,
    remindBeforeDays: null,
    metadata: null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    deletedAt: overrides.deletedAt ?? null,
    effectiveFrom: overrides.effectiveFrom ?? new Date(),
    version: overrides.version ?? 1,
  }
}

describe('Weight Feature-Backed Activity Provisioning Suite (#195, #Blocker-E)', () => {
  const userId = 'usr_weight_tester'

  let templates: ActivityTemplate[]
  let weightRecords: WeightRecord[]
  let activeQuotaLimit: number

  const origTransaction = db.$transaction
  const origFindFirst = db.activityTemplate.findFirst
  const origCount = db.activityTemplate.count
  const origRequireModule = AuthorizationService.requireModuleAccess
  const origGetLimit = EntitlementService.getLimit

  afterEach(() => {
    db.$transaction = origTransaction
    db.activityTemplate.findFirst = origFindFirst
    db.activityTemplate.count = origCount
    AuthorizationService.requireModuleAccess = origRequireModule
    EntitlementService.getLimit = origGetLimit
  })

  beforeEach(() => {
    templates = []
    weightRecords = []
    activeQuotaLimit = 10

    AuthorizationService.requireModuleAccess = mock(() =>
      Promise.resolve({
        id: userId,
        username: 'weightuser',
        email: 'w@example.com',
        isOwner: true,
        accessLevel: 'OWNER',
        isPro: false, // Free plan user!
      })
    )

    EntitlementService.getLimit = mock(async () => activeQuotaLimit)

    db.activityTemplate.findFirst = mock(async ({ where }: { where: { userId: string; name: string; deletedAt?: unknown } }) => {
      if (where.deletedAt === null) {
        return templates.find((t) => t.userId === where.userId && t.name === where.name && t.deletedAt === null) || null
      }
      if (where.deletedAt && typeof where.deletedAt === 'object' && 'not' in (where.deletedAt as Record<string, unknown>)) {
        return templates.find((t) => t.userId === where.userId && t.name === where.name && t.deletedAt !== null) || null
      }
      return templates.find((t) => t.userId === where.userId && t.name === where.name) || null
    }) as unknown as typeof db.activityTemplate.findFirst

    db.activityTemplate.count = mock(async ({ where }: { where: { userId: string; deletedAt: null; isActive: boolean } }) => {
      return templates.filter((t) => t.userId === where.userId && t.deletedAt === null && t.isActive).length
    }) as unknown as typeof db.activityTemplate.count

    db.$transaction = (async <T>(cb: (tx: typeof db) => Promise<T>): Promise<T> => {
      const fakeTx = {
        $executeRaw: async () => 1,
        activityTemplate: {
          findFirst: db.activityTemplate.findFirst,
          count: db.activityTemplate.count,
          create: async ({ data }: { data: Partial<ActivityTemplate> }) => {
            const created = createMockTemplate({
              id: `tmpl_${Date.now()}_${Math.random()}`,
              userId,
              name: data.name || 'Log Weight',
              type: data.type || 'PERSONAL',
              category: data.category || 'health',
              icon: data.icon || 'Scale',
              color: data.color || 'blue',
              sortOrder: data.sortOrder || 1,
              recurrenceType: data.recurrenceType || 'daily',
              isActive: true,
              deletedAt: null,
            })
            templates.push(created)
            return created
          },
          update: async ({ where, data }: { where: { id: string }; data: Partial<ActivityTemplate> }) => {
            const found = templates.find((t) => t.id === where.id)
            if (!found) throw new Error('Template not found')
            Object.assign(found, data, { updatedAt: new Date() })
            return found
          },
        },
        weightRecord: {
          findFirst: async ({ where }: { where: { userId: string; deletedAt: null } }) => {
            return weightRecords.find((r) => r.userId === where.userId && r.deletedAt === null) || null
          },
          findUnique: async ({ where }: { where: { id: string } }) => {
            return weightRecords.find((r) => r.id === where.id) || null
          },
          create: async ({ data }: { data: Partial<WeightRecord> }) => {
            const created = {
              id: `wr_${Date.now()}`,
              userId,
              date: data.date || new Date(),
              weight: data.weight || 70,
              notes: data.notes || null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            } as WeightRecord
            weightRecords.push(created)
            return created
          },
          updateMany: async ({ where, data }: { where: { id: string }; data: Partial<WeightRecord> }) => {
            const found = weightRecords.find((r) => r.id === where.id)
            if (found) Object.assign(found, data)
            return { count: found ? 1 : 0 }
          },
        },
        activityLog: {
          findFirst: async () => null,
          findUnique: async () => null,
          create: async () => ({ id: 'log_mock' }),
          update: async () => ({ id: 'log_mock' }),
        },
      } as unknown as typeof db

      return await cb(fakeTx)
    }) as unknown as typeof db.$transaction
  })

  it('logs weight normally without prompting when Log Weight activity already exists', async () => {
    // Active template exists
    templates.push(createMockTemplate({
      id: 'tmpl_weight_existing',
      userId,
      name: 'Log Weight',
      category: 'health',
      icon: 'Scale',
      color: 'blue',
      sortOrder: 1,
    }))

    const res = await logWeight('2026-10-01', 72.5, 'Morning weight')

    expect(res.success).toBe(true)
    if ('record' in res && res.record) {
      expect(res.record.weight).toBe(72.5)
    } else {
      throw new Error('Expected record in response')
    }
    // No new template was created
    expect(templates.length).toBe(1)
  })

  it('returns FEATURE_ACTIVITY_CONSENT_REQUIRED when activity is missing and consent is false', async () => {
    const res = await logWeight('2026-10-01', 72.5, null, false)

    expect(res.success).toBe(false)
    expect(res.code).toBe('FEATURE_ACTIVITY_CONSENT_REQUIRED')
    expect(res.requiresConsent).toBe(true)
    // No mutations performed
    expect(weightRecords.length).toBe(0)
    expect(templates.length).toBe(0)
  })

  it('returns ACTIVITY_LIMIT_REACHED when consent is provided but quota limit is full', async () => {
    activeQuotaLimit = 3
    // Fill up quota with 3 other activities
    for (let i = 1; i <= 3; i++) {
      templates.push(createMockTemplate({
        id: `tmpl_${i}`,
        userId,
        name: `Activity ${i}`,
        category: 'health',
        icon: 'star',
        color: 'blue',
        sortOrder: i,
      }))
    }

    const res = await logWeight('2026-10-01', 72.5, null, { consentToCreateActivity: true })

    expect(res.success).toBe(false)
    expect(res.code).toBe('ACTIVITY_LIMIT_REACHED')
    if ('limit' in res && 'current' in res) {
      expect(res.limit).toBe(3)
      expect(res.current).toBe(3)
    } else {
      throw new Error('Expected limit and current in response')
    }
    // No mutation
    expect(weightRecords.length).toBe(0)
    expect(templates.length).toBe(3)
  })

  it('provisions activity and logs weight atomically when consent is provided and quota has space', async () => {
    activeQuotaLimit = 10

    const res = await logWeight('2026-10-01', 74.0, 'First log', { consentToCreateActivity: true })

    expect(res.success).toBe(true)
    if ('record' in res && res.record) {
      expect(res.record.weight).toBe(74.0)
    } else {
      throw new Error('Expected record in response')
    }
    expect(templates.length).toBe(1)
    expect(templates[0].name).toBe('Log Weight')
    expect(templates[0].deletedAt).toBeNull()
  })

  it('restores soft-deleted Log Weight activity rather than creating a duplicate', async () => {
    templates.push(createMockTemplate({
      id: 'tmpl_weight_soft_deleted',
      userId,
      name: 'Log Weight',
      category: 'health',
      icon: 'Scale',
      color: 'blue',
      sortOrder: 1,
      deletedAt: new Date(Date.now() - 86400000), // Deleted yesterday
    }))

    const res = await logWeight('2026-10-01', 71.8, 'Restored log', { consentToCreateActivity: true })

    expect(res.success).toBe(true)
    // Still 1 template, but restored
    expect(templates.length).toBe(1)
    expect(templates[0].id).toBe('tmpl_weight_soft_deleted')
    expect(templates[0].deletedAt).toBeNull()
  })
})
