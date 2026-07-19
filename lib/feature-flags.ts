/**
 * Feature Flags Configuration
 */

export const FEATURE_FLAGS = {
  SYNC_ENGINE_ENABLED: process.env.NEXT_PUBLIC_SYNC_ENGINE_ENABLED === 'true' || false
} as const

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag]
}