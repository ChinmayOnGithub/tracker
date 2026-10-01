import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { getLoginSecuritySettingsAction, verifyTurnstileToken, verifyHumanChallengeAction } from '@/app/actions/auth'
import { getIsDark, getStoredTheme, applyTheme } from '@/lib/theme/useTheme'
import { getCanonicalOrigin } from '@/lib/url'

const cookieJar: Record<string, string> = {}
mock.module('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      set: (k: string, v: string) => {
        cookieJar[k] = v
      },
      get: (k: string) => ({ value: cookieJar[k] }),
      delete: (k: string) => {
        delete cookieJar[k]
      },
    }),
}))

describe('Turnstile Security Policy & Fail-Closed Protection', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('in development, enables Turnstile with test sitekey for local testing', async () => {
    delete (process.env as Record<string, string | undefined>).NODE_ENV
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
    delete process.env.CLOUDFLARE_TURNSTILE_SITE_KEY

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    expect(settings.turnstileSiteKey).toBe('1x00000000000000000000AA')
  })

  it('in production, disables Turnstile if site key is missing to prevent lockout', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
    delete process.env.CLOUDFLARE_TURNSTILE_SITE_KEY

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    expect(settings.humanVerificationEnabled).toBe(false)
  })

  it('in production, disables Turnstile if secret key is missing even if site key is configured (prevents broken loops)', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY = '0x4AAAAAAABBBBBBBBBBBBBB'
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    // Availability policy: must NOT enable if secret is missing
    expect(settings.humanVerificationEnabled).toBe(false)
  })

  it('in production, enables Turnstile when BOTH real site key and secret key are configured', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY = '0x4AAAAAAABBBBBBBBBBBBBB'
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '0x4AAAAAAACCCCCCCCCCCCCCC'

    const settings = await getLoginSecuritySettingsAction()
    expect(settings.success).toBe(true)
    expect(settings.humanVerificationEnabled).toBe(true)
    expect(settings.turnstileSiteKey).toBe('0x4AAAAAAABBBBBBBBBBBBBB')
  })

  it('FAIL-CLOSED: verifyTurnstileToken returns false when secret key is missing (NO SECURITY BYPASS)', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY

    const result = await verifyTurnstileToken('valid-user-response-token')
    // MUST be false - never fail open!
    expect(result).toBe(false)
  })

  it('verifyTurnstileToken returns false when token is empty', async () => {
    const result = await verifyTurnstileToken('')
    expect(result).toBe(false)
  })

  it('verifyTurnstileToken returns false when Cloudflare returns success: false', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '0x4AAAAAAACCCCCCCCCCCCCCC'

    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )) as unknown as typeof fetch

    const result = await verifyTurnstileToken('invalid-token')
    expect(result).toBe(false)
  })

  it('verifyTurnstileToken returns false when Cloudflare network request fails', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '0x4AAAAAAACCCCCCCCCCCCCCC'

    global.fetch = (() => Promise.reject(new Error('Network unreachable'))) as unknown as typeof fetch

    const result = await verifyTurnstileToken('some-token')
    expect(result).toBe(false)
  })

  it('verifyTurnstileToken returns true when Cloudflare confirms valid token', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '0x4AAAAAAACCCCCCCCCCCCCCC'

    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )) as unknown as typeof fetch

    const result = await verifyTurnstileToken('good-token')
    expect(result).toBe(true)
  })

  it('verifyHumanChallengeAction returns error when token validation fails', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY

    const res = await verifyHumanChallengeAction('any-token')
    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
  })

  it('verifyHumanChallengeAction succeeds and sets verification cookie when token is valid', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '0x4AAAAAAACCCCCCCCCCCCCCC'

    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )) as unknown as typeof fetch

    // Mock DB to avoid real connection in tests
    const { db } = await import('@/lib/db')
    const origCreate = db.humanChallenge.create
    db.humanChallenge.create = mock(() => Promise.resolve({
      id: 'challenge-test-1',
      nonce: 'test-nonce',
      flow: 'LOGIN',
      expiresAt: new Date(Date.now() + 300000),
      consumedAt: null,
      createdAt: new Date()
    })) as unknown as typeof db.humanChallenge.create

    try {
      const res = await verifyHumanChallengeAction('valid-token')
      expect(res.success).toBe(true)
    } finally {
      db.humanChallenge.create = origCreate
    }
  })
})

describe('Canonical Public Origin & OAuth Redirect Synchronization', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('resolves origin from x-forwarded-host and x-forwarded-proto headers', () => {
    const req = new Request('http://internal-cluster:3000/api/auth/google', {
      headers: {
        'x-forwarded-host': 'tracker.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    expect(getCanonicalOrigin(req)).toBe('https://tracker.example.com')
  })

  it('enforces https in production even if forwarded-proto says http', () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    const req = new Request('http://tracker.example.com/api/integrations/google-calendar', {
      headers: {
        'x-forwarded-host': 'tracker.example.com',
        'x-forwarded-proto': 'http',
      },
    })
    expect(getCanonicalOrigin(req)).toBe('https://tracker.example.com')
  })

  it('resolves identical origin for both Login and Calendar requests on same host', () => {
    const loginReq = new Request('https://tracker.vercel.app/api/auth/google')
    const calendarReq = new Request('https://tracker.vercel.app/api/integrations/google-calendar')

    const loginOrigin = getCanonicalOrigin(loginReq)
    const calendarOrigin = getCanonicalOrigin(calendarReq)

    expect(loginOrigin).toBe('https://tracker.vercel.app')
    expect(calendarOrigin).toBe('https://tracker.vercel.app')
    expect(loginOrigin).toBe(calendarOrigin)
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
