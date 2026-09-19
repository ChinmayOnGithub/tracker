export class BillingError extends Error {
  public code: string
  constructor(message: string, code = 'BILLING_ERROR') {
    super(message)
    this.name = 'BillingError'
    this.code = code
  }
}

export class IntroductoryOfferIneligibleError extends BillingError {
  constructor(message = 'Account has already consumed the introductory first-month offer') {
    super(message, 'INTRODUCTORY_OFFER_INELIGIBLE')
    this.name = 'IntroductoryOfferIneligibleError'
  }
}

export class WebhookSignatureVerificationError extends BillingError {
  constructor(message = 'Invalid webhook signature') {
    super(message, 'WEBHOOK_SIGNATURE_INVALID')
    this.name = 'WebhookSignatureVerificationError'
  }
}

export class SubscriptionNotFoundError extends BillingError {
  constructor(message = 'Subscription not found') {
    super(message, 'SUBSCRIPTION_NOT_FOUND')
    this.name = 'SubscriptionNotFoundError'
  }
}

export class InvalidPlanError extends BillingError {
  constructor(planId: string) {
    super(`Invalid billing plan requested: ${planId}`, 'INVALID_PLAN')
    this.name = 'InvalidPlanError'
  }
}

export class ProviderError extends BillingError {
  public provider: string
  public originalError?: unknown

  constructor(provider: string, message: string, originalError?: unknown) {
    super(`[${provider}] ${message}`, 'PROVIDER_ERROR')
    this.name = 'ProviderError'
    this.provider = provider
    this.originalError = originalError
  }
}
