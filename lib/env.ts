const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_ENCRYPTION_KEY',
  'NEXT_PUBLIC_SITE_URL'
] as const

export interface Env {
  DATABASE_URL: string
  DIRECT_URL: string
  AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_OAUTH_ENCRYPTION_KEY: string
  NEXT_PUBLIC_SITE_URL: string
  NODE_ENV: 'development' | 'production' | 'test'
  SYNC_SECRET?: string
  RAZORPAY_KEY_ID?: string
  RAZORPAY_KEY_SECRET?: string
  RAZORPAY_WEBHOOK_SECRET?: string
  NEXT_PUBLIC_RAZORPAY_KEY_ID?: string
  RAZORPAY_PLAN_PRO_MONTHLY?: string
  RAZORPAY_PLAN_PRO_ANNUAL?: string
  RAZORPAY_OFFER_INTRODUCTORY?: string
}

function validateEnv(): Env {
  const isTest = process.env.NODE_ENV === 'test'
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  const missing: string[] = []

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      if (!isTest && !isBuild) {
        missing.push(key)
      }
    }
  }

  if (missing.length > 0) {
    const errorMsg = `❌ Missing required environment variables: ${missing.join(', ')}`

    if (process.env.NODE_ENV === 'production') {
      // In production, crash immediately — never run with missing secrets
      throw new Error(errorMsg)
    }

    // In development, warn loudly but allow startup with fallbacks
    console.error('='.repeat(70))
    console.error(errorMsg)
    console.error('The application will use INSECURE fallback values.')
    console.error('Add these variables to your .env file before deploying.')
    console.error('='.repeat(70))
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
    DIRECT_URL: process.env.DIRECT_URL || 'postgresql://localhost:5432/test',
    AUTH_SECRET: process.env.AUTH_SECRET || 'INSECURE-dev-fallback-auth-secret-do-not-deploy',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret',
    GOOGLE_OAUTH_ENCRYPTION_KEY: process.env.GOOGLE_OAUTH_ENCRYPTION_KEY || 'INSECURE-dev-fallback-encryption-key-32c',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    SYNC_SECRET: process.env.SYNC_SECRET,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    RAZORPAY_PLAN_PRO_MONTHLY: process.env.RAZORPAY_PLAN_PRO_MONTHLY,
    RAZORPAY_PLAN_PRO_ANNUAL: process.env.RAZORPAY_PLAN_PRO_ANNUAL,
    RAZORPAY_OFFER_INTRODUCTORY: process.env.RAZORPAY_OFFER_INTRODUCTORY
  }
}

export const env = validateEnv()

/**
 * Returns whether Google OAuth is fully configured with production-ready credentials.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    !env.GOOGLE_CLIENT_ID.includes('test-client-id')
  )
}

/**
 * Returns whether Razorpay payments are fully configured and operational.
 */
export function isRazorpayConfigured(): boolean {
  const hasKeys = Boolean(
    (env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) &&
    env.RAZORPAY_KEY_SECRET &&
    !env.RAZORPAY_KEY_ID?.includes('placeholder')
  )
  const hasWebhook = Boolean(env.RAZORPAY_WEBHOOK_SECRET)
  const hasPlans = Boolean(env.RAZORPAY_PLAN_PRO_MONTHLY && env.RAZORPAY_PLAN_PRO_ANNUAL)

  return hasKeys && hasWebhook && hasPlans
}

/**
 * Returns whether Cloudflare Turnstile bot detection is fully configured.
 */
export function isTurnstileConfigured(): boolean {
  const siteKey =
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SITE_KEY
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY

  const hasRealSite = Boolean(siteKey && !siteKey.startsWith('1x00000000000000000000AA'))
  const hasRealSecret = Boolean(secretKey && !secretKey.startsWith('1x00000000000000000000'))
  return hasRealSite && hasRealSecret
}
