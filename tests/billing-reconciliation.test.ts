import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import crypto from 'crypto'
import { BillingService } from '@/lib/services/BillingService'
import { EntitlementService } from '@/lib/services/EntitlementService'
import { AuditService } from '@/lib/services/AuditService'
import { IBillingProvider } from '@/lib/billing/providers/IBillingProvider'
import { SubscriptionNotFoundError, BillingError } from '@/lib/billing/errors'
import { db } from '@/lib/db'

describe('Canonical Razorpay Billing Reconciliation Engine (Tests 1-12 & Incident Regression)', () => {
  const userId = 'usr_reconcile_test_101'
  const otherUserId = 'usr_other_hacker_999'
  const subId = 'sub_test_canon_001'
  const payId = 'pay_test_canon_001'
  const webhookSecret = 'whsec_test_secret_reconcile'

  let origAuditLog: typeof AuditService.log
  let origSubFindFirst: typeof db.subscription.findFirst
  let origSubFindMany: typeof db.subscription.findMany
  let origSubFindUnique: typeof db.subscription.findUnique
  let origSubUpdate: typeof db.subscription.update
  let origPaymentFindUnique: typeof db.payment.findUnique
  let origPaymentFindMany: typeof db.payment.findMany
  let origPaymentUpsert: typeof db.payment.upsert
  let origWebhookFindUnique: typeof db.billingWebhookEvent.findUnique
  let origWebhookUpsert: typeof db.billingWebhookEvent.upsert
  let origWebhookUpdate: typeof db.billingWebhookEvent.update
  let origCustomerUpdate: typeof db.billingCustomer.update

  // In-memory state for fidelity across multi-step reconciliation tests
  let subState: {
    id: string
    userId: string
    providerSubscriptionId: string
    plan: string
    status: string
    billingInterval: string
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
    isIntroductory: boolean
    billingCustomerId: string
    deletedAt: Date | null
  }
  let paymentState: {
    id: string
    userId: string
    subscriptionId: string
    provider: string
    providerPaymentId: string
    amount: number
    currency?: string
    status: string
    method?: string | null
    paidAt: Date | null
  } | null
  let webhookEventsState: Map<string, { id: string; provider?: string; providerEventId?: string; status: string }>
  let auditLogs: unknown[]

  beforeEach(() => {
    origAuditLog = AuditService.log
    origSubFindFirst = db.subscription.findFirst
    origSubFindMany = db.subscription.findMany
    origSubFindUnique = db.subscription.findUnique
    origSubUpdate = db.subscription.update
    origPaymentFindUnique = db.payment.findUnique
    origPaymentFindMany = db.payment.findMany
    origPaymentUpsert = db.payment.upsert
    origWebhookFindUnique = db.billingWebhookEvent.findUnique
    origWebhookUpsert = db.billingWebhookEvent.upsert
    origWebhookUpdate = db.billingWebhookEvent.update
    origCustomerUpdate = db.billingCustomer.update

    auditLogs = []
    webhookEventsState = new Map()

    subState = {
      id: 'sub_row_internal_1',
      userId,
      providerSubscriptionId: subId,
      plan: 'PRO_MONTHLY',
      status: 'CREATED',
      billingInterval: 'monthly',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isIntroductory: false,
      billingCustomerId: 'bc_row_1',
      deletedAt: null
    }

    paymentState = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AuditService.log = async (entry: any) => {
      auditLogs.push(entry)
      return entry
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.subscription as any).findFirst = async ({ where }: any) => {
      if (where.deletedAt === null && (!where.userId || where.userId === subState.userId)) {
        if (!where.providerSubscriptionId || where.providerSubscriptionId === subState.providerSubscriptionId) {
          return subState
        }
      }
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.subscription as any).findUnique = async ({ where }: any) => {
      if (where.providerSubscriptionId && where.providerSubscriptionId === subState.providerSubscriptionId) {
        return subState
      }
      if (where.id && where.id === subState.id) {
        return subState
      }
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.subscription as any).findMany = async ({ where }: any) => {
      if (where.userId === subState.userId && !subState.deletedAt) {
        return [subState]
      }
      return []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.subscription as any).update = async ({ data }: any) => {
      subState = { ...subState, ...data }
      return subState
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.payment as any).findUnique = async ({ where }: any) => {
      if (paymentState && paymentState.providerPaymentId === where.providerPaymentId) {
        return paymentState
      }
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.payment as any).findMany = async ({ where }: any) => {
      if (paymentState && paymentState.subscriptionId === where.subscriptionId) {
        if (!where.status || paymentState.status === where.status) {
          return [paymentState]
        }
      }
      return []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.payment as any).upsert = async ({ where, create, update }: any) => {
      if (!paymentState || paymentState.providerPaymentId !== where.providerPaymentId) {
        paymentState = { id: 'pay_row_1', ...create }
      } else {
        paymentState = { ...paymentState, ...update }
      }
      return paymentState
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.billingWebhookEvent as any).findUnique = async ({ where }: any) => {
      const key = `${where.provider_providerEventId.provider}_${where.provider_providerEventId.providerEventId}`
      return webhookEventsState.get(key) || null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.billingWebhookEvent as any).upsert = async ({ where, create, update }: any) => {
      const key = `${where.provider_providerEventId.provider}_${where.provider_providerEventId.providerEventId}`
      const existing = webhookEventsState.get(key)
      const record = existing ? { ...existing, ...update } : { id: `evt_row_${Date.now()}`, ...create }
      webhookEventsState.set(key, record)
      return record
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.billingWebhookEvent as any).update = async ({ where, data }: any) => {
      for (const [k, v] of webhookEventsState.entries()) {
        if (v.id === where.id) {
          const updated = { ...v, ...data }
          webhookEventsState.set(k, updated)
          return updated
        }
      }
      return { id: where.id, ...data }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.billingCustomer as any).update = async ({ data }: any) => ({ id: 'bc_row_1', ...data })
  })

  afterEach(() => {
    AuditService.log = origAuditLog
    db.subscription.findFirst = origSubFindFirst
    db.subscription.findMany = origSubFindMany
    db.subscription.findUnique = origSubFindUnique
    db.subscription.update = origSubUpdate
    db.payment.findUnique = origPaymentFindUnique
    db.payment.findMany = origPaymentFindMany
    db.payment.upsert = origPaymentUpsert
    db.billingWebhookEvent.findUnique = origWebhookFindUnique
    db.billingWebhookEvent.upsert = origWebhookUpsert
    db.billingWebhookEvent.update = origWebhookUpdate
    db.billingCustomer.update = origCustomerUpdate
  })

  function signPayload(body: string, secret = webhookSecret): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex')
  }

  function createMockProvider(overrides: Partial<IBillingProvider>): IBillingProvider {
    return {
      name: 'RAZORPAY',
      createCustomer: async () => ({ providerCustomerId: 'cust_mock' }),
      createSubscription: async () => ({ providerSubscriptionId: subId, keyId: 'key', amount: 99, currency: 'INR' }),
      cancelSubscription: async () => ({ providerSubscriptionId: subId, status: 'cancelled' }),
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: 'captured',
        paidAt: new Date()
      }),
      verifySubscriptionPaymentSignature: () => true,
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: () => ({ eventId: 'evt_mock', eventType: 'test', raw: null }),
      ...overrides
    }
  }

  // =========================================================================
  // TEST 1 — Captured payment
  // =========================================================================
  it('TEST 1 — Captured payment: converges to ACTIVE, SUCCESS, valid paidAt, and PRO', async () => {
    const paidAtTimestamp = new Date('2026-09-20T01:30:00Z')
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date('2026-09-20T01:30:00Z'),
        currentEnd: new Date('2026-10-20T01:30:00Z'),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        paidAt: paidAtTimestamp
      })
    })

    const res = await BillingService.reconcileSubscriptionState(userId, subId, payId, provider)

    expect(res.status).toBe('ACTIVE')
    expect(res.isPro).toBe(true)
    expect(res.payment?.status).toBe('SUCCESS')
    expect(res.payment?.paidAt).toEqual(paidAtTimestamp)

    const isPro = await EntitlementService.isPro(userId)
    expect(isPro).toBe(true)
  })

  // =========================================================================
  // TEST 2 — Payment temporarily pending
  // =========================================================================
  it('TEST 2 — Payment temporarily pending: persists PENDING, paidAt is null, not Pro', async () => {
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'pending',
        currentStart: null,
        currentEnd: null,
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: 'authorized', // processing / non-captured
        method: 'upi',
        paidAt: null
      })
    })

    const res = await BillingService.reconcileSubscriptionState(userId, subId, payId, provider)

    expect(res.status).toBe('PENDING')
    expect(res.isPro).toBe(false)
    expect(res.payment?.status).toBe('PENDING')
    expect(res.payment?.paidAt).toBeNull()

    const isPro = await EntitlementService.isPro(userId)
    expect(isPro).toBe(false)
  })

  // =========================================================================
  // TEST 3 — Pending → captured reconciliation
  // =========================================================================
  it('TEST 3 — Pending → captured reconciliation: transitions cleanly to SUCCESS and PRO', async () => {
    let captured = false
    const paidAtTimestamp = new Date('2026-09-20T01:45:00Z')

    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: captured ? 'active' : 'pending',
        currentStart: captured ? new Date('2026-09-20T01:45:00Z') : null,
        currentEnd: captured ? new Date('2026-10-20T01:45:00Z') : null,
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: captured ? 'captured' : 'authorized',
        paidAt: captured ? paidAtTimestamp : null
      })
    })

    // Pass 1: Pending
    const res1 = await BillingService.reconcileSubscriptionState(userId, subId, payId, provider)
    expect(res1.status).toBe('PENDING')
    expect(res1.payment?.status).toBe('PENDING')
    expect(res1.payment?.paidAt).toBeNull()
    expect(await EntitlementService.isPro(userId)).toBe(false)

    // Pass 2: Captured
    captured = true
    const res2 = await BillingService.reconcileSubscriptionState(userId, subId, payId, provider)
    expect(res2.status).toBe('ACTIVE')
    expect(res2.payment?.status).toBe('SUCCESS')
    expect(res2.payment?.paidAt).toEqual(paidAtTimestamp)
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })

  // =========================================================================
  // TEST 4 — Webhook activated
  // =========================================================================
  it('TEST 4 — Webhook activated: updates local subscription to ACTIVE and unlocks PRO', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const webhookPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_rzp_1',
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: subId,
            status: 'active',
            current_start: nowSec,
            current_end: nowSec + 30 * 86400
          }
        }
      }
    })

    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(nowSec * 1000),
        currentEnd: new Date((nowSec + 30 * 86400) * 1000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({ id: payId, amount: 99, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (raw: unknown) => ({
        eventId: 'evt_act_1',
        eventType: 'subscription.activated',
        occurredAt: new Date(),
        providerSubscriptionId: subId,
        status: 'active',
        raw
      })
    })

    const sig = signPayload(webhookPayload)
    const res = await BillingService.processWebhook('RAZORPAY', webhookPayload, sig, provider)

    expect(res.status).toBe(200)
    expect(subState.status).toBe('ACTIVE')
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })

  // =========================================================================
  // TEST 5 — Webhook charged
  // =========================================================================
  it('TEST 5 — Webhook charged: reconciles payment to SUCCESS and subscription to ACTIVE', async () => {
    const chargedDate = new Date('2026-09-20T01:50:00Z')
    const webhookPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_rzp_1',
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: {
            id: subId,
            status: 'active'
          }
        },
        payment: {
          entity: {
            id: payId,
            amount: 9900,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    })

    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: 'captured',
        paidAt: chargedDate
      }),
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (raw: unknown) => ({
        eventId: 'evt_chg_1',
        eventType: 'subscription.charged',
        occurredAt: chargedDate,
        providerSubscriptionId: subId,
        providerPaymentId: payId,
        amount: 99,
        currency: 'INR',
        status: 'active',
        raw
      })
    })

    const sig = signPayload(webhookPayload)
    const res = await BillingService.processWebhook('RAZORPAY', webhookPayload, sig, provider)

    expect(res.status).toBe(200)
    expect(subState.status).toBe('ACTIVE')
    expect(paymentState?.status).toBe('SUCCESS')
    expect(paymentState?.paidAt).toEqual(chargedDate)
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })

  // =========================================================================
  // TEST 6 — Duplicate webhook
  // =========================================================================
  it('TEST 6 — Duplicate webhook: second event is safely idempotent without duplicate mutations', async () => {
    const webhookPayload = JSON.stringify({
      id: 'evt_dup_123',
      event: 'subscription.activated',
      payload: {
        subscription: { entity: { id: subId, status: 'active' } }
      }
    })

    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (raw: unknown) => ({
        eventId: 'evt_dup_123',
        eventType: 'subscription.activated',
        providerSubscriptionId: subId,
        status: 'active',
        raw
      })
    })

    const sig = signPayload(webhookPayload)
    const res1 = await BillingService.processWebhook('RAZORPAY', webhookPayload, sig, provider)
    expect(res1.status).toBe(200)

    const logsBefore = auditLogs.length

    // Second delivery of exact same event
    const res2 = await BillingService.processWebhook('RAZORPAY', webhookPayload, sig, provider)
    expect(res2.status).toBe(200)
    expect(res2.message).toBe('Event already processed')
    expect(auditLogs.length).toBe(logsBefore) // No duplicate mutations
  })

  // =========================================================================
  // TEST 7 — Checkout callback happens before webhook
  // =========================================================================
  it('TEST 7 — Sequence: checkout callback before webhook converges to ACTIVE + SUCCESS + PRO', async () => {
    const paidAt = new Date('2026-09-20T02:00:00Z')
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({ id: payId, amount: 99, currency: 'INR', status: 'captured', paidAt }),
      verifySubscriptionPaymentSignature: () => true,
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (raw: unknown) => ({
        eventId: 'evt_seq_1',
        eventType: 'subscription.charged',
        occurredAt: paidAt,
        providerSubscriptionId: subId,
        providerPaymentId: payId,
        amount: 99,
        raw
      })
    })

    // 1. Checkout callback
    const checkoutRes = await BillingService.confirmCheckout(
      userId,
      { subscriptionId: subId, paymentId: payId, signature: 'sig_valid' },
      provider
    )
    expect(checkoutRes.success).toBe(true)
    expect(subState.status).toBe('ACTIVE')
    expect(paymentState?.status).toBe('SUCCESS')

    // 2. Webhook arrives later
    const webhookPayload = JSON.stringify({ id: 'evt_seq_1', event: 'subscription.charged' })
    const webhookRes = await BillingService.processWebhook('RAZORPAY', webhookPayload, signPayload(webhookPayload), provider)
    expect(webhookRes.status).toBe(200)

    expect(subState.status).toBe('ACTIVE')
    expect(paymentState?.status).toBe('SUCCESS')
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })

  // =========================================================================
  // TEST 8 — Webhook happens before checkout callback
  // =========================================================================
  it('TEST 8 — Sequence: webhook before checkout callback converges to ACTIVE + SUCCESS + PRO', async () => {
    const paidAt = new Date('2026-09-20T02:05:00Z')
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({ id: payId, amount: 99, currency: 'INR', status: 'captured', paidAt }),
      verifySubscriptionPaymentSignature: () => true,
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (raw: unknown) => ({
        eventId: 'evt_seq_2',
        eventType: 'subscription.charged',
        occurredAt: paidAt,
        providerSubscriptionId: subId,
        providerPaymentId: payId,
        amount: 99,
        raw
      })
    })

    // 1. Webhook arrives first
    const webhookPayload = JSON.stringify({ id: 'evt_seq_2', event: 'subscription.charged' })
    const webhookRes = await BillingService.processWebhook('RAZORPAY', webhookPayload, signPayload(webhookPayload), provider)
    expect(webhookRes.status).toBe(200)
    expect(subState.status).toBe('ACTIVE')
    expect(paymentState?.status).toBe('SUCCESS')

    // 2. Checkout callback arrives later
    const checkoutRes = await BillingService.confirmCheckout(
      userId,
      { subscriptionId: subId, paymentId: payId, signature: 'sig_valid' },
      provider
    )
    expect(checkoutRes.success).toBe(true)
    expect(subState.status).toBe('ACTIVE')
    expect(paymentState?.status).toBe('SUCCESS')
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })

  // =========================================================================
  // TEST 9 — Checkout returns failure
  // =========================================================================
  it('TEST 9 — Checkout signature failure: throws error safely without claiming success', async () => {
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      verifySubscriptionPaymentSignature: () => false // Invalid signature
    })

    expect(
      BillingService.confirmCheckout(
        userId,
        { subscriptionId: subId, paymentId: payId, signature: 'forged_sig' },
        provider
      )
    ).rejects.toThrow(BillingError)

    // Ensure database was NOT updated to active or success
    expect(subState.status).toBe('CREATED')
    expect(paymentState).toBeNull()
  })

  // =========================================================================
  // TEST 10 — Invalid webhook signature
  // =========================================================================
  it('TEST 10 — Invalid webhook signature: rejected with HTTP 400 and zero database mutation', async () => {
    const payload = JSON.stringify({ event: 'subscription.charged' })
    const provider = createMockProvider({
      verifyWebhookSignature: () => false // Bad signature
    })

    const res = await BillingService.processWebhook('RAZORPAY', payload, 'bad_sig', provider)
    expect(res.status).toBe(400)
    expect(res.message).toContain('Invalid webhook signature')

    // Ensure no mutations occurred
    expect(subState.status).toBe('CREATED')
    expect(webhookEventsState.size).toBe(0)
  })

  // =========================================================================
  // TEST 11 — Cross-user subscription ID
  // =========================================================================
  it('TEST 11 — Cross-user subscription ID: user A cannot reconcile user B subscription', async () => {
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      })
    })

    // Attacker otherUserId attempts to reconcile subId belonging to userId
    expect(
      BillingService.reconcileSubscriptionState(otherUserId, subId, payId, provider)
    ).rejects.toThrow(SubscriptionNotFoundError)

    // Verify subState was unaffected
    expect(subState.status).toBe('CREATED')
  })

  // =========================================================================
  // TEST 12 — SUCCESS cannot be downgraded by stale PENDING
  // =========================================================================
  it('TEST 12 — Monotonicity: existing SUCCESS payment is never downgraded by stale PENDING', async () => {
    const initialPaidAt = new Date('2026-09-20T01:00:00Z')
    paymentState = {
      id: 'pay_row_1',
      userId,
      subscriptionId: subState.id,
      provider: 'RAZORPAY',
      providerPaymentId: payId,
      amount: 99,
      status: 'SUCCESS',
      paidAt: initialPaidAt
    }

    // Provider temporarily glitching or returning stale 'authorized' state
    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: 'authorized', // Stale pending
        paidAt: null
      })
    })

    const res = await BillingService.reconcileSubscriptionState(userId, subId, payId, provider)

    // Payment MUST remain SUCCESS and retain initial paidAt timestamp
    expect(res.payment?.status).toBe('SUCCESS')
    expect(res.payment?.paidAt).toEqual(initialPaidAt)
    expect(paymentState?.status).toBe('SUCCESS')
    expect(paymentState?.paidAt).toEqual(initialPaidAt)
  })

  // =========================================================================
  // TEST 13 — REAL REGRESSION TEST FOR THIS EXACT INCIDENT (SECTION 15)
  // =========================================================================
  it('TEST 13 (REGRESSION) — Exact incident reproduction: CREATED + PENDING converges to ACTIVE + SUCCESS + PRO', async () => {
    // Initial Database (matching real incident reported in production):
    // Subscription: providerSubscriptionId = sub_test, status = CREATED
    // Payment: providerPaymentId = pay_test, status = PENDING, paidAt = null
    subState.providerSubscriptionId = 'sub_incident_test'
    subState.status = 'CREATED'

    paymentState = {
      id: 'pay_incident_row',
      userId,
      subscriptionId: subState.id,
      provider: 'RAZORPAY',
      providerPaymentId: 'pay_incident_test',
      amount: 99,
      currency: 'INR',
      status: 'PENDING',
      paidAt: null
    }

    const authoritativePaidAt = new Date('2026-09-20T01:28:30Z')

    // Authoritative Razorpay Provider (Test Mode dashboard state):
    // retrieveSubscription('sub_incident_test') -> ACTIVE
    // retrievePayment('pay_incident_test') -> CAPTURED
    const provider = createMockProvider({
      retrieveSubscription: async (sId: string) => {
        expect(sId).toBe('sub_incident_test')
        return {
          id: sId,
          status: 'active',
          currentStart: new Date('2026-09-20T01:28:00Z'),
          currentEnd: new Date('2026-10-20T01:28:00Z'),
          planId: 'PRO_MONTHLY'
        }
      },
      retrievePayment: async (pId: string) => {
        expect(pId).toBe('pay_incident_test')
        return {
          id: pId,
          amount: 99,
          currency: 'INR',
          status: 'captured',
          method: 'card',
          paidAt: authoritativePaidAt
        }
      }
    })

    // Run canonical reconciliation
    const result = await BillingService.reconcileSubscriptionState(
      userId,
      'sub_incident_test',
      'pay_incident_test',
      provider
    )

    // Assert: Subscription is ACTIVE, Payment is SUCCESS with authoritative paidAt, and user has PRO entitlements
    expect(result.subscription.status).toBe('ACTIVE')
    expect(subState.status).toBe('ACTIVE')
    expect(result.payment?.status).toBe('SUCCESS')
    expect(paymentState?.status).toBe('SUCCESS')
    expect(result.payment?.paidAt).toEqual(authoritativePaidAt)
    expect(paymentState?.paidAt).toEqual(authoritativePaidAt)

    const isPro = await EntitlementService.isPro(userId)
    expect(isPro).toBe(true)
    expect(result.isPro).toBe(true)
  })

  // =========================================================================
  // TEST 14 — Monotonic subscription status
  // =========================================================================
  it('TEST 14 — Monotonic subscription status: out-of-order pending event cannot downgrade ACTIVE subscription', async () => {
    subState.status = 'ACTIVE'

    const webhookPayload = JSON.stringify({
      id: 'evt_pending_stale',
      event: 'subscription.pending',
      payload: {
        subscription: { entity: { id: subId, status: 'pending' } }
      }
    })

    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'pending',
        currentStart: null,
        currentEnd: null,
        planId: 'PRO_MONTHLY'
      }),
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (raw: unknown) => ({
        eventId: 'evt_pending_stale',
        eventType: 'subscription.pending',
        providerSubscriptionId: subId,
        status: 'pending',
        raw
      })
    })

    const res = await BillingService.processWebhook(
      'RAZORPAY',
      webhookPayload,
      signPayload(webhookPayload),
      provider
    )

    expect(res.status).toBe(200)
    // Subscription MUST remain ACTIVE and not be downgraded to PENDING
    expect(subState.status).toBe('ACTIVE')
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })

  // =========================================================================
  // TEST 15 — Payment webhook association without top-level subscription entity
  // =========================================================================
  it('TEST 15 — Payment webhook association: payment.captured resolves subscription from payment entity and reconciles', async () => {
    subState.status = 'CREATED'
    const captureDate = new Date('2026-09-20T02:20:00Z')

    const webhookPayload = JSON.stringify({
      id: 'evt_pay_cap_only',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: payId,
            subscription_id: subId,
            amount: 9900,
            status: 'captured'
          }
        }
      }
    })

    const provider = createMockProvider({
      retrieveSubscription: async () => ({
        id: subId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 86400000),
        planId: 'PRO_MONTHLY'
      }),
      retrievePayment: async () => ({
        id: payId,
        amount: 99,
        currency: 'INR',
        status: 'captured',
        paidAt: captureDate
      }),
      verifyWebhookSignature: (raw, sig) => sig === signPayload(raw),
      normalizeWebhookEvent: (rawPayload: unknown) => {
        const raw = rawPayload as { payload?: { payment?: { entity?: { id?: string; subscription_id?: string; amount?: number } } } }
        const pEntity = raw.payload?.payment?.entity
        return {
          eventId: 'evt_pay_cap_only',
          eventType: 'payment.captured',
          providerSubscriptionId: pEntity?.subscription_id,
          providerPaymentId: pEntity?.id,
          amount: (pEntity?.amount || 0) / 100,
          currency: 'INR',
          occurredAt: captureDate,
          raw: rawPayload
        }
      }
    })

    const res = await BillingService.processWebhook(
      'RAZORPAY',
      webhookPayload,
      signPayload(webhookPayload),
      provider
    )

    expect(res.status).toBe(200)
    expect(subState.status).toBe('ACTIVE')
    expect(paymentState?.status).toBe('SUCCESS')
    expect(paymentState?.paidAt).toEqual(captureDate)
    expect(await EntitlementService.isPro(userId)).toBe(true)
  })
})
