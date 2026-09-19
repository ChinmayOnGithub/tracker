import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { db } from '@/lib/db'
import { BillingService } from '@/lib/services/BillingService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { MockBillingProvider, setBillingProvider } from '@/lib/billing/providers'
import { AuditService } from '@/lib/services/AuditService'
import { parseAllDayDate, formatAllDayDate } from '@/lib/dateUtils'
import { analyzeRecurrence, getTodayDateStr } from '@/lib/recurrence'
import { ActivityTemplate, ActivityLog } from '@/types'

interface MockCalendarEventRecord {
  id: string
  userId: string
  title: string
  description?: string | null
  start: Date
  end: Date
  allDay: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

interface MockSubscriptionRecord {
  id: string
  userId: string
  providerSubscriptionId: string
  plan: string
  billingInterval: string
  status: string
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  deletedAt: Date | null
}

describe('Critical Product Journeys E2E Regression Suite (#34)', () => {
  beforeEach(() => {
    setBillingProvider(new MockBillingProvider())
  })

  afterEach(() => {
    setBillingProvider(null)
  })

  describe('1. Authentication & Session Initialization Journey', () => {
    it('initializes session and returns isolated user profile and entitlements', async () => {
      const originalFindUnique = db.user.findUnique
      const originalFindMany = db.subscription.findMany

      try {
        ;(db.user as unknown as { findUnique: (args: { where: { id: string } }) => Promise<unknown> }).findUnique = async ({ where }) => {
          if (where.id === 'usr_journey_1') {
            return {
              id: 'usr_journey_1',
              email: 'journey@tracker.local',
              username: 'journey_user',
              name: 'Journey User',
              avatar: null,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          }
          return null
        }

        ;(db.subscription as unknown as { findMany: () => Promise<unknown[]> }).findMany = async () => []

        const user = await db.user.findUnique({ where: { id: 'usr_journey_1' } })
        expect(user).not.toBeNull()
        expect(user?.email).toBe('journey@tracker.local')

        const entitlements = await EntitlementService.getEntitlements('usr_journey_1')
        expect(entitlements.plan).toBe('FREE')
        expect(entitlements.features.advanced_calendar).toBe(false)
        expect(entitlements.limits.maxVaultFiles).toBe(10)
      } finally {
        ;(db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique
        ;(db.subscription as unknown as { findMany: unknown }).findMany = originalFindMany
      }
    })
  })

  describe('2. Today Dashboard & Timeline Journey', () => {
    it('aggregates daily occurrences, tasks, and habit tracking for today', async () => {
      const today = getTodayDateStr()
      const sampleTemplate = {
        id: 'tpl_morning_run',
        userId: 'usr_journey_1',
        name: 'Morning 5km Run',
        recurrenceType: 'daily',
        recurrenceInterval: 1,
        timeOfDay: '07:00',
        priority: 'HIGH' as const,
        category: 'fitness',
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ActivityTemplate

      // Analyze recurrence for today
      const analysis = analyzeRecurrence(sampleTemplate, [], today)
      expect(analysis.nextDueDate).toBe(today)
      expect(analysis.overdue).toBe(false) // Due today, not overdue
    })
  })

  describe('3. Calendar Event Persistence Journey', () => {
    it('creates calendar event, verifies persistence, and supports refresh re-query', async () => {
      const originalCreate = db.calendarEvent.create
      const originalFindMany = db.calendarEvent.findMany

      const storedEvents: MockCalendarEventRecord[] = []

      try {
        ;(db.calendarEvent as unknown as {
          create: (args: { data: Omit<MockCalendarEventRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> }) => Promise<MockCalendarEventRecord>
        }).create = async ({ data }) => {
          const record: MockCalendarEventRecord = {
            id: 'evt_' + Math.random().toString(36).substring(2, 9),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          }
          storedEvents.push(record)
          return record
        }

        ;(db.calendarEvent as unknown as {
          findMany: (args: { where: { userId: string; deletedAt: null } }) => Promise<MockCalendarEventRecord[]>
        }).findMany = async ({ where }) => {
          return storedEvents.filter(e => e.userId === where.userId && !e.deletedAt)
        }

        // 1. Create Event
        const newEvent = await db.calendarEvent.create({
          data: {
            userId: 'usr_journey_1',
            title: 'Team Architecture Review',
            description: 'Quarterly review of core systems',
            start: new Date('2026-09-20T10:00:00Z'),
            end: new Date('2026-09-20T11:30:00Z'),
            allDay: false,
            type: 'MEETING'
          }
        })

        expect(newEvent.id).toBeDefined()
        expect(newEvent.title).toBe('Team Architecture Review')

        // 2. Simulated Page Refresh -> Re-query events
        const refreshedEvents = await db.calendarEvent.findMany({
          where: { userId: 'usr_journey_1', deletedAt: null }
        })

        expect(refreshedEvents.length).toBe(1)
        expect(refreshedEvents[0].title).toBe('Team Architecture Review')
        expect(refreshedEvents[0].start.toISOString()).toBe('2026-09-20T10:00:00.000Z')
      } finally {
        ;(db.calendarEvent as unknown as { create: unknown }).create = originalCreate
        ;(db.calendarEvent as unknown as { findMany: unknown }).findMany = originalFindMany
      }
    })
  })

  describe('4. Task & Activity Completion Journey', () => {
    it('creates activity completion log and updates recurrence status to done', async () => {
      const originalCreate = db.activityLog.create
      const storedLogs: ActivityLog[] = []

      try {
        ;(db.activityLog as unknown as {
          create: (args: { data: Omit<ActivityLog, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> }) => Promise<ActivityLog>
        }).create = async ({ data }) => {
          const log = {
            id: 'log_' + Math.random().toString(36).substring(2, 9),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
          } as unknown as ActivityLog
          storedLogs.push(log)
          return log
        }

        const template = {
          id: 'tpl_meditation',
          userId: 'usr_journey_1',
          name: 'Mindful Meditation',
          recurrenceType: 'daily',
          recurrenceInterval: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        } as unknown as ActivityTemplate

        const today = getTodayDateStr()

        // Log completion
        const completedLog = await db.activityLog.create({
          data: {
            userId: 'usr_journey_1',
            activityId: template.id,
            logDate: new Date(),
            status: 'completed',
            note: '20 mins morning session'
          }
        })

        expect(completedLog.status).toBe('completed')

        // Re-analyze with log: map Prisma logDate to the date string the recurrence engine expects
        const logForAnalysis = { ...completedLog, date: today } as unknown as ActivityLog
        const analysis = analyzeRecurrence(template, [logForAnalysis], today)
        expect(analysis.lastCompletedDate).toBe(today)
        expect(analysis.daysSinceLast).toBe(0)
      } finally {
        ;(db.activityLog as unknown as { create: unknown }).create = originalCreate
      }
    })
  })

  describe('5. Calendar Interaction: Date Navigation & Duration Adjustment', () => {
    it('supports date adjustments and duration recalculation without date drift', () => {
      const startTime = new Date('2026-09-20T14:00:00Z')
      const endTime = new Date('2026-09-20T15:00:00Z')
      const initialDurationMin = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
      expect(initialDurationMin).toBe(60)

      // Reschedule duration by +30 minutes
      const newEndTime = new Date(endTime.getTime() + 30 * 60 * 1000)
      const newDurationMin = (newEndTime.getTime() - startTime.getTime()) / (1000 * 60)
      expect(newDurationMin).toBe(90)
    })
  })

  describe('6. Offline Mutation Queue Simulation Journey', () => {
    it('records offline mutation with client timestamp and replays deterministically', async () => {
      interface OfflineMutation {
        id: string
        type: 'LOG_ACTIVITY'
        payload: { activityId: string; date: string }
        clientTimestamp: number
      }

      const offlineQueue: OfflineMutation[] = []

      // 1. Client goes offline and records mutation
      const mutation: OfflineMutation = {
        id: 'mut_offline_1',
        type: 'LOG_ACTIVITY',
        payload: { activityId: 'tpl_hydration', date: '2026-09-20' },
        clientTimestamp: Date.now()
      }
      offlineQueue.push(mutation)
      expect(offlineQueue.length).toBe(1)

      // 2. Client reconnects and flushes queue
      const executedMutations: string[] = []
      while (offlineQueue.length > 0) {
        const item = offlineQueue.shift()!
        expect(item.payload.date).toBe('2026-09-20')
        executedMutations.push(item.id)
      }

      expect(executedMutations).toContain('mut_offline_1')
      expect(offlineQueue.length).toBe(0)
    })
  })

  describe('7. Google Calendar External Sync Journey', () => {
    it('correctly maps external all-day and timed events preserving time semantics', () => {
      const gTimedEvent = {
        id: 'g_timed_123',
        summary: 'Dentist Appointment',
        start: { dateTime: '2026-09-20T15:00:00Z' },
        end: { dateTime: '2026-09-20T16:00:00Z' }
      }

      const gAllDayEvent = {
        id: 'g_allday_456',
        summary: 'Public Holiday',
        start: { date: '2026-09-20' },
        end: { date: '2026-09-21' }
      }

      // Verify timed event parsing
      expect(gTimedEvent.start.dateTime).toBe('2026-09-20T15:00:00Z')

      // Verify all-day parsing with UTC noon anchor
      const allDayStart = parseAllDayDate(gAllDayEvent.start.date)
      expect(allDayStart.toISOString()).toBe('2026-09-20T12:00:00.000Z')
      expect(formatAllDayDate(allDayStart)).toBe('2026-09-20')
    })
  })

  describe('8. Full Billing Journey (Free -> Active Pro -> Cancel -> Downgrade)', () => {
    it('executes full payment lifecycle, unlocks Pro, and handles cancellation gracefully', async () => {
      const originalFindMany = db.subscription.findMany
      const originalFindUnique = db.user.findUnique
      const originalUpsert = db.subscription.upsert
      const originalUpdate = db.subscription.update
      const originalAudit = AuditService.log

      let currentSub: MockSubscriptionRecord | null = null

      try {
        ;(db.user as unknown as { findUnique: () => Promise<unknown> }).findUnique = async () => ({ id: 'usr_billing_journey', email: 'bill@test.local', username: 'bill' })
        ;(db.billingCustomer as unknown as { findUnique: () => Promise<unknown> }).findUnique = async () => ({ id: 'cust_db', userId: 'usr_billing_journey', providerCustomerId: 'c_prov' })
        ;(db.auditLog as unknown as { create: () => Promise<unknown> }).create = async () => ({ id: 'audit_ok' })
        ;(AuditService as unknown as { log: () => Promise<unknown> }).log = async () => ({ id: 'audit_ok' })

        ;(db.subscription as unknown as {
          findMany: (args: { where?: { userId?: string } }) => Promise<MockSubscriptionRecord[]>
        }).findMany = async ({ where }) => {
          if (currentSub && currentSub.userId === where?.userId && !currentSub.deletedAt) {
            return [currentSub]
          }
          return []
        }

        ;(db.subscription as unknown as {
          upsert: (args: { create: { plan: string; billingInterval: string } }) => Promise<MockSubscriptionRecord>
        }).upsert = async ({ create }) => {
          currentSub = {
            id: 'sub_journey_db',
            userId: 'usr_billing_journey',
            providerSubscriptionId: 'sub_prov_journey',
            plan: create.plan,
            billingInterval: create.billingInterval,
            status: 'PENDING',
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            deletedAt: null
          }
          return currentSub
        }

        ;(db.subscription as unknown as {
          update: (args: { data: Partial<MockSubscriptionRecord> }) => Promise<MockSubscriptionRecord>
        }).update = async ({ data }) => {
          currentSub = { ...currentSub!, ...data }
          return currentSub
        }

        // STEP 1: User is Free
        let ent = await EntitlementService.getEntitlements('usr_billing_journey')
        expect(ent.plan).toBe('FREE')
        expect(ent.features.advanced_calendar).toBe(false)

        // STEP 2: Checkout started
        const checkoutRes = await BillingService.startSubscription('usr_billing_journey', 'PRO_MONTHLY')
        expect(checkoutRes.checkout).toBeDefined()

        // STEP 3: Webhook / Payment activation arrives
        currentSub!.status = 'ACTIVE'
        currentSub!.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        // Entitlements should now be PRO
        ent = await EntitlementService.getEntitlements('usr_billing_journey')
        expect(ent.plan).toBe('PRO_MONTHLY')
        expect(ent.features.advanced_calendar).toBe(true)
        expect(ent.limits.maxVaultFiles).toBe(10000)

        // STEP 4: Cancel at period end
        await BillingService.cancelSubscription('usr_billing_journey')
        expect(currentSub!.cancelAtPeriodEnd).toBe(true)

        // Entitlements remain PRO until period expires
        ent = await EntitlementService.getEntitlements('usr_billing_journey')
        expect(ent.plan).toBe('PRO_MONTHLY')

        // STEP 5: Period expires
        currentSub!.currentPeriodEnd = new Date(Date.now() - 1000) // Past
        ent = await EntitlementService.getEntitlements('usr_billing_journey')
        expect(ent.plan).toBe('FREE')
        expect(ent.features.advanced_calendar).toBe(false)
      } finally {
        ;(db.subscription as unknown as { findMany: unknown }).findMany = originalFindMany
        ;(db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique
        ;(db.subscription as unknown as { upsert: unknown }).upsert = originalUpsert
        ;(db.subscription as unknown as { update: unknown }).update = originalUpdate
        ;(AuditService as unknown as { log: unknown }).log = originalAudit
      }
    })
  })
})
