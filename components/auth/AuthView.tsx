'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input } from '@/design-system'
import {
  verifyPinAction,
  registerUserAction,
  getLoginSecuritySettingsAction,
  verifyHumanChallengeAction,
} from '@/app/actions/auth'
import { useTheme } from '@/lib/theme'
import { Sun, Moon } from 'lucide-react'

interface AuthViewProps {
  onAuthenticated: (user: { id: string; username: string; email?: string | null; isOwner?: boolean }) => void
  errorParam?: string | null
  accountParam?: string | null
}

export const AuthView: React.FC<AuthViewProps> = ({
  onAuthenticated,
  errorParam,
  accountParam,
}) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [enteredPin, setEnteredPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  // Cloudflare Turnstile state
  const [robotChecked, setRobotChecked] = useState(false)
  const [humanVerificationEnabled, setHumanVerificationEnabled] = useState(true)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('1x00000000000000000000AA')
  const [humanVerificationLoading, setHumanVerificationLoading] = useState(true)



  const { toggleTheme, isDark } = useTheme()
  const pinInputRef = useRef<HTMLInputElement>(null)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetIdRef = useRef<string | null>(null)

  // Load human verification settings on mount
  useEffect(() => {
    let cancelled = false
    const loadSettings = async () => {
      try {
        const settings = await getLoginSecuritySettingsAction()
        if (cancelled) return
        setHumanVerificationEnabled(settings.success ? settings.humanVerificationEnabled : false)
        if (settings.turnstileSiteKey) {
          setTurnstileSiteKey(settings.turnstileSiteKey)
        }
      } catch {
        if (!cancelled) setHumanVerificationEnabled(false)
      } finally {
        if (!cancelled) setHumanVerificationLoading(false)
      }
    }
    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  // Load and render Turnstile widget
  useEffect(() => {
    if (!humanVerificationEnabled) return

    let cancelled = false

    const renderWidget = () => {
      if (cancelled || !turnstileContainerRef.current) return
      const turnstile = (window as unknown as {
        turnstile?: {
          render: (container: HTMLElement, options: Record<string, unknown>) => string
          reset: (widgetId: string) => void
        }
      }).turnstile

      if (!turnstile) return

      if (turnstileContainerRef.current) {
        turnstileContainerRef.current.innerHTML = ''
      }

      try {
        const id = turnstile.render(turnstileContainerRef.current, {
          sitekey: turnstileSiteKey,
          theme: isDark ? 'dark' : 'light',
          callback: async (token: string) => {
            if (cancelled) return
            setHumanVerificationLoading(true)
            const result = await verifyHumanChallengeAction(token)
            setHumanVerificationLoading(false)
            if (result.success) {
              setRobotChecked(true)
              setAuthError('')
            } else {
              setRobotChecked(false)
              setAuthError(result.error || 'Security verification failed. Please try again.')
            }
          },
          'error-callback': () => {
            if (cancelled) return
            setRobotChecked(false)
            setAuthError('Security verification encountered a network issue.')
          },
          'expired-callback': () => {
            if (cancelled) return
            setRobotChecked(false)
          },
        })
        turnstileWidgetIdRef.current = id
      } catch (err) {
        console.warn('[AuthView] Turnstile render error:', err)
      }
    }

    const scriptId = 'cf-turnstile-script'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = () => {
        renderWidget()
      }
      document.head.appendChild(script)
    } else {
      renderWidget()
    }

    return () => {
      cancelled = true
    }
  }, [humanVerificationEnabled, turnstileSiteKey, isDark])

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      if (isAuthLoading) return

      const trimmedUsername = usernameInput.trim()
      if (!trimmedUsername) {
        setAuthError('Username is required')
        return
      }
      if (isRegisterMode && enteredPin.length < 8) {
        setAuthError('Password must be at least 8 characters')
        return
      }
      if (!isRegisterMode && enteredPin.length < 4) {
        setAuthError('Enter a valid password or 4-digit PIN')
        return
      }

      setIsAuthLoading(true)
      setAuthError('')

      try {
        if (isRegisterMode) {
          const res = await registerUserAction(trimmedUsername, enteredPin)
          if (res.success && res.user) {
            onAuthenticated(res.user)
            window.location.replace(res.onboardingRequired ? '/onboarding' : '/')
          } else {
            setIsAuthLoading(false)
            setAuthError(res.error || 'Registration failed')
            setEnteredPin('')
          }
        } else {
          const res = await verifyPinAction(trimmedUsername, enteredPin)
          if (res.success && res.user) {
            onAuthenticated(res.user)
            window.location.replace(res.onboardingRequired ? '/onboarding' : '/')
          } else {
            setIsAuthLoading(false)
            setAuthError(res.error || 'Incorrect username or password/PIN')
            setEnteredPin('')
          }
        }
      } catch {
        setIsAuthLoading(false)
        setAuthError('An unexpected authentication error occurred.')
      }
    },
    [isRegisterMode, isAuthLoading, usernameInput, enteredPin, onAuthenticated]
  )



  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4 py-8 sm:px-6 relative transition-colors">
      {/* Top right live theme toggle */}
      <div className="absolute top-4 right-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          aria-label="Toggle theme"
          icon={isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        />
      </div>

      <div className="w-full max-w-[520px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-lg transition-colors">
        {/* Logo and Brand Header */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div className="relative h-9 w-9 rounded-full bg-[#ff7557] flex items-center justify-center shadow-xs">
              <div className="absolute left-1.5 top-1.5 h-5 w-5 rounded-full bg-[#f9a68e]" />
              <div className="absolute -bottom-0.5 right-0 h-4 w-4 rounded-full bg-[var(--surface)]" />
            </div>
            <span className="text-[28px] leading-none tracking-tight font-extrabold text-[var(--foreground)]">
              tracker
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Focus, daily habits, and time management
          </p>
        </div>

        {/* Tab switch: Login vs Sign Up */}
        <div className="grid grid-cols-2 border-b border-[var(--border)] mb-6">
          <button
            type="button"
            disabled={isAuthLoading}
            onClick={() => {
              setIsRegisterMode(false)
              setAuthError('')
              setEnteredPin('')
            }}
            className={`h-11 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              !isRegisterMode
                ? 'text-[var(--foreground)] border-[var(--primary)]'
                : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            disabled={isAuthLoading}
            onClick={() => {
              setIsRegisterMode(true)
              setAuthError('')
              setEnteredPin('')
            }}
            className={`h-11 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              isRegisterMode
                ? 'text-[var(--foreground)] border-[var(--primary)]'
                : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
            }`}
          >
            Sign up
          </button>
        </div>

        {errorParam === 'unauthorized-account' && (
          <div className="mb-6 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 p-3.5 text-xs text-rose-700 dark:text-rose-300">
            <span className="font-bold block mb-0.5">Access restricted</span>
            <span>
              {accountParam
                ? `${accountParam} is not authorized for this application.`
                : 'This application is restricted to authorized accounts.'}
            </span>
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="space-y-2.5 mb-6">
          <a
            href="/api/auth/google"
            className="h-11 w-full border border-[var(--border)] rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--accent)] text-[var(--foreground)] flex items-center justify-center gap-3 text-sm font-medium transition-all shadow-xs"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5 text-xs text-[var(--muted-foreground)]">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span>OR</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email or Username"
            type="text"
            value={usernameInput}
            disabled={isAuthLoading}
            onChange={(e) => {
              setUsernameInput(e.target.value)
              setAuthError('')
            }}
            placeholder="jane@company.com"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />

          <div className="relative">
            <Input
              ref={pinInputRef}
              label={isRegisterMode ? 'Password (min 8 characters)' : 'Password or PIN'}
              type={showPassword ? 'text' : 'password'}
              value={enteredPin}
              disabled={isAuthLoading}
              onChange={(e) => {
                setEnteredPin(e.target.value)
                setAuthError('')
              }}
              placeholder="••••••••"
              autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
              required
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              }
            />
          </div>

          {authError && (
            <p className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-2.5 text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
              {authError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-2"
            isLoading={isAuthLoading}
            disabled={
              isAuthLoading ||
              !usernameInput.trim() ||
              !enteredPin ||
              (humanVerificationEnabled && (!robotChecked || humanVerificationLoading))
            }
          >
            {isRegisterMode ? 'Sign up with email' : 'Log in with email'}
          </Button>
        </form>

        {/* Recovery Note */}
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Forgot your password?</span>
          <span>Contact workspace admin</span>
        </div>

        {/* Turnstile Container */}
        {humanVerificationEnabled && (
          <div className="mt-6 flex flex-col items-center justify-center">
            <div
              ref={turnstileContainerRef}
              className="min-h-[65px] flex items-center justify-center"
            />
            {robotChecked && (
              <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                Security verification passed
              </p>
            )}
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isAuthLoading && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex flex-col items-center justify-center z-50">
          <div className="h-8 w-8 border-3 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
          <p className="mt-3 text-xs font-semibold tracking-wide text-white">
            {isRegisterMode ? 'Creating account...' : 'Logging in...'}
          </p>
        </div>
      )}


    </main>
  )
}
