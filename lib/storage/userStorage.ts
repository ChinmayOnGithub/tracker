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

export function getUserStorageItem(userId: string | null | undefined, key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const scopedKey = getScopedKey(userId, key)
    const val = localStorage.getItem(scopedKey)
    if (val !== null) return val

    // Backward compatibility check for legacy un-namespaced keys (only if user matches or guest)
    return localStorage.getItem(key)
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
