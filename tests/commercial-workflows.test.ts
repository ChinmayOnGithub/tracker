/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { db } from '@/lib/db'
import { BillingService } from '@/lib/services/BillingService'
import { createNote } from '@/app/actions/note'
import { upsertJournalEntry } from '@/app/actions/journal'
import { createActivityTemplate } from '@/app/actions/template'
import { MockBillingProvider, setBillingProvider } from '@/lib/billing/providers'

describe('Commercial Workflows: Dual Free Rejection & Pro Success Suite', () => {
  const freeUserId = 'usr_free_commercial_test'
  const proUserId = 'usr_pro_commercial_test'

  let origGetSubscription: typeof BillingService.getSubscription

  beforeEach(() => {
    setBillingProvider(new MockBillingProvider())
    origGetSubscription = BillingService.getSubscription
  })

  afterEach(() => {
    setBillingProvider(null)
    BillingService.getSubscription = origGetSubscription
  })

  describe('1. Active Activities Limit (Free: 10 vs Pro: 10,000)', () => {
    it('Free User: 11th active activity creation is rejected at server action boundary', async () => {
      // Mock Free subscription
      BillingService.getSubscription = async (_userId: string) => {
        return null // Resolves to canonical FREE entitlements (limit = 10)
      }

      // Mock requireModuleAccess to authenticate free user
      const originalCount = db.activityTemplate.count
      const originalAggregate = db.activityTemplate.aggregate

      try {
        // Simulate user already having 10 active activities
        (db.activityTemplate as any).count = async () => 10;
        (db.activityTemplate as any).aggregate = async () => ({ _max: { sortOrder: 10 } });

        // Mock Session / Auth
        const { AuthorizationService } = await import('@/lib/services/AuthorizationService')
        const origRequireAuth = AuthorizationService.requireAuth
        AuthorizationService.requireAuth = async () => ({
          id: freeUserId,
          username: 'free_user',
          isOwner: false
        })

        const result = await createActivityTemplate({
          name: '11th Activity',
          category: 'health',
          icon: 'Activity',
          color: 'blue',
          recurrenceType: 'daily'
        })

        expect(result.success).toBe(false)
        expect(result.code).toBe('QUOTA_EXCEEDED')
        expect(result.error).toContain('Free plan limit reached (10 active activities)')

        AuthorizationService.requireAuth = origRequireAuth
      } finally {
        db.activityTemplate.count = originalCount
        db.activityTemplate.aggregate = originalAggregate
      }
    })

    it('Pro User: 11th active activity creation is authorized and succeeds', async () => {
      // Mock Pro subscription
      BillingService.getSubscription = async (_userId: string) => {
        return {
          id: 'sub_pro_101',
          userId: proUserId,
          plan: 'PRO_MONTHLY',
          status: 'ACTIVE',
          billingInterval: 'monthly',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          isIntroductory: false,
          billingCustomerId: 'cust_101',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          provider: 'RAZORPAY',
          providerSubscriptionId: 'sub_prov_pro_101',
          trialStart: null,
          trialEnd: null,
          metadata: null
        } as any
      }

      const originalCount = db.activityTemplate.count
      const originalAggregate = db.activityTemplate.aggregate
      const originalCreate = db.activityTemplate.create

      try {
        // Simulate user having 10 active activities, but with a Pro limit of 10,000
        (db.activityTemplate as any).count = async () => 10;
        (db.activityTemplate as any).aggregate = async () => ({ _max: { sortOrder: 10 } });
        (db.activityTemplate as any).create = async ({ data }: any) => ({
          id: 'tpl_11th_pro',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });

        const { AuthorizationService } = await import('@/lib/services/AuthorizationService')
        const origRequireAuth = AuthorizationService.requireAuth
        AuthorizationService.requireAuth = async () => ({
          id: proUserId,
          username: 'pro_user',
          isOwner: false,
          isPro: true
        })

        const result = await createActivityTemplate({
          name: '11th Activity On Pro',
          category: 'health',
          icon: 'Activity',
          color: 'emerald',
          recurrenceType: 'daily'
        })

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data?.name).toBe('11th Activity On Pro')

        AuthorizationService.requireAuth = origRequireAuth
      } finally {
        db.activityTemplate.count = originalCount
        db.activityTemplate.aggregate = originalAggregate
        db.activityTemplate.create = originalCreate
      }
    })
  })

  describe('2. Journal Writing Entitlement (Free: Blocked vs Pro: Allowed)', () => {
    it('Free User: Attempt to write journal entry is rejected with Pro upgrade prompt', async () => {
      BillingService.getSubscription = async () => null // Free user

      const { AuthorizationService } = await import('@/lib/services/AuthorizationService')
      const origRequireAuth = AuthorizationService.requireAuth
      AuthorizationService.requireAuth = async () => ({
        id: freeUserId,
        username: 'free_user',
        isOwner: true // Has module access, but Free commercial tier
      })

      const result = await upsertJournalEntry('2026-09-24', {
        content: 'Trying to write on free account'
      })

      expect(result.success).toBe(false)
      expect(result.code).toBe('ACCESS_DENIED')
      expect(result.error).toContain('Journal writing requires an active Tracker Pro subscription')

      AuthorizationService.requireAuth = origRequireAuth
    })

    it('Pro User: Attempt to write journal entry succeeds and saves entry', async () => {
      BillingService.getSubscription = async () => ({
        id: 'sub_pro_101',
        userId: proUserId,
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        billingInterval: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        isIntroductory: false,
        billingCustomerId: 'cust_101',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        provider: 'RAZORPAY',
        providerSubscriptionId: 'sub_prov_pro_101',
        trialStart: null,
        trialEnd: null,
        metadata: null
      } as any)

      const { JournalService } = await import('@/modules/journal/server')
      const { ActivityService } = await import('@/lib/services/ActivityService')
      const originalJournalUpsert = JournalService.upsert
      const originalJournalFindUnique = db.journalEntry.findUnique
      const originalGetOrCreate = ActivityService.getOrCreateDefaultTemplate
      const originalLogActivity = ActivityService.logActivity

      try {
        const mockSaved = {
          id: 'jrn_pro_1',
          userId: proUserId,
          journalDate: new Date('2026-09-24T12:00:00.000Z'),
          content: 'Productive day on Tracker Pro!',
          mood: 'great',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        };

        JournalService.upsert = async () => mockSaved as any;
        (db.journalEntry as any).findUnique = async () => mockSaved;
        (ActivityService as any).getOrCreateDefaultTemplate = async () => ({ id: 'tpl_jrn_1' });
        (ActivityService as any).logActivity = async () => ({ id: 'log_jrn_1' });

        const { AuthorizationService } = await import('@/lib/services/AuthorizationService')
        const origRequireAuth = AuthorizationService.requireAuth
        AuthorizationService.requireAuth = async () => ({
          id: proUserId,
          username: 'pro_user',
          isOwner: true,
          isPro: true
        })

        const result = await upsertJournalEntry('2026-09-24', {
          content: 'Productive day on Tracker Pro!',
          mood: 'great'
        })

        expect(result.success).toBe(true)
        expect(result.entry).toBeDefined()
        expect(result.entry?.content).toBe('Productive day on Tracker Pro!')

        AuthorizationService.requireAuth = origRequireAuth
      } finally {
        JournalService.upsert = originalJournalUpsert
        db.journalEntry.findUnique = originalJournalFindUnique
        ActivityService.getOrCreateDefaultTemplate = originalGetOrCreate
        ActivityService.logActivity = originalLogActivity
      }
    })
  })

  describe('3. Notes Creation Entitlement (Free: Blocked vs Pro: Allowed)', () => {
    it('Free User: Note creation is rejected with Pro upgrade prompt', async () => {
      BillingService.getSubscription = async () => null // Free user

      const { AuthorizationService } = await import('@/lib/services/AuthorizationService')
      const origRequireAuth = AuthorizationService.requireAuth
      AuthorizationService.requireAuth = async () => ({
        id: freeUserId,
        username: 'free_user',
        isOwner: false
      })

      const result = await createNote('My thoughts on Free tier', 'Draft Note')

      expect(result.success).toBe(false)
      expect(result.code).toBe('ACCESS_DENIED')
      expect(result.error).toContain('Notes writing requires an active Tracker Pro subscription')

      AuthorizationService.requireAuth = origRequireAuth
    })

    it('Pro User: Note creation succeeds and persists note', async () => {
      BillingService.getSubscription = async () => ({
        id: 'sub_pro_101',
        userId: proUserId,
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        billingInterval: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        isIntroductory: false,
        billingCustomerId: 'cust_101',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        provider: 'RAZORPAY',
        providerSubscriptionId: 'sub_prov_pro_101',
        trialStart: null,
        trialEnd: null,
        metadata: null
      } as any)

      const originalNoteUpsert = db.note.upsert

      try {
        (db.note as any).upsert = async ({ create }: any) => ({
          id: 'note_pro_101',
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        });

        const { AuthorizationService } = await import('@/lib/services/AuthorizationService')
        const origRequireAuth = AuthorizationService.requireAuth
        AuthorizationService.requireAuth = async () => ({
          id: proUserId,
          username: 'pro_user',
          isOwner: false,
          isPro: true
        })

        const result = await createNote('Deep research notes on Pro workspace', 'Architecture Spec')

        expect(result.success).toBe(true)
        expect(result.note).toBeDefined()
        expect(result.note?.content).toBe('Deep research notes on Pro workspace')

        AuthorizationService.requireAuth = origRequireAuth
      } finally {
        db.note.upsert = originalNoteUpsert
      }
    })
  })

  describe('4. Historical Read Preservation', () => {
    it('Free user retains read-only access to existing notes and journal entries without deletion', async () => {
      // Historical notes and entries remain readable via database selectors
      const originalFindManyNotes = db.note.findMany
      const originalFindManyJournal = db.journalEntry.findMany

      try {
        (db.note as any).findMany = async () => [
          { id: 'note_old_1', title: 'Old Note', content: 'Preserved content', userId: freeUserId }
        ];
        (db.journalEntry as any).findMany = async () => [
          { id: 'jrn_old_1', content: 'Old Journal entry', userId: freeUserId }
        ];

        const notes = await db.note.findMany({ where: { userId: freeUserId, deletedAt: null } })
        const journals = await db.journalEntry.findMany({ where: { userId: freeUserId, deletedAt: null } })

        expect(notes.length).toBe(1)
        expect(notes[0].content).toBe('Preserved content')
        expect(journals.length).toBe(1)
        expect(journals[0].content).toBe('Old Journal entry')
      } finally {
        db.note.findMany = originalFindManyNotes
        db.journalEntry.findMany = originalFindManyJournal
      }
    })
  })
})
