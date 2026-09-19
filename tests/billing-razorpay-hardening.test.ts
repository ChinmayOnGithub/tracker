import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import crypto from 'crypto'
import { BillingService } from '@/lib/services/BillingService'
import { AuditService } from '@/lib/services/AuditService'
import { RazorpayProvider } from '@/lib/billing/providers/RazorpayProvider'
import { IBillingProvider } from '@/lib/billing/providers/IBillingProvider'
import { getIntroductoryOfferId, getAuthoritativePrice } from '@/lib/billing/plans'
import { ProviderConfigurationError, ProviderError } from '@/lib/billing/errors'
import { db } from '@/lib/db'

describe('Razorpay Billing System Hardening & Edge Cases (A-N)', () => {
  const testUserId = 'test_harden_user_123'
  const mockWebhookSecret = 'test_webhook_secret_xyz789'
  let origAuditLog: typeof AuditService.log

  beforeEach(() => {
    origAuditLog = AuditService.log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AuditService.log = async () => ({} as any)
  })

  afterEach(() => {
    AuditService.log = origAuditLog
  })

  // A. Existing valid cust_... -> fetch succeeds -> reused -> no new customer
  it('A. should reuse existing valid provider customer without creating a new one', async () => {
    let createCustomerCalled = false
    let retrieveCustomerCalled = false

    const mockProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => {
        createCustomerCalled = true
        return { providerCustomerId: 'cust_new_should_not_be_called' }
      },
      retrieveCustomer: async (id: string) => {
        retrieveCustomerCalled = true
        return { providerCustomerId: id }
      },
      createSubscription: async (_params) => ({
        providerSubscriptionId: 'sub_test_a',
        keyId: 'rzp_test_key',
        amount: 99,
        currency: 'INR'
      }),
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: 'sub_test_a', status: 'created', currentStart: null, currentEnd: null, planId: 'PRO_MONTHLY' }),
      retrievePayment: async () => ({ id: 'pay_a', amount: 99, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_a', eventType: 'test', raw: null })
    }

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => ({
        id: 'local_bc_1',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: 'cust_real_existing_valid',
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.subscription as Record<string, unknown>).upsert = async () => ({ id: 'sub_local_1' })

      const res = await BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: mockProvider })
      expect(res.checkout.subscriptionId).toBe('sub_test_a')
      expect(retrieveCustomerCalled).toBe(true)
      expect(createCustomerCalled).toBe(false)
    } finally {
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.subscription.upsert = origUpsertSub
    }
  })

  // B. Existing cust_mock_... -> real customer created -> local ID replaced -> mock ID never reaches subscription creation
  it('B. should heal stale cust_mock_ by creating real customer and never passing mock ID to createSubscription', async () => {
    let createdCustomerId = ''
    let subscriptionReceivedCustomerId: string | undefined
    let upsertedCustomerId = ''

    const mockProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => {
        createdCustomerId = 'cust_real_healed_from_mock'
        return { providerCustomerId: createdCustomerId }
      },
      retrieveCustomer: async () => null,
      createSubscription: async (params) => {
        subscriptionReceivedCustomerId = params.customerId
        return {
          providerSubscriptionId: 'sub_test_b',
          keyId: 'rzp_test_key',
          amount: 99,
          currency: 'INR'
        }
      },
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: 'sub_test_b', status: 'created', currentStart: null, currentEnd: null, planId: 'PRO_MONTHLY' }),
      retrievePayment: async () => ({ id: 'pay_b', amount: 99, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_b', eventType: 'test', raw: null })
    }

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origUpsertCust = db.billingCustomer.upsert
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => ({
        id: 'local_bc_stale',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: 'cust_mock_stale_123',
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.billingCustomer as Record<string, unknown>).upsert = async (args: { update: { providerCustomerId: string } }) => {
        upsertedCustomerId = args.update.providerCustomerId
        return {
          id: 'local_bc_stale',
          userId: testUserId,
          provider: 'RAZORPAY',
          providerCustomerId: upsertedCustomerId,
          currency: 'INR',
          hasUsedIntroductoryOffer: false
        }
      }
      ;(db.subscription as Record<string, unknown>).upsert = async () => ({ id: 'sub_local_b' })

      await BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: mockProvider })

      expect(createdCustomerId).toBe('cust_real_healed_from_mock')
      expect(upsertedCustomerId).toBe('cust_real_healed_from_mock')
      expect(subscriptionReceivedCustomerId).toBe('cust_real_healed_from_mock')
      expect(subscriptionReceivedCustomerId?.startsWith('cust_mock_')).toBe(false)
    } finally {
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.billingCustomer.upsert = origUpsertCust
      db.subscription.upsert = origUpsertSub
    }
  })

  // C. Existing cust_... that Razorpay says does not exist -> replacement customer created -> local record repaired
  it('C. should replace non-existent provider customer and repair local record', async () => {
    let createCustomerCalled = false
    let upsertedCustomerId = ''

    const mockProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => {
        createCustomerCalled = true
        return { providerCustomerId: 'cust_brand_new_replacement' }
      },
      retrieveCustomer: async () => null, // Provider says customer does not exist
      createSubscription: async () => ({
        providerSubscriptionId: 'sub_test_c',
        keyId: 'rzp_test_key',
        amount: 99,
        currency: 'INR'
      }),
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: 'sub_test_c', status: 'created', currentStart: null, currentEnd: null, planId: 'PRO_MONTHLY' }),
      retrievePayment: async () => ({ id: 'pay_c', amount: 99, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_c', eventType: 'test', raw: null })
    }

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origUpsertCust = db.billingCustomer.upsert
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => ({
        id: 'local_bc_not_found',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: 'cust_deleted_on_razorpay',
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.billingCustomer as Record<string, unknown>).upsert = async (args: { update: { providerCustomerId: string } }) => {
        upsertedCustomerId = args.update.providerCustomerId
        return {
          id: 'local_bc_not_found',
          userId: testUserId,
          provider: 'RAZORPAY',
          providerCustomerId: upsertedCustomerId,
          currency: 'INR',
          hasUsedIntroductoryOffer: false
        }
      }
      ;(db.subscription as Record<string, unknown>).upsert = async () => ({ id: 'sub_local_c' })

      await BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: mockProvider })

      expect(createCustomerCalled).toBe(true)
      expect(upsertedCustomerId).toBe('cust_brand_new_replacement')
    } finally {
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.billingCustomer.upsert = origUpsertCust
      db.subscription.upsert = origUpsertSub
    }
  })

  // D. No BillingCustomer -> exactly one real customer created -> persisted
  it('D. should create exactly one customer and persist it when no BillingCustomer exists', async () => {
    let createCount = 0

    const mockProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => {
        createCount++
        return { providerCustomerId: 'cust_first_time_user' }
      },
      retrieveCustomer: async () => null,
      createSubscription: async () => ({
        providerSubscriptionId: 'sub_test_d',
        keyId: 'rzp_test_key',
        amount: 99,
        currency: 'INR'
      }),
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: 'sub_test_d', status: 'created', currentStart: null, currentEnd: null, planId: 'PRO_MONTHLY' }),
      retrievePayment: async () => ({ id: 'pay_d', amount: 99, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_d', eventType: 'test', raw: null })
    }

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origUpsertCust = db.billingCustomer.upsert
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => null
      ;(db.billingCustomer as Record<string, unknown>).upsert = async (args: { create: { providerCustomerId: string } }) => ({
        id: 'local_bc_new',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: args.create.providerCustomerId,
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.subscription as Record<string, unknown>).upsert = async () => ({ id: 'sub_local_d' })

      await BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: mockProvider })

      expect(createCount).toBe(1)
    } finally {
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.billingCustomer.upsert = origUpsertCust
      db.subscription.upsert = origUpsertSub
    }
  })

  // E. offer_placeholder -> offerId undefined
  it('E. should treat offer_placeholder as undefined offerId', () => {
    const prev = process.env.RAZORPAY_OFFER_INTRODUCTORY
    try {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = 'offer_placeholder'
      expect(getIntroductoryOfferId()).toBeUndefined()

      process.env.RAZORPAY_OFFER_INTRODUCTORY = 'placeholder'
      expect(getIntroductoryOfferId()).toBeUndefined()

      process.env.RAZORPAY_OFFER_INTRODUCTORY = 'undefined'
      expect(getIntroductoryOfferId()).toBeUndefined()

      process.env.RAZORPAY_OFFER_INTRODUCTORY = ''
      expect(getIntroductoryOfferId()).toBeUndefined()
    } finally {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = prev
    }
  })

  // F. No offer configured -> subscription payload contains no offer_id
  it('F. should not include offer_id when no offer is configured', async () => {
    let payloadOfferId: string | null | undefined

    const mockProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => ({ providerCustomerId: 'cust_f' }),
      retrieveCustomer: async (id) => ({ providerCustomerId: id }),
      createSubscription: async (params) => {
        payloadOfferId = params.offerId
        return {
          providerSubscriptionId: 'sub_test_f',
          keyId: 'rzp_test_key',
          amount: 99,
          currency: 'INR'
        }
      },
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: 'sub_test_f', status: 'created', currentStart: null, currentEnd: null, planId: 'PRO_MONTHLY' }),
      retrievePayment: async () => ({ id: 'pay_f', amount: 99, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_f', eventType: 'test', raw: null })
    }

    const prevOffer = process.env.RAZORPAY_OFFER_INTRODUCTORY
    delete process.env.RAZORPAY_OFFER_INTRODUCTORY

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => ({
        id: 'local_bc_f',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: 'cust_f',
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.subscription as Record<string, unknown>).upsert = async () => ({ id: 'sub_local_f' })

      await BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: mockProvider })

      expect(payloadOfferId).toBeUndefined()
    } finally {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = prevOffer || undefined
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.subscription.upsert = origUpsertSub
    }
  })

  // G. Valid offer configured -> offer_id included
  it('G. should include offer_id when a valid real offer is configured', async () => {
    let payloadOfferId: string | null | undefined

    const mockProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => ({ providerCustomerId: 'cust_g' }),
      retrieveCustomer: async (id) => ({ providerCustomerId: id }),
      createSubscription: async (params) => {
        payloadOfferId = params.offerId
        return {
          providerSubscriptionId: 'sub_test_g',
          keyId: 'rzp_test_key',
          amount: 29,
          currency: 'INR'
        }
      },
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: 'sub_test_g', status: 'created', currentStart: null, currentEnd: null, planId: 'PRO_MONTHLY' }),
      retrievePayment: async () => ({ id: 'pay_g', amount: 29, currency: 'INR', status: 'captured' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_g', eventType: 'test', raw: null })
    }

    const prevOffer = process.env.RAZORPAY_OFFER_INTRODUCTORY
    process.env.RAZORPAY_OFFER_INTRODUCTORY = 'offer_real_test_12345'

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origFindFirstCust = db.billingCustomer.findFirst
    const origUpdateManyCust = db.billingCustomer.updateMany
    const origFindPayment = db.payment.findFirst
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => ({
        id: 'local_bc_g',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: 'cust_g',
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.billingCustomer as Record<string, unknown>).findFirst = async () => ({
        hasUsedIntroductoryOffer: false
      })
      ;(db.billingCustomer as Record<string, unknown>).updateMany = async () => ({ count: 1 })
      ;(db.payment as Record<string, unknown>).findFirst = async () => null
      ;(db.subscription as Record<string, unknown>).upsert = async () => ({ id: 'sub_local_g' })

      await BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: mockProvider })

      expect(payloadOfferId).toBe('offer_real_test_12345')
    } finally {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = prevOffer || undefined
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.billingCustomer.findFirst = origFindFirstCust
      db.billingCustomer.updateMany = origUpdateManyCust
      db.payment.findFirst = origFindPayment
      db.subscription.upsert = origUpsertSub
    }
  })

  // H. Monthly normal -> ₹99
  it('H. should charge standard ₹99 when monthly subscription has no intro offer', () => {
    const prev = process.env.RAZORPAY_OFFER_INTRODUCTORY
    delete process.env.RAZORPAY_OFFER_INTRODUCTORY
    try {
      const price = getAuthoritativePrice('PRO_MONTHLY', true)
      expect(price.amount).toBe(99)
      expect(price.isIntroductory).toBe(false)
    } finally {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = prev || undefined
    }
  })

  // I. Monthly intro with REAL Razorpay offer -> ₹29 displayed/recorded only when provider actually applies it
  it('I. should resolve ₹29 only when a real Razorpay offer is configured and user is eligible', () => {
    const prev = process.env.RAZORPAY_OFFER_INTRODUCTORY
    try {
      // With real offer
      process.env.RAZORPAY_OFFER_INTRODUCTORY = 'offer_test_live_intro'
      const introPrice = getAuthoritativePrice('PRO_MONTHLY', true)
      expect(introPrice.amount).toBe(29)
      expect(introPrice.isIntroductory).toBe(true)

      // Ineligible user with offer -> 99
      const ineligiblePrice = getAuthoritativePrice('PRO_MONTHLY', false)
      expect(ineligiblePrice.amount).toBe(99)
      expect(ineligiblePrice.isIntroductory).toBe(false)

      // Eligible user with placeholder offer -> 99
      process.env.RAZORPAY_OFFER_INTRODUCTORY = 'offer_placeholder'
      const placeholderPrice = getAuthoritativePrice('PRO_MONTHLY', true)
      expect(placeholderPrice.amount).toBe(99)
      expect(placeholderPrice.isIntroductory).toBe(false)
    } finally {
      process.env.RAZORPAY_OFFER_INTRODUCTORY = prev || undefined
    }
  })

  // J. Annual -> ₹799
  it('J. should charge ₹799 for annual plan', () => {
    const price = getAuthoritativePrice('PRO_ANNUAL', true)
    expect(price.amount).toBe(799)
    expect(price.isIntroductory).toBe(false)
  })

  // K. Razorpay client unavailable -> ProviderError -> NO cust_mock_* -> NO sub_mock_*
  it('K. should throw ProviderError and never return mock IDs when Razorpay client is unavailable', async () => {
    const unconfigured = new RazorpayProvider({
      keyId: 'placeholder_key',
      keySecret: 'placeholder_secret'
    })

    expect(unconfigured.isConfigured()).toBe(false)

    expect(
      unconfigured.createCustomer({ userId: 'u123', email: 'test@example.com' })
    ).rejects.toThrow(ProviderConfigurationError)

    expect(
      unconfigured.createSubscription({ planId: 'PRO_MONTHLY', customerId: 'cust_unconfigured' })
    ).rejects.toThrow(ProviderConfigurationError)
  })

  // L. Webhook signature verification still passes
  it('L. should cryptographically verify valid webhook signatures using HMAC-SHA256', () => {
    const provider = new RazorpayProvider({
      keyId: 'rzp_test_test',
      keySecret: 'secret_test',
      webhookSecret: mockWebhookSecret
    })

    const payload = JSON.stringify({ event: 'subscription.charged', id: 'evt_12345' })
    const validSig = crypto
      .createHmac('sha256', mockWebhookSecret)
      .update(payload)
      .digest('hex')

    expect(provider.verifyWebhookSignature(payload, validSig)).toBe(true)
    expect(provider.verifyWebhookSignature(payload, 'invalid_signature_hex')).toBe(false)
  })

  // M. Duplicate webhook remains idempotent
  it('M. should process duplicate webhooks idempotently without re-executing handlers', async () => {
    const provider = new RazorpayProvider({
      keyId: 'rzp_test_test',
      keySecret: 'secret_test',
      webhookSecret: mockWebhookSecret
    })

    const payload = JSON.stringify({
      id: 'evt_idempotent_test_1',
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'sub_existing_active',
            status: 'active',
            current_start: Math.floor(Date.now() / 1000),
            current_end: Math.floor(Date.now() / 1000) + 30 * 86400
          }
        }
      }
    })

    const validSig = crypto
      .createHmac('sha256', mockWebhookSecret)
      .update(payload)
      .digest('hex')

    const origFindWebhook = db.billingWebhookEvent.findUnique
    try {
      // Mock existing webhook event already processed as PROCESSED
      (db.billingWebhookEvent as Record<string, unknown>).findUnique = async () => ({
        id: 'wb_1',
        provider: 'RAZORPAY',
        providerEventId: 'evt_idempotent_test_1',
        status: 'PROCESSED'
      })

      const res = await BillingService.processWebhook('RAZORPAY', payload, validSig, provider)
      expect(res.status).toBe(200)
      expect(res.message).toBe('Event already processed')
    } finally {
      db.billingWebhookEvent.findUnique = origFindWebhook
    }
  })

  // N. Subscription creation failure does not create a fake local subscription
  it('N. should not persist any local subscription if provider creation fails', async () => {
    let localSubscriptionCreated = false

    const failingProvider: IBillingProvider = {
      name: 'RAZORPAY',
      createCustomer: async () => ({ providerCustomerId: 'cust_n' }),
      retrieveCustomer: async (id) => ({ providerCustomerId: id }),
      createSubscription: async () => {
        throw new ProviderError('RAZORPAY', 'Failed to create subscription: The ID provided is invalid or could not be found.')
      },
      cancelSubscription: async () => ({ providerSubscriptionId: '', status: '' }),
      retrieveSubscription: async () => ({ id: '', status: '', currentStart: null, currentEnd: null, planId: '' }),
      retrievePayment: async () => ({ id: '', amount: 0, currency: '', status: '' }),
      verifyWebhookSignature: () => true,
      normalizeWebhookEvent: () => ({ eventId: 'evt_n', eventType: 'dummy', raw: null })
    }

    const origFindSub = db.subscription.findFirst
    const origFindCust = db.billingCustomer.findUnique
    const origUpsertSub = db.subscription.upsert

    try {
      (db.subscription as Record<string, unknown>).findFirst = async () => null
      ;(db.billingCustomer as Record<string, unknown>).findUnique = async () => ({
        id: 'local_bc_n',
        userId: testUserId,
        provider: 'RAZORPAY',
        providerCustomerId: 'cust_n',
        currency: 'INR',
        hasUsedIntroductoryOffer: false
      })
      ;(db.subscription as Record<string, unknown>).upsert = async () => {
        localSubscriptionCreated = true
        return { id: 'sub_n' }
      }

      expect(
        BillingService.startSubscription(testUserId, 'PRO_MONTHLY', { provider: failingProvider })
      ).rejects.toThrow('The ID provided is invalid or could not be found')

      expect(localSubscriptionCreated).toBe(false)
    } finally {
      db.subscription.findFirst = origFindSub
      db.billingCustomer.findUnique = origFindCust
      db.subscription.upsert = origUpsertSub
    }
  })
})
