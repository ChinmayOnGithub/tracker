import { cache } from 'react'
import { BillingService } from './BillingService'
import { FeatureKey, LimitKey, UserEntitlements } from '../billing/types'

export class EntitlementService {
  /**
   * Retrieves authoritative server-side entitlements for a given user.
   * Scoped per server render request using React.cache().
   */
  static getEntitlements = cache(async (userId: string): Promise<UserEntitlements> => {
    return await BillingService.getEntitlements(userId)
  })

  /**
   * Checks whether a user has an active Pro subscription or valid grace period.
   */
  static async isPro(userId: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(userId)
    return entitlements.isPro
  }

  /**
   * Checks whether a user is entitled to a specific feature.
   * Subscription -> Plan -> Product Tier -> Entitlements -> Feature Access
   */
  static async hasFeature(userId: string, feature: FeatureKey | keyof UserEntitlements['features']): Promise<boolean> {
    const entitlements = await this.getEntitlements(userId)
    return !!entitlements.features[feature as keyof typeof entitlements.features]
  }


  /**
   * Retrieves quantitative limit for a specific resource under the user's plan.
   */
  static async getLimit(userId: string, limit: LimitKey): Promise<number> {
    const entitlements = await this.getEntitlements(userId)
    if (limit === 'active_activities' || limit === 'activities_active') {
      return entitlements.limits.activities_active ?? entitlements.limits.active_activities ?? 10
    }
    if (limit === 'tasks_created_daily') {
      return entitlements.limits.tasks_created_daily ?? 50
    }
    if (limit === 'calendar_events_created_daily') {
      return entitlements.limits.calendar_events_created_daily ?? 5
    }
    return entitlements.limits[limit] ?? 0
  }

  /**
   * Validates document vault upload limits against the user's plan.
   */
  static async checkVaultCapacity(
    userId: string,
    currentFileCount: number
  ): Promise<{ allowed: boolean; maxFiles: number; isPro: boolean }> {
    const entitlements = await this.getEntitlements(userId)
    const maxFiles = entitlements.limits.vault_storage
    const allowed = currentFileCount < maxFiles
    return {
      allowed,
      maxFiles,
      isPro: entitlements.isPro
    }
  }
}
