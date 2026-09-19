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
import { getPlan } from '../plans'
import crypto from 'crypto'

export class MockBillingProvider implements IBillingProvider {
  public readonly name = 'RAZORPAY'
  public mockKeyId = 'rzp_test_mock_key_id'
  public mockWebhookSecret = 'mock_webhook_secret_key'

  public customers: Map<string, { id: string; email?: string | null; name?: string | null }> = new Map()
  public subscriptions: Map<string, ProviderSubscription & { isIntroductory?: boolean }> = new Map()
  public payments: Map<string, ProviderPayment> = new Map()

  async createCustomer(params: CreateCustomerInput): Promise<CustomerResult> {
    const customerId = `cust_mock_${params.userId.slice(0, 12)}`
    this.customers.set(customerId, {
      id: customerId,
      email: params.email,
      name: params.name
    })
    return { providerCustomerId: customerId }
  }

  async retrieveCustomer(providerCustomerId: string): Promise<CustomerResult | null> {
    if (!providerCustomerId || providerCustomerId.startsWith('cust_mock_stale') || providerCustomerId === 'cust_deleted_on_razorpay' || providerCustomerId === 'cust_not_found') {
      return null
    }
    const cust = this.customers.get(providerCustomerId)
    if (cust) {
      return { providerCustomerId: cust.id }
    }
    return { providerCustomerId }
  }

  async createSubscription(params: CreateSubscriptionInput): Promise<SubscriptionCheckoutResult> {
    const planConfig = getPlan(params.planId)
    const effectiveAmount = params.isIntroductory && planConfig.introductoryPrice !== undefined
      ? planConfig.introductoryPrice
      : planConfig.price

    const subId = `sub_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    this.subscriptions.set(subId, {
      id: subId,
      status: 'created',
      currentStart: new Date(),
      currentEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planId: params.planId,
      isIntroductory: params.isIntroductory
    })

    return {
      providerSubscriptionId: subId,
      keyId: this.mockKeyId,
      amount: effectiveAmount,
      currency: 'INR'
    }
  }

  async cancelSubscription(params: CancelSubscriptionInput): Promise<{ providerSubscriptionId: string; status: string }> {
    const sub = this.subscriptions.get(params.providerSubscriptionId)
    if (sub) {
      sub.status = 'cancelled'
    }
    return {
      providerSubscriptionId: params.providerSubscriptionId,
      status: 'cancelled'
    }
  }

  async changeSubscriptionPlan(params: {
    providerSubscriptionId: string
    targetPlanId: string
    scheduleChangeAt?: 'now' | 'cycle_end'
  }): Promise<ProviderSubscription> {
    const sub = this.subscriptions.get(params.providerSubscriptionId)
    if (sub) {
      sub.planId = params.targetPlanId
      return sub
    }
    return {
      id: params.providerSubscriptionId,
      status: 'active',
      currentStart: new Date(),
      currentEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planId: params.targetPlanId
    }
  }

  async retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscription> {
    const sub = this.subscriptions.get(providerSubscriptionId)
    if (sub) {
      return sub
    }
    return {
      id: providerSubscriptionId,
      status: 'active',
      currentStart: new Date(),
      currentEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planId: 'plan_pro_monthly_test'
    }
  }

  async retrievePayment(providerPaymentId: string): Promise<ProviderPayment> {
    const pay = this.payments.get(providerPaymentId)
    if (pay) {
      return pay
    }
    return {
      id: providerPaymentId,
      amount: 29,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      paidAt: new Date()
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody) return false
    try {
      const expected = crypto
        .createHmac('sha256', this.mockWebhookSecret)
        .update(rawBody)
        .digest('hex')
      return signature === expected
    } catch {
      return false
    }
  }

  normalizeWebhookEvent(rawPayload: unknown): NormalizedWebhookEvent {
    const raw = rawPayload as Record<string, unknown>
    const eventType = typeof raw.event === 'string' ? raw.event : 'unknown'
    const payload = (raw.payload as Record<string, unknown>) || {}

    const subEntity = (payload.subscription as Record<string, unknown>)?.entity as Record<string, unknown> | undefined
    const payEntity = (payload.payment as Record<string, unknown>)?.entity as Record<string, unknown> | undefined

    const providerSubscriptionId = typeof subEntity?.id === 'string' ? subEntity.id : undefined
    const providerPaymentId = typeof payEntity?.id === 'string' ? payEntity.id : undefined

    const eventId = typeof raw.id === 'string' ? raw.id : `evt_${Date.now()}`

    return {
      eventId,
      eventType,
      occurredAt: new Date(),
      providerSubscriptionId,
      providerPaymentId,
      status: typeof subEntity?.status === 'string' ? subEntity.status : undefined,
      currentPeriodStart: subEntity?.current_start ? new Date(Number(subEntity.current_start) * 1000) : null,
      currentPeriodEnd: subEntity?.current_end ? new Date(Number(subEntity.current_end) * 1000) : null,
      amount: typeof payEntity?.amount === 'number' ? payEntity.amount / 100 : undefined,
      currency: typeof payEntity?.currency === 'string' ? payEntity.currency : 'INR',
      method: typeof payEntity?.method === 'string' ? payEntity.method : undefined,
      raw: rawPayload
    }
  }
}
