/**
 * lib/storage/userStorage.ts
 *
 * Canonical user-scoped client storage boundary for #57.
 *
 * Rules:
 * 1. Sensitive or user-specific client state (display names, birthdays, height,
 *    drafts, widgets) must be namespaced with the effective authenticated userId.
 * 2. On logout or account switch, user-scoped entries must be purged or invalidated.
 * 3. Fallback to guest scope only when no authenticated user is present.
 */

const USER_KEY_PREFIX = 'usr_store:'

export function getScopedKey(userId: string | null | undefined, key: string): string {
  const scope = userId ? `u:${userId}` : 'guest'
  return `${USER_KEY_PREFIX}${scope}:${key}`
}

export const LEGACY_UNSCOPED_KEYS = [
  'personal_display_name',
  'personal_birthday',
  'tracker-user-height',
  'personal_weekly_goal',
  'personal_dashboard_widgets',
  'personal_modules_visibility',
  'personal_enabled_leave_types',
  'personal_working_hours_start',
  'personal_working_hours_end',
  'personal_default_task_duration',
  'personal_accent_color',
  'personal_font_size',
  'personal_rounded_corners',
  'personal_animations',
  'calendar_default_view',
  'calendar_start_of_week'
] as const

/**
 * Migrates un-scoped legacy localStorage keys into the authenticated user's scoped namespace.
 * - Only runs when an authenticated userId is provided.
 * - Only migrates if the scoped key doesn't already have a value.
 * - Verifies the scoped value before deleting the legacy un-scoped key.
 * - Leaves other users' scoped namespaces untouched.
 */
export function migrateLegacyUserStorage(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    for (const key of LEGACY_UNSCOPED_KEYS) {
      const legacyVal = localStorage.getItem(key)
      if (legacyVal !== null) {
        const scopedKey = getScopedKey(userId, key)
        const existing = localStorage.getItem(scopedKey)
        if (existing === null) {
          localStorage.setItem(scopedKey, legacyVal)
          if (localStorage.getItem(scopedKey) === legacyVal) {
            localStorage.removeItem(key)
          }
        } else {
          // User already has a scoped value; safely purge the stale un-scoped legacy key
          localStorage.removeItem(key)
        }
      }
    }
  } catch {
    // QuotaExceeded or disabled localStorage safe handling
  }
}

export function getUserStorageItem(userId: string | null | undefined, key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const scopedKey = getScopedKey(userId, key)
    const val = localStorage.getItem(scopedKey)
    if (val !== null) return val

    // Safe migration on first access if key exists in legacy store and user is authenticated
    if (userId && (LEGACY_UNSCOPED_KEYS as readonly string[]).includes(key)) {
      const legacyVal = localStorage.getItem(key)
      if (legacyVal !== null) {
        localStorage.setItem(scopedKey, legacyVal)
        if (localStorage.getItem(scopedKey) === legacyVal) {
          localStorage.removeItem(key)
          return legacyVal
        }
      }
    }

    // UNSAFE FALLBACK REMOVED: Never return raw un-scoped localStorage.getItem(key)
    return null
  } catch {
    return null
  }
}

export function setUserStorageItem(userId: string | null | undefined, key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    const scopedKey = getScopedKey(userId, key)
    localStorage.setItem(scopedKey, value)
  } catch {
    // QuotaExceeded or disabled localStorage safe handling
  }
}

export function removeUserStorageItem(userId: string | null | undefined, key: string): void {
  if (typeof window === 'undefined') return
  try {
    const scopedKey = getScopedKey(userId, key)
    localStorage.removeItem(scopedKey)
  } catch {
    // Safe no-op
  }
}

/**
 * Purges all storage entries associated with a specific user or guest session.
 * Used during logout to prevent cross-account data leakage.
 */
export function purgeUserStorage(userId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const prefix = userId ? `${USER_KEY_PREFIX}u:${userId}:` : USER_KEY_PREFIX
    const toRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) {
        toRemove.push(k)
      }
    }

    // Also purge legacy un-scoped personal keys to guarantee clean slate
    const legacyKeys = [
      'personal_display_name',
      'personal_birthday',
      'tracker-user-height',
      'personal_weekly_goal',
      'personal_dashboard_widgets',
      'personal_modules_visibility',
      'personal_enabled_leave_types',
      'personal_working_hours_start',
      'personal_working_hours_end',
      'personal_default_task_duration',
      'personal_accent_color',
      'personal_font_size',
      'personal_rounded_corners',
      'personal_animations',
      'calendar_default_view',
      'calendar_start_of_week'
    ]

    for (const k of toRemove) {
      localStorage.removeItem(k)
    }

    for (const lk of legacyKeys) {
      localStorage.removeItem(lk)
    }
  } catch {
    // Safe no-op
  }
}
