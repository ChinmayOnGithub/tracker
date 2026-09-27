import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { getLoginSecuritySettingsAction } from '@/app/actions/auth'
import { getIsDark, getStoredTheme, applyTheme } from '@/lib/theme/useTheme'

describe('Turnstile Security Policy & Login Protection', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('in development, enables Turnstile with test sitekey for local testing', async () => {
    delete (process.env as Record<string, string | undefined>).NODE_ENV
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
    delete process.env.CLOUDFLARE_TURNSTILE_SITE_KEY

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    // In dev without keys, should still return test site key
    expect(settings.turnstileSiteKey).toBe('1x00000000000000000000AA')
  })

  it('in production, disables Turnstile if no real key is configured to prevent login lockout', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
    delete process.env.CLOUDFLARE_TURNSTILE_SITE_KEY

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    // Must be disabled so users are not trapped in verification loops
    expect(settings.humanVerificationEnabled).toBe(false)
  })

  it('in production, enables Turnstile when real sitekey is configured', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY = '0x4AAAAAAABBBBBBBBBBBBBB'

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    expect(settings.humanVerificationEnabled).toBe(true)
    expect(settings.turnstileSiteKey).toBe('0x4AAAAAAABBBBBBBBBBBBBB')
  })
})

describe('Theme Service & Preference Synchronization', () => {

  beforeEach(() => {
    // Setup minimal DOM mocks in bun environment
    if (typeof window === 'undefined') {
      global.window = {
        matchMedia: (query: string) => ({
          matches: query.includes('dark'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }),
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as Window & typeof globalThis
    }

    if (typeof CustomEvent === 'undefined') {
      global.CustomEvent = class CustomEvent {
        type: string
        detail: unknown
        constructor(type: string, params?: { detail: unknown }) {
          this.type = type
          this.detail = params?.detail
        }
      } as unknown as typeof CustomEvent
    }

    if (typeof document === 'undefined') {
      const classListSet = new Set<string>()
      global.document = {
        documentElement: {
          classList: {
            add: (cls: string) => classListSet.add(cls),
            remove: (cls: string) => classListSet.delete(cls),
            contains: (cls: string) => classListSet.has(cls),
          },
        },
        cookie: '',
      } as unknown as Document
    }

    if (typeof localStorage === 'undefined') {
      const store: Record<string, string> = {}
      global.localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
        removeItem: (k: string) => { delete store[k] },
        clear: () => { Object.keys(store).forEach(k => delete store[k]) },
      } as unknown as Storage
    }
  })

  it('correctly resolves getIsDark for explicit modes', () => {
    expect(getIsDark('dark')).toBe(true)
    expect(getIsDark('light')).toBe(false)
  })

  it('reads stored theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    expect(getStoredTheme()).toBe('light')

    localStorage.setItem('theme', 'dark')
    expect(getStoredTheme()).toBe('dark')

    localStorage.setItem('theme', 'system')
    expect(getStoredTheme()).toBe('system')
  })

  it('falls back to system when localStorage has invalid value', () => {
    localStorage.setItem('theme', 'unknown-val')
    expect(getStoredTheme()).toBe('system')
  })

  it('applyTheme updates document class and cookies', () => {
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.cookie).toContain('theme=light')

    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.cookie).toContain('theme=dark')
  })
})
