'use client'

import { useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'theme'
const THEME_EVENT_NAME = 'tracker_theme_changed'

/**
 * Resolves whether the effective theme is dark given the mode and system preference.
 */
export function getIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return true // Default dark for tracker
}

/**
 * Reads stored theme preference from localStorage with fallback to 'system'.
 */
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // Quota or access error safe fallback
  }
  return 'system'
}

/**
 * Applies the theme to the DOM documentElement and synchronizes cookies/localStorage.
 */
export function applyTheme(mode: ThemeMode): boolean {
  if (typeof window === 'undefined') return false

  const isDark = getIsDark(mode)

  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
    document.cookie = `theme=${mode}; path=/; max-age=31536000; SameSite=Lax`
  } catch {
    // Storage access error safe fallback
  }

  // Broadcast to other components in the same window
  window.dispatchEvent(new CustomEvent(THEME_EVENT_NAME, { detail: { mode, isDark } }))

  return isDark
}

/**
 * React hook to read and change the active theme live across all components.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme)
  const [isDark, setIsDarkState] = useState<boolean>(() => getIsDark(getStoredTheme()))

  useEffect(() => {
    // Handle custom theme changes across components
    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: ThemeMode; isDark: boolean }>
      if (customEvent.detail) {
        setThemeState(customEvent.detail.mode)
        setIsDarkState(customEvent.detail.isDark)
      }
    }

    // Handle cross-tab storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const newMode = (e.newValue as ThemeMode) || 'system'
        setThemeState(newMode)
        setIsDarkState(applyTheme(newMode))
      }
    }

    // Handle OS system preference changes live when in 'system' mode
    let mediaQuery: MediaQueryList | null = null
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (getStoredTheme() === 'system') {
        if (e.matches) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        setIsDarkState(e.matches)
      }
    }

    if (window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', handleMediaChange)
    }

    window.addEventListener(THEME_EVENT_NAME, handleCustomChange)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener(THEME_EVENT_NAME, handleCustomChange)
      window.removeEventListener('storage', handleStorageChange)
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleMediaChange)
      }
    }
  }, [])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    const resolvedDark = applyTheme(mode)
    setIsDarkState(resolvedDark)
  }, [])

  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode = isDark ? 'light' : 'dark'
    setTheme(nextMode)
  }, [isDark, setTheme])

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  }
}
