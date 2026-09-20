import { db } from '@/lib/db'

export class UserTimezoneService {
  /**
   * Retrieves the configured IANA timezone for a user.
   * If not explicitly configured, falls back to 'UTC'.
   */
  static async getUserTimezone(userId: string): Promise<string> {
    try {
      const setting = await db.userSetting.findUnique({
        where: {
          userId_module: {
            userId,
            module: 'PREFERENCES',
          },
        },
      })

      const config = setting?.config as { timezone?: string } | null
      if (config?.timezone && this.isValidTimezone(config.timezone)) {
        return config.timezone
      }
    } catch {
      // Fallback on error
    }

    return 'UTC'
  }

  /**
   * Saves the user's configured IANA timezone.
   */
  static async setUserTimezone(userId: string, timezone: string): Promise<void> {
    if (!this.isValidTimezone(timezone)) {
      throw new Error(`Invalid IANA timezone: ${timezone}`)
    }

    await db.userSetting.upsert({
      where: {
        userId_module: {
          userId,
          module: 'PREFERENCES',
        },
      },
      update: {
        config: { timezone },
      },
      create: {
        userId,
        module: 'PREFERENCES',
        config: { timezone },
      },
    })
  }

  /**
   * Validates if a string is a valid IANA timezone name.
   */
  static isValidTimezone(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') return false
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
      return true
    } catch {
      return false
    }
  }

  /**
   * Returns a canonical calendar day period string 'YYYY-MM-DD' for a given instant
   * in the specified user timezone.
   */
  static getDailyPeriodKey(timezone: string, date: Date = new Date()): string {
    const tz = this.isValidTimezone(timezone) ? timezone : 'UTC'
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }

  /**
   * Convenience helper to get the current period key directly for a user.
   */
  static async getPeriodKeyForUser(userId: string, date: Date = new Date()): Promise<string> {
    const timezone = await this.getUserTimezone(userId)
    return this.getDailyPeriodKey(timezone, date)
  }
}
