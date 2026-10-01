'use client'

import React, { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardFooter } from '@/design-system/components/Card'
import { Input } from '@/design-system/components/Input'
import { Button } from '@/design-system/components/Button'
import { requestPasswordResetAction, resetPasswordWithTokenAction } from '@/app/actions/auth'
import { Key, ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  // Request Reset State
  const [identifier, setIdentifier] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestSubmitted, setRequestSubmitted] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestError, setRequestError] = useState('')

  // Set New Password State
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState('')

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRequestError('')
    if (!identifier.trim()) {
      setRequestError('Please enter your email or username.')
      return
    }

    setRequestLoading(true)
    const result = await requestPasswordResetAction(identifier)
    setRequestLoading(false)

    if (result.success) {
      setRequestSubmitted(true)
      setRequestMessage(result.message)
    } else {
      setRequestError(result.error || 'Failed to request password reset.')
    }
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')

    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.')
      return
    }

    if (!token) {
      setResetError('Missing password reset token.')
      return
    }

    setResetLoading(true)
    const result = await resetPasswordWithTokenAction(token, newPassword)
    setResetLoading(false)

    if (result.success) {
      setResetSuccess(true)
    } else {
      setResetError(result.error || 'Failed to reset password.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg-base)]">
      <Card className="w-full max-w-md shadow-xl border border-[var(--color-border)]">
        <CardHeader className="flex flex-col items-center text-center space-y-2 pb-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center text-[var(--color-primary)]">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-main)]">
              {token ? 'Set New Password' : 'Reset Your Password'}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {token
                ? 'Choose a strong password with at least 8 characters'
                : 'Enter your username or email and we will send recovery instructions'}
            </p>
          </div>
        </CardHeader>

        <CardBody className="p-6">
          {token ? (
            /* Mode 1: Set New Password with Token */
            resetSuccess ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-main)]">Password Updated</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Your password has been successfully reset. You can now log in with your new credentials.
                  </p>
                </div>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => router.push('/')}
                >
                  Proceed to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => {
                    setResetError('')
                    setNewPassword(e.target.value)
                  }}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors p-1"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  required
                  autoFocus
                />

                <Input
                  label="Confirm New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setResetError('')
                    setConfirmPassword(e.target.value)
                  }}
                  required
                />

                {resetError && (
                  <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span>{resetError}</span>
                      {resetError.toLowerCase().includes('expired') && (
                        <div className="mt-1.5">
                          <Link
                            href="/reset-password"
                            className="font-semibold underline hover:text-rose-700"
                          >
                            Request a new reset link
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  isLoading={resetLoading}
                  disabled={resetLoading || !newPassword || !confirmPassword}
                >
                  Update Password
                </Button>
              </form>
            )
          ) : (
            /* Mode 2: Request Password Reset */
            requestSubmitted ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-main)]">Check Your Inbox</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
                    {requestMessage}
                  </p>
                </div>
                <div className="pt-2">
                  <Link href="/">
                    <Button variant="outline" className="w-full">
                      Return to Login
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRequestSubmit} className="space-y-4">
                <Input
                  label="Username or Email"
                  type="text"
                  placeholder="Enter your registered username or email"
                  value={identifier}
                  onChange={(e) => {
                    setRequestError('')
                    setIdentifier(e.target.value)
                  }}
                  required
                  autoFocus
                />

                {requestError && (
                  <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{requestError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  isLoading={requestLoading}
                  disabled={requestLoading || !identifier.trim()}
                >
                  Send Reset Link
                </Button>
              </form>
            )
          )}
        </CardBody>

        <CardFooter className="flex justify-center border-t border-[var(--color-border)] pt-3 pb-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Login</span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)]">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
