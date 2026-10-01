const CORE_REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET'
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
  VAULT_ENCRYPTION_KEY?: string
}

function validateEnv(): Env {
  const isTest = process.env.NODE_ENV === 'test'
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  const missingCore: string[] = []

  for (const key of CORE_REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      if (!isTest && !isBuild) {
        missingCore.push(key)
      }
    }
  }

  if (missingCore.length > 0) {
    const errorMsg = `❌ Missing required core environment variables: ${missingCore.join(', ')}`

    if (process.env.NODE_ENV === 'production') {
      // In production, crash immediately on missing core secrets
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
    DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
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
    RAZORPAY_OFFER_INTRODUCTORY: process.env.RAZORPAY_OFFER_INTRODUCTORY,
    VAULT_ENCRYPTION_KEY: process.env.VAULT_ENCRYPTION_KEY
  }
}

export const env = validateEnv()

export interface ConfigHealthReport {
  isCoreHealthy: boolean
  missingCoreVars: string[]
  features: {
    googleOAuth: { configured: boolean; missingVars: string[] }
    billing: { configured: boolean; missingVars: string[] }
    turnstile: { configured: boolean; missingVars: string[] }
    storage: { configured: boolean; missingVars: string[] }
    vault: { configured: boolean; missingVars: string[] }
  }
}

/**
 * Authoritative production configuration health check.
 * Clearly separates REQUIRED CORE CONFIG from OPTIONAL FEATURE CONFIG.
 */
export function getConfigurationHealth(): ConfigHealthReport {
  const missingCore = CORE_REQUIRED_ENV_VARS.filter(key => !process.env[key])
  
  const googleMissing: string[] = []
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('test-client-id')) googleMissing.push('GOOGLE_CLIENT_ID')
  if (!process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET.includes('test-client-secret')) googleMissing.push('GOOGLE_CLIENT_SECRET')
  if (!process.env.GOOGLE_OAUTH_ENCRYPTION_KEY || process.env.GOOGLE_OAUTH_ENCRYPTION_KEY.includes('INSECURE')) googleMissing.push('GOOGLE_OAUTH_ENCRYPTION_KEY')

  const billingMissing: string[] = []
  if (!process.env.RAZORPAY_KEY_ID && !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) billingMissing.push('RAZORPAY_KEY_ID')
  if (!process.env.RAZORPAY_KEY_SECRET) billingMissing.push('RAZORPAY_KEY_SECRET')
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) billingMissing.push('RAZORPAY_WEBHOOK_SECRET')
  if (!process.env.RAZORPAY_PLAN_PRO_MONTHLY) billingMissing.push('RAZORPAY_PLAN_PRO_MONTHLY')
  if (!process.env.RAZORPAY_PLAN_PRO_ANNUAL) billingMissing.push('RAZORPAY_PLAN_PRO_ANNUAL')

  const turnstileMissing: string[] = []
  if (!process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY && !process.env.CLOUDFLARE_TURNSTILE_SITE_KEY) turnstileMissing.push('CLOUDFLARE_TURNSTILE_SITE_KEY')
  if (!process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY) turnstileMissing.push('CLOUDFLARE_TURNSTILE_SECRET_KEY')

  const storageMissing: string[] = []
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) storageMissing.push('SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_ANON_KEY) storageMissing.push('SUPABASE_KEY')

  const vaultMissing: string[] = []
  if (!process.env.VAULT_ENCRYPTION_KEY) vaultMissing.push('VAULT_ENCRYPTION_KEY')
  storageMissing.forEach(v => vaultMissing.push(v))

  return {
    isCoreHealthy: missingCore.length === 0,
    missingCoreVars: missingCore,
    features: {
      googleOAuth: { configured: googleMissing.length === 0, missingVars: googleMissing },
      billing: { configured: billingMissing.length === 0, missingVars: billingMissing },
      turnstile: { configured: turnstileMissing.length === 0, missingVars: turnstileMissing },
      storage: { configured: storageMissing.length === 0, missingVars: storageMissing },
      vault: { configured: vaultMissing.length === 0, missingVars: vaultMissing }
    }
  }
}

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

/**
 * Returns whether durable storage is configured.
 */
export function isStorageConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY
  return Boolean(url && key)
}

/**
 * Returns whether Vault is fully configured with dedicated encryption key and durable storage.
 */
export function isVaultConfigured(): boolean {
  const hasKey = Boolean(process.env.VAULT_ENCRYPTION_KEY || env.VAULT_ENCRYPTION_KEY)
  const hasStorage = isStorageConfigured()
  if (process.env.NODE_ENV === 'production') {
    return hasKey && hasStorage
  }
  return true
}

