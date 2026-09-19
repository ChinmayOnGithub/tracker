import crypto from 'crypto'
import Razorpay from 'razorpay'
import { IBillingProvider } from './IBillingProvider'
import {
  CancelSubscriptionInput,
  CreateCustomerInput,
  CreateSubscriptionInput,
  CustomerResult,
  NormalizedWebhookEvent,
  ProviderPayment,
  ProviderSubscription,
  SubscriptionCheckoutResult
} from '../types'
import { getPlan, getProviderPlanId } from '../plans'
import { ProviderError } from '../errors'

export class RazorpayProvider implements IBillingProvider {
  public readonly name = 'RAZORPAY'
  private razorpayClient: Razorpay | null = null
  private keyId: string
  private keySecret: string
  private webhookSecret: string

  constructor(options?: { keyId?: string; keySecret?: string; webhookSecret?: string }) {
    this.keyId = options?.keyId || process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder'
    this.keySecret = options?.keySecret || process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder'
    this.webhookSecret = options?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_placeholder'

    if (this.keyId && this.keySecret && this.keyId !== 'rzp_test_placeholder') {
      try {
        this.razorpayClient = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret
        })
      } catch (e) {
        console.warn('Razorpay SDK initialization failed, fallback active:', e)
      }
    }
  }

  /**
   * Creates or resolves a customer in Razorpay.
   */
  async createCustomer(params: CreateCustomerInput): Promise<CustomerResult> {
    const { userId, email, name } = params

    if (!this.razorpayClient) {
      // In test/mock mode or when credentials are not configured, return deterministic mock customer ID
      return { providerCustomerId: `cust_mock_${userId.slice(0, 12)}` }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customer = await (this.razorpayClient as any).customers.create({
        name: name || `User ${userId.slice(0, 8)}`,
        email: email || `${userId}@example.tracker.local`,
        notes: { userId }
      })
      return { providerCustomerId: customer.id }
    } catch (err: unknown) {
      // If customer creation fails due to network/provider error, handle safely
      const message = err instanceof Error ? err.message : String(err)
      throw new ProviderError(this.name, `Failed to create customer: ${message}`, err)
    }
  }

  /**
   * Creates a recurring subscription in Razorpay with safe checkout details.
   */
  async createSubscription(params: CreateSubscriptionInput): Promise<SubscriptionCheckoutResult> {
    const { planId, customerId, offerId, isIntroductory, notes } = params
    const planConfig = getPlan(planId)
    const providerPlanId = getProviderPlanId(planId)

    const effectiveAmount = isIntroductory && planConfig.introductoryPrice !== undefined
      ? planConfig.introductoryPrice
      : planConfig.price

    if (!this.razorpayClient) {
      // Mock/Test provider fallback
      const mockSubId = `sub_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      return {
        providerSubscriptionId: mockSubId,
        keyId: this.keyId,
        amount: effectiveAmount,
        currency: 'INR'
      }
    }

    try {
      const subscriptionPayload: Record<string, unknown> = {
        plan_id: providerPlanId,
        total_count: planId === 'PRO_ANNUAL' ? 10 : 120, // 10 years or 10 years monthly
        quantity: 1,
        customer_notify: 1,
        notes: {
          ...notes,
          planId,
          isIntroductory: isIntroductory ? 'true' : 'false'
        }
      }

      if (customerId) {
        subscriptionPayload.customer_id = customerId
      }

      if (offerId && isIntroductory) {
        subscriptionPayload.offer_id = offerId
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = await (this.razorpayClient as any).subscriptions.create(subscriptionPayload)

      return {
        providerSubscriptionId: sub.id,
        keyId: this.keyId,
        amount: effectiveAmount,
        currency: 'INR'
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new ProviderError(this.name, `Failed to create subscription: ${message}`, err)
    }
  }

  /**
   * Cancels a subscription in Razorpay.
   */
  async cancelSubscription(params: CancelSubscriptionInput): Promise<{ providerSubscriptionId: string; status: string }> {
    const { providerSubscriptionId, cancelAtPeriodEnd = true } = params

    if (!this.razorpayClient) {
      return { providerSubscriptionId, status: 'cancelled' }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (this.razorpayClient as any).subscriptions.cancel(
        providerSubscriptionId,
        cancelAtPeriodEnd ? 1 : 0
      )
      return { providerSubscriptionId: res.id, status: res.status || 'cancelled' }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new ProviderError(this.name, `Failed to cancel subscription: ${message}`, err)
    }
  }

  /**
   * Retrieves live subscription from Razorpay.
   */
  async retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscription> {
    if (!this.razorpayClient) {
      return {
        id: providerSubscriptionId,
        status: 'active',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        planId: 'plan_pro_monthly_test'
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = await (this.razorpayClient as any).subscriptions.fetch(providerSubscriptionId)
      return {
        id: sub.id,
        status: sub.status,
        currentStart: sub.current_start ? new Date(sub.current_start * 1000) : null,
        currentEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
        planId: sub.plan_id,
        chargeAt: sub.charge_at ? new Date(sub.charge_at * 1000) : null
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new ProviderError(this.name, `Failed to retrieve subscription: ${message}`, err)
    }
  }

  /**
   * Retrieves live payment from Razorpay.
   */
  async retrievePayment(providerPaymentId: string): Promise<ProviderPayment> {
    if (!this.razorpayClient) {
      return {
        id: providerPaymentId,
        amount: 29,
        currency: 'INR',
        status: 'captured',
        paidAt: new Date()
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pay = await (this.razorpayClient as any).payments.fetch(providerPaymentId)
      return {
        id: pay.id,
        amount: typeof pay.amount === 'number' ? pay.amount / 100 : 0,
        currency: pay.currency || 'INR',
        status: pay.status,
        method: pay.method,
        paidAt: pay.created_at ? new Date(pay.created_at * 1000) : new Date()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new ProviderError(this.name, `Failed to retrieve payment: ${message}`, err)
    }
  }

  /**
   * Cryptographically verifies webhook signature using timingSafeEqual HMAC sha256.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody) return false
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex')

      const sigBuffer = Buffer.from(signature)
      const expectedBuffer = Buffer.from(expectedSignature)

      if (sigBuffer.length !== expectedBuffer.length) {
        return false
      }

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    } catch (e) {
      console.error('Webhook signature verification exception:', e)
      return false
    }
  }

  /**
   * Normalizes Razorpay webhook payload into a canonical structure.
   */
  normalizeWebhookEvent(rawPayload: unknown): NormalizedWebhookEvent {
    const raw = rawPayload as Record<string, unknown>
    const eventType = typeof raw.event === 'string' ? raw.event : 'unknown'
    const payload = (raw.payload as Record<string, unknown>) || {}

    // Extract subscription entity
    const subEntity = (payload.subscription as Record<string, unknown>)?.entity as Record<string, unknown> | undefined
    // Extract payment entity
    const payEntity = (payload.payment as Record<string, unknown>)?.entity as Record<string, unknown> | undefined

    const providerSubscriptionId = typeof subEntity?.id === 'string' ? subEntity.id : undefined
    const providerPaymentId = typeof payEntity?.id === 'string' ? payEntity.id : undefined

    // Generate unique event ID if missing
    let eventId: string
    if (typeof raw.id === 'string') {
      eventId = raw.id
    } else if (raw.account_id && raw.event) {
      const subId = providerSubscriptionId || providerPaymentId || 'global'
      eventId = `${raw.account_id}_${raw.event}_${subId}_${raw.created_at || Date.now()}`
    } else {
      eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    }

    const currentPeriodStart = typeof subEntity?.current_start === 'number'
      ? new Date(subEntity.current_start * 1000)
      : null

    const currentPeriodEnd = typeof subEntity?.current_end === 'number'
      ? new Date(subEntity.current_end * 1000)
      : null

    const amount = typeof payEntity?.amount === 'number'
      ? payEntity.amount / 100
      : undefined

    const currency = typeof payEntity?.currency === 'string'
      ? payEntity.currency
      : 'INR'

    const method = typeof payEntity?.method === 'string'
      ? payEntity.method
      : undefined

    const notes = (subEntity?.notes || payEntity?.notes) as Record<string, string> | undefined

    return {
      eventId,
      eventType,
      occurredAt: typeof raw.created_at === 'number' ? new Date(raw.created_at * 1000) : new Date(),
      providerSubscriptionId,
      providerPaymentId,
      status: typeof subEntity?.status === 'string' ? subEntity.status : undefined,
      currentPeriodStart,
      currentPeriodEnd,
      amount,
      currency,
      method,
      notes,
      raw: rawPayload
    }
  }
}
