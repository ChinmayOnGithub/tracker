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
  SubscriptionCheckoutResult,
  PlanId
} from '../types'
import { getPlan, getProviderPlanId } from '../plans'
import { ProviderConfigurationError, ProviderError } from '../errors'

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const rzpErr = err as {
      error?: { description?: string; message?: string }
      description?: string
      message?: string
    }
    if (rzpErr.error?.description) return rzpErr.error.description
    if (rzpErr.error?.message) return rzpErr.error.message
    if (rzpErr.description) return rzpErr.description
    if (rzpErr.message) return rzpErr.message
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

export class RazorpayProvider implements IBillingProvider {
  public readonly name = 'RAZORPAY'
  private razorpayClient: Razorpay | null = null
  private keyId: string
  private keySecret: string
  private webhookSecret: string

  constructor(options?: { keyId?: string; keySecret?: string; webhookSecret?: string }) {
    if (options !== undefined) {
      this.keyId = options.keyId !== undefined ? options.keyId : (process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '')
      this.keySecret = options.keySecret !== undefined ? options.keySecret : (process.env.RAZORPAY_KEY_SECRET || '')
      this.webhookSecret = options.webhookSecret !== undefined ? options.webhookSecret : (process.env.RAZORPAY_WEBHOOK_SECRET || '')
    } else {
      this.keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''
      this.keySecret = process.env.RAZORPAY_KEY_SECRET || ''
      this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
    }

    if (
      this.keyId &&
      this.keySecret &&
      !this.keyId.includes('placeholder') &&
      !this.keySecret.includes('placeholder')
    ) {
      try {
        this.razorpayClient = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret
        })
      } catch (e) {
        console.error('Razorpay SDK initialization failed:', e)
        this.razorpayClient = null
      }
    }
  }

  /**
   * Returns whether provider is using Razorpay Test Mode keys (rzp_test_).
   */
  isTestMode(): boolean {
    return this.keyId.startsWith('rzp_test_')
  }

  /**
   * Asserts environment safety: enforces live keys in strict production environments (#52).
   */
  assertEnvironmentSafety(): void {
    if (process.env.NODE_ENV === 'production' && process.env.RAZORPAY_ENFORCE_LIVE === 'true') {
      if (this.isTestMode()) {
        throw new ProviderConfigurationError(
          'CRITICAL: Production billing is configured with a Razorpay Test Mode key (rzp_test_). Live keys (rzp_live_) are strictly required when RAZORPAY_ENFORCE_LIVE=true.'
        )
      }
    }
  }

  /**
   * Returns whether provider is properly configured with live credentials.
   */
  isConfigured(): boolean {
    return !!this.razorpayClient
  }

  /**
   * Creates or resolves a customer in Razorpay.
   */
  async createCustomer(params: CreateCustomerInput): Promise<CustomerResult> {
    this.assertEnvironmentSafety()
    const { userId, email, name } = params

    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot create customer on payment gateway.'
      )
    }

    const customerEmail = email || `${userId}@example.tracker.local`
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customer = await (this.razorpayClient as any).customers.create({
        name: name || `User ${userId.slice(0, 8)}`,
        email: customerEmail,
        notes: { userId }
      })
      return { providerCustomerId: customer.id }
    } catch (err: unknown) {
      const message = extractErrorMessage(err)
      if (message.toLowerCase().includes('customer already exists')) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = await (this.razorpayClient as any).customers.all({ count: 50 })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = list.items?.find((c: any) => c.email === customerEmail)
          if (existing?.id) {
            return { providerCustomerId: existing.id }
          }
        } catch {
          // fall through to throw original error
        }
      }
      throw new ProviderError(this.name, `Failed to create customer: ${message}`, err)
    }
  }

  /**
   * Retrieves an existing customer from Razorpay, returning null if not found.
   */
  async retrieveCustomer(providerCustomerId: string): Promise<CustomerResult | null> {
    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot retrieve customer on payment gateway.'
      )
    }

    if (!providerCustomerId || providerCustomerId.startsWith('cust_mock_')) {
      return null
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cust = await (this.razorpayClient as any).customers.fetch(providerCustomerId)
      if (cust && cust.id) {
        return { providerCustomerId: cust.id }
      }
      return null
    } catch (err: unknown) {
      const message = extractErrorMessage(err)
      const statusCode = (err as { statusCode?: number })?.statusCode
      // If customer does not exist in Razorpay, return null so caller can heal/recreate it
      if (
        message.toLowerCase().includes('does not exist') ||
        message.toLowerCase().includes('could not be found') ||
        statusCode === 400 ||
        statusCode === 404
      ) {
        return null
      }
      throw new ProviderError(this.name, `Failed to retrieve customer: ${message}`, err)
    }
  }

  /**
   * Creates a recurring subscription in Razorpay with safe checkout details.
   */
  async createSubscription(params: CreateSubscriptionInput): Promise<SubscriptionCheckoutResult> {
    this.assertEnvironmentSafety()
    const { planId, customerId, offerId, isIntroductory, notes } = params

    // Validate credentials FIRST — before any plan ID resolution.
    // This ensures the canonical error is always "Razorpay credentials are not configured"
    // regardless of which env vars are also missing (#52).
    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot create subscription on payment gateway.'
      )
    }

    const planConfig = getPlan(planId)
    const providerPlanId = getProviderPlanId(planId)

    if (isIntroductory && !offerId) {
      throw new ProviderConfigurationError(
        'Introductory pricing requires a configured RAZORPAY_OFFER_INTRODUCTORY offer ID, but none was found.'
      )
    }

    const effectiveAmount = isIntroductory && planConfig.introductoryPrice !== undefined
      ? planConfig.introductoryPrice
      : planConfig.price

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

      // Only pass customer_id if it is a real verified provider customer ID
      if (customerId && !customerId.startsWith('cust_mock_')) {
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
      const message = extractErrorMessage(err)
      throw new ProviderError(this.name, `Failed to create subscription: ${message}`, err)
    }
  }

  /**
   * Cancels a subscription in Razorpay.
   */
  async cancelSubscription(params: CancelSubscriptionInput): Promise<{ providerSubscriptionId: string; status: string }> {
    const { providerSubscriptionId, cancelAtPeriodEnd = true } = params

    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot cancel subscription on payment gateway.'
      )
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (this.razorpayClient as any).subscriptions.cancel(
        providerSubscriptionId,
        cancelAtPeriodEnd ? 1 : 0
      )
      return { providerSubscriptionId: res.id, status: res.status || 'cancelled' }
    } catch (err: unknown) {
      const message = extractErrorMessage(err)
      throw new ProviderError(this.name, `Failed to cancel subscription: ${message}`, err)
    }
  }

  /**
   * Safely updates an existing subscription's plan in Razorpay without creating duplicates.
   */
  async changeSubscriptionPlan(params: {
    providerSubscriptionId: string
    targetPlanId: PlanId
    scheduleChangeAt?: 'now' | 'cycle_end'
  }): Promise<ProviderSubscription> {
    this.assertEnvironmentSafety()
    const { providerSubscriptionId, targetPlanId, scheduleChangeAt = 'now' } = params

    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot update subscription on payment gateway.'
      )
    }

    const providerPlanId = getProviderPlanId(targetPlanId)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = await (this.razorpayClient as any).subscriptions.update(providerSubscriptionId, {
        plan_id: providerPlanId,
        schedule_change_at: scheduleChangeAt,
        customer_notify: 1
      })

      return {
        id: sub.id,
        status: sub.status,
        currentStart: sub.current_start ? new Date(sub.current_start * 1000) : null,
        currentEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
        planId: targetPlanId,
        cancelAtPeriodEnd: Boolean(sub.end_at && sub.status === 'cancelled')
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err)
      throw new ProviderError(this.name, `Failed to update subscription plan: ${message}`, err)
    }
  }

  /**
   * Retrieves live subscription from Razorpay.
   */
  async retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscription> {
    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot retrieve subscription from payment gateway.'
      )
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
      const message = extractErrorMessage(err)
      throw new ProviderError(this.name, `Failed to retrieve subscription: ${message}`, err)
    }
  }

  /**
   * Retrieves live payment from Razorpay.
   */
  async retrievePayment(providerPaymentId: string): Promise<ProviderPayment> {
    if (!this.razorpayClient) {
      throw new ProviderConfigurationError(
        'Razorpay credentials are not configured. Cannot retrieve payment from payment gateway.'
      )
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
        paidAt: pay.status === 'captured' ? (pay.created_at ? new Date(pay.created_at * 1000) : null) : null
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err)
      throw new ProviderError(this.name, `Failed to retrieve payment: ${message}`, err)
    }
  }

  /**
   * Cryptographically verifies webhook signature using timingSafeEqual HMAC sha256.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody || !this.webhookSecret || this.webhookSecret.includes('placeholder')) {
      return false
    }
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
   * Cryptographically verifies subscription checkout signature (subscription_id|payment_id).
   */
  verifySubscriptionPaymentSignature(subscriptionId: string, paymentId: string, signature: string): boolean {
    if (!subscriptionId || !paymentId || !signature || !this.keySecret || this.keySecret.includes('placeholder')) {
      return false
    }
    try {
      // Official Razorpay standard: payment_id + '|' + subscription_id
      const payloadPrimary = `${paymentId}|${subscriptionId}`
      const expectedPrimary = crypto
        .createHmac('sha256', this.keySecret)
        .update(payloadPrimary)
        .digest('hex')

      const sigBuffer = Buffer.from(signature)
      const expectedBufferPrimary = Buffer.from(expectedPrimary)

      if (sigBuffer.length === expectedBufferPrimary.length && crypto.timingSafeEqual(sigBuffer, expectedBufferPrimary)) {
        return true
      }

      // Fallback for legacy order subscriptionId|paymentId
      const payloadAlt = `${subscriptionId}|${paymentId}`
      const expectedAlt = crypto
        .createHmac('sha256', this.keySecret)
        .update(payloadAlt)
        .digest('hex')
      const expectedBufferAlt = Buffer.from(expectedAlt)

      if (sigBuffer.length === expectedBufferAlt.length && crypto.timingSafeEqual(sigBuffer, expectedBufferAlt)) {
        return true
      }

      return false
    } catch (e) {
      console.error('Checkout signature verification exception:', e)
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

    const payNotes = payEntity?.notes as Record<string, unknown> | undefined
    const providerSubscriptionId =
      (typeof subEntity?.id === 'string' ? subEntity.id : undefined) ||
      (typeof payEntity?.subscription_id === 'string' ? payEntity.subscription_id : undefined) ||
      (typeof payNotes?.subscription_id === 'string' ? (payNotes.subscription_id as string) : undefined) ||
      (typeof payNotes?.subscriptionId === 'string' ? (payNotes.subscriptionId as string) : undefined)
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
