import { IBillingProvider } from './IBillingProvider'
import { RazorpayProvider } from './RazorpayProvider'

export * from './IBillingProvider'
export * from './RazorpayProvider'

let defaultProvider: IBillingProvider | null = null

export function getBillingProvider(providerName = 'RAZORPAY'): IBillingProvider {
  if (providerName.toUpperCase() === 'RAZORPAY') {
    if (!defaultProvider) {
      defaultProvider = new RazorpayProvider()
    }
    return defaultProvider
  }
  // Fallback to Razorpay
  if (!defaultProvider) {
    defaultProvider = new RazorpayProvider()
  }
  return defaultProvider
}

/**
 * Allows overriding or resetting the billing provider instance (useful for unit tests)
 */
export function setBillingProvider(provider: IBillingProvider | null): void {
  defaultProvider = provider
}
