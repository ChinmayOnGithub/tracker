"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Card, CardHeader, CardBody, Button, Badge } from '@/design-system'
import {
  Check, Sparkles, ArrowRight, AlertCircle
} from 'lucide-react'
import { getBillingSummaryAction, startSubscriptionAction, confirmCheckoutAction } from '@/app/actions/billing'
import { SafeCheckoutPayload, PlanId } from '@/lib/billing/types'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any
  }
}

export const PricingPanel: React.FC = () => {
  const router = useRouter()
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<PlanId>('FREE')
  const [isEligibleForIntro, setIsEligibleForIntro] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  // Fetch billing state to identify current plan and promo eligibility
  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const res = await getBillingSummaryAction()
        if (mounted && res.success && res.data) {
          setCurrentPlan(res.data.plan)
          setIsEligibleForIntro(res.data.isEligibleForIntro)
        }
      } catch (err) {
        console.error('Failed to load billing status:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [])

  const handleSubscribe = async (targetPlan: 'PRO_MONTHLY' | 'PRO_ANNUAL') => {
    setErrorMessage(null)
    setActionLoading(true)

    try {
      const res = await startSubscriptionAction(targetPlan)
      if (!res.success || !res.checkout) {
        setErrorMessage(res.error || 'Failed to start checkout session.')
        setActionLoading(false)
        return
      }

      const checkout: SafeCheckoutPayload = res.checkout

      // If Razorpay checkout modal is available, open it
      if (window.Razorpay && scriptLoaded) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const options: any = {
          key: checkout.keyId,
          subscription_id: checkout.subscriptionId,
          name: checkout.name,
          description: checkout.description,
          handler: async (response: {
            razorpay_payment_id: string
            razorpay_subscription_id: string
            razorpay_signature: string
          }) => {
            setActionLoading(true)
            await confirmCheckoutAction({
              subscriptionId: response.razorpay_subscription_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature
            })
            router.push('/settings?tab=billing')
          },
          prefill: {
            email: checkout.customerEmail || undefined,
            name: checkout.customerName || undefined
          },
          theme: {
            color: '#6366f1'
          }
        }

        const rzp = new window.Razorpay(options)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rzp.on('payment.failed', function (resp: any) {
          setErrorMessage(resp.error?.description || 'Payment was not completed.')
          setActionLoading(false)
        })
        rzp.open()
      } else {
        setErrorMessage('Payment gateway is still initializing. Please check your network connection and try again.')
        setActionLoading(false)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Checkout encountered an error.')
    } finally {
      setActionLoading(false)
    }
  }

  const isPro = currentPlan === 'PRO_MONTHLY' || currentPlan === 'PRO_ANNUAL'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 md:py-12 space-y-12">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />
      {/* Header section */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <Badge variant="default" className="px-3 py-1 font-semibold text-xs tracking-wide uppercase">
          Tracker Subscriptions
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--color-text-main)]">
          Simple, Transparent Pricing
        </h1>
        <p className="text-sm sm:text-base text-[var(--color-text-muted)]">
          Everything you need to master your time, habits, and encrypted records. Start free, upgrade when you need power and automated workflows.
        </p>

        {/* Interval toggle: Monthly vs Annual */}
        <div className="inline-flex items-center gap-2 p-1 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-2xs mt-4">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] transition-all cursor-pointer ${
              interval === 'monthly'
                ? 'bg-[var(--color-primary)] text-white shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] transition-all flex items-center gap-1.5 cursor-pointer ${
              interval === 'annual'
                ? 'bg-[var(--color-primary)] text-white shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
            }`}
          >
            <span>Annual</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-[var(--radius-xs)]">
              Save 33%
            </span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="max-w-md mx-auto p-4 bg-rose-500/10 border border-rose-500/20 rounded-[var(--radius-md)] text-xs text-rose-600 dark:text-rose-400 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* FREE PLAN CARD */}
        <Card className="flex flex-col border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <CardHeader className="space-y-3 pb-6 border-b border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[var(--color-text-main)]">Free</h2>
              {currentPlan === 'FREE' && (
                <Badge variant="muted" className="text-xs font-semibold">
                  Current Plan
                </Badge>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] min-h-[32px]">
              Core time-centric operating system for individuals wanting local clarity.
            </p>
            <div className="pt-2">
              <span className="text-3xl font-black text-[var(--color-text-main)]">₹0</span>
              <span className="text-xs text-[var(--color-text-muted)] font-medium"> / forever</span>
            </div>
          </CardHeader>

          <CardBody className="space-y-4 py-6 flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              What&apos;s Included:
            </div>
            <ul className="space-y-3 text-xs text-[var(--color-text-main)]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Unlimited Habits & Daily Tasks</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Computed Dynamic Timeline & Calendar</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Daily Notes & Journal Reflections</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Weight & Health Metric History</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Secure Vault Storage (Up to 10 Files)</span>
              </li>
            </ul>
          </CardBody>

          <div className="p-6 pt-0 mt-auto">
            <Button
              variant="secondary"
              className="w-full"
              disabled={currentPlan === 'FREE'}
              onClick={() => router.push('/')}
            >
              {currentPlan === 'FREE' ? 'Active Plan' : 'Free Included'}
            </Button>
          </div>
        </Card>

        {/* PRO PLAN CARD */}
        <Card className="flex flex-col border-[var(--color-primary)] bg-[var(--color-bg-surface)] relative shadow-lg ring-1 ring-[var(--color-primary)]">
          <div className="absolute -top-3 right-6">
            <span className="px-3 py-0.5 text-[11px] font-bold bg-[var(--color-primary)] text-white rounded-full shadow-xs uppercase tracking-wider">
              Recommended
            </span>
          </div>

          <CardHeader className="space-y-3 pb-6 border-b border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--color-text-main)]">Tracker Pro</h2>
                <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
              </div>
              {isPro && (
                <Badge variant="default" className="text-xs font-semibold">
                  Active Plan
                </Badge>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] min-h-[32px]">
              Automated syncing, unlimited storage capacity, and rich export analytics.
            </p>

            <div className="pt-2">
              {interval === 'monthly' ? (
                <div>
                  {isEligibleForIntro && currentPlan === 'FREE' ? (
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-[var(--color-text-main)]">₹29</span>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 font-semibold">
                          First Month Intro Promo
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        Renews at standard ₹99/month thereafter. Cancel anytime.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-3xl font-black text-[var(--color-text-main)]">₹99</span>
                      <span className="text-xs text-[var(--color-text-muted)] font-medium"> / month</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-[var(--color-text-main)]">₹799</span>
                    <span className="text-xs text-[var(--color-text-muted)] font-medium"> / year</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Equivalent to ~₹66.58/month (Billed annually)
                  </p>
                </div>
              )}
            </div>
          </CardHeader>

          <CardBody className="space-y-4 py-6 flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
              Everything in Free, plus:
            </div>
            <ul className="space-y-3 text-xs text-[var(--color-text-main)]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span className="font-semibold">Unlimited Secure Vault Storage</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>Automated External Calendar Sync & Writebacks</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>Rich Journal Exports (Encrypted PDF & JSON)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>Unlimited Vault Client-Side Encryption Exports</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>Priority Cloud Sync & Automated Backup Engine</span>
              </li>
            </ul>
          </CardBody>

          <div className="p-6 pt-0 mt-auto">
            {isPro ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => router.push('/settings?tab=billing')}
              >
                Manage Subscription
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full font-semibold"
                disabled={actionLoading || loading}
                onClick={() => handleSubscribe(interval === 'annual' ? 'PRO_ANNUAL' : 'PRO_MONTHLY')}
              >
                {actionLoading ? (
                  'Starting Checkout...'
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {interval === 'monthly' && isEligibleForIntro
                      ? 'Get Started for ₹29'
                      : interval === 'annual'
                      ? 'Subscribe Annual (₹799)'
                      : 'Subscribe Pro (₹99/mo)'}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Feature comparison table */}
      <div className="max-w-4xl mx-auto space-y-6 pt-8 border-t border-[var(--color-border)]">
        <h3 className="text-xl font-bold text-[var(--color-text-main)] text-center">
          Compare Features & Capabilities
        </h3>

        <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-bg-surface)]">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)]">
                <th className="p-4 font-bold text-[var(--color-text-main)]">Capability</th>
                <th className="p-4 font-bold text-[var(--color-text-main)] text-center w-36">Free</th>
                <th className="p-4 font-bold text-[var(--color-primary)] text-center w-44">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              <tr>
                <td className="p-4 font-medium text-[var(--color-text-main)]">Habits & Recurring Activities</td>
                <td className="p-4 text-center text-[var(--color-text-muted)]">Unlimited</td>
                <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">Unlimited</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-[var(--color-text-main)]">Daily Dynamic Timeline</td>
                <td className="p-4 text-center text-[var(--color-text-muted)]">Full Access</td>
                <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">Full Access</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-[var(--color-text-main)]">Secure Document Vault Capacity</td>
                <td className="p-4 text-center text-[var(--color-text-muted)]">Up to 10 Files</td>
                <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">Unlimited</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-[var(--color-text-main)]">Calendar Provider Sync</td>
                <td className="p-4 text-center text-[var(--color-text-muted)]">Manual Refresh</td>
                <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">Auto Sync + Writebacks</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-[var(--color-text-main)]">Journal & Daily Reflections</td>
                <td className="p-4 text-center text-[var(--color-text-muted)]">Standard</td>
                <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">Rich Export & Insights</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-[var(--color-text-main)]">Cloud Sync & Backup Engine</td>
                <td className="p-4 text-center text-[var(--color-text-muted)]">Standard Local</td>
                <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">Priority Multi-Client Sync</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
