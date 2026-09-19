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

export interface IBillingProvider {
  readonly name: string

  /**
   * Creates or retrieves a customer identifier on the provider.
   */
  createCustomer(params: CreateCustomerInput): Promise<CustomerResult>

  /**
   * Retrieves a customer from the provider, or returns null if not found.
   */
  retrieveCustomer?(providerCustomerId: string): Promise<CustomerResult | null>

  /**
   * Creates a recurring subscription on the provider with safe checkout tokens.
   */
  createSubscription(params: CreateSubscriptionInput): Promise<SubscriptionCheckoutResult>

  /**
   * Cancels a subscription on the provider, optionally scheduling it for period end.
   */
  cancelSubscription(params: CancelSubscriptionInput): Promise<{ providerSubscriptionId: string; status: string }>

  /**
   * Retrieves live subscription details from the provider.
   */
  retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>

  /**
   * Retrieves live payment details from the provider.
   */
  retrievePayment(providerPaymentId: string): Promise<ProviderPayment>

  /**
   * Cryptographically verifies the webhook signature using timing-safe comparisons.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean

  /**
   * Cryptographically verifies checkout completion signature (e.g. subscription_id|payment_id).
   */
  verifySubscriptionPaymentSignature?(subscriptionId: string, paymentId: string, signature: string): boolean

  /**
   * Normalizes provider-specific webhook payloads into canonical application events.
   */
  normalizeWebhookEvent(rawPayload: unknown): NormalizedWebhookEvent
}
