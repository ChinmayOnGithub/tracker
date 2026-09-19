"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, Button, Badge, ConfirmDialog, Skeleton } from '@/design-system'
import {
  CreditCard, Sparkles, Check, AlertCircle, ArrowRight, ArrowUpRight,
  Clock, ShieldCheck, History, Calendar, Copy, RefreshCw,
  LockKeyhole, FileText, CalendarDays, StickyNote, Cloud, Activity
} from 'lucide-react'
import {
  getBillingSummaryAction,
  cancelSubscriptionAction,
  changeSubscriptionPlanAction,
  reconcileBillingAction,
  BillingSummary
} from '@/app/actions/billing'
import { PLANS } from '@/lib/billing/plans'
import {
  BILLING_CAPABILITIES,
  getActivityLimit,
  getCapabilityValue,
  getVaultLimit,
} from '@/lib/billing/capabilities'
import type { BillingCapabilityKey } from '@/lib/billing/capabilities'
import { useEntitlements } from '@/lib/context/EntitlementContext'
import Link from 'next/link'

const capabilityIcons: Record<BillingCapabilityKey, React.ReactNode> = {
  advanced_calendar: <CalendarDays className="h-4 w-4" />,
  advanced_journal: <FileText className="h-4 w-4" />,
  advanced_vault: <LockKeyhole className="h-4 w-4" />,
  unlimited_notes: <StickyNote className="h-4 w-4" />,
  priority_sync: <Cloud className="h-4 w-4" />,
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function shortId(value: string | null | undefined) {
  if (!value) return '—'
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value
}

function statusLabel(summary: BillingSummary | null) {
  const state = summary?.entitlements.subscription?.canonicalState
  if (!summary?.subscription && summary?.plan === 'FREE') return 'Free'
  switch (state) {
    case 'ACTIVE': return 'Active'
    case 'CANCEL_AT_PERIOD_END': return 'Cancels at period end'
    case 'CHECKOUT_PENDING': return 'Pending confirmation'
    case 'PAST_DUE': return 'Past due'
    case 'PAYMENT_FAILED': return 'Payment failed'
    case 'EXPIRED': return 'Expired'
    case 'CANCELLED': return 'Cancelled'
    default: return summary?.subscription?.status || 'Unknown'
  }
}

function statusVariant(summary: BillingSummary | null): 'success' | 'warning' | 'danger' | 'muted' {
  const state = summary?.entitlements.subscription?.canonicalState
  if (state === 'ACTIVE') return 'success'
  if (state === 'CANCEL_AT_PERIOD_END' || state === 'CHECKOUT_PENDING') return 'warning'
  if (state === 'PAST_DUE' || state === 'PAYMENT_FAILED') return 'danger'
  return 'muted'
}

export const SettingsBillingSection: React.FC = () => {
  const { refreshEntitlements } = useEntitlements()
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [changingPlan, setChangingPlan] = useState<'PRO_MONTHLY' | 'PRO_ANNUAL' | null>(null)
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const reloadBillingData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [res] = await Promise.all([
        getBillingSummaryAction(),
        refreshEntitlements().catch(() => null)
      ])
      if (res.success && res.data) {
        setSummary(res.data)
      } else {
        setError(res.error || 'Failed to load billing information.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching billing data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    getBillingSummaryAction()
      .then((res) => {
        if (!active) return
        if (res.success && res.data) setSummary(res.data)
        else setError(res.error || 'Failed to load billing information.')
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Error fetching billing data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const handleReconcile = async () => {
    setReconciling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await reconcileBillingAction(summary?.subscription?.providerSubscriptionId)
      if (!res.success) {
        setError(res.error || 'Could not synchronize subscription status.')
        return
      }
      await refreshEntitlements(res.entitlements)
      await reloadBillingData()
      setSuccessMsg(`Subscription status synchronized: ${res.status || 'Updated'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synchronization failed.')
    } finally {
      setReconciling(false)
    }
  }

  const handleChangePlan = async (targetPlan: 'PRO_MONTHLY' | 'PRO_ANNUAL') => {
    setChangingPlan(targetPlan)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await changeSubscriptionPlanAction(targetPlan)
      if (!res.success) {
        setError(res.error || 'Unable to change your subscription plan.')
        return
      }
      await refreshEntitlements(res.entitlements)
      await reloadBillingData()
      setSuccessMsg(`Plan changed to ${targetPlan === 'PRO_ANNUAL' ? 'Pro Annual' : 'Pro Monthly'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change your subscription plan.')
    } finally {
      setChangingPlan(null)
    }
  }

  const handleCancelSubscription = async () => {
    setCancelling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await cancelSubscriptionAction()
      if (!res.success) {
        setError(res.error || 'Failed to cancel subscription.')
        return
      }
      await refreshEntitlements(res.entitlements)
      await reloadBillingData()
      setSuccessMsg(
        res.effectiveDate
          ? `Cancellation scheduled. Pro access remains available until ${formatDate(res.effectiveDate)}.`
          : 'Subscription canceled successfully.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation error occurred.')
    } finally {
      setCancelling(false)
      setShowCancelDialog(false)
    }
  }

  const isPro = Boolean(summary?.entitlements.isPro)
  const plan = summary ? PLANS[summary.plan] : null
  const sub = summary?.subscription
  const canonicalState = summary?.entitlements.subscription?.canonicalState
  const isCancelScheduled = canonicalState === 'CANCEL_AT_PERIOD_END'
  const isTransitional = canonicalState === 'CHECKOUT_PENDING'
  const vaultLimit = summary ? getVaultLimit(summary.entitlements) : 0
  const activityLimit = summary ? getActivityLimit(summary.entitlements) : 0

  const capabilityRows = useMemo(() => {
    if (!summary) return []
    return BILLING_CAPABILITIES.map((definition) => ({
      ...definition,
      enabled: getCapabilityValue(summary.entitlements, definition.key),
    }))
  }, [summary])

  if (loading) {
    return (
      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-4 p-5">
            <Skeleton variant="rect" className="h-24 w-full" />
            <Skeleton variant="rect" className="h-28 w-full" />
            <Skeleton variant="rect" className="h-40 w-full" />
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Current plan */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b-0 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-text-main)]">
                Current Plan
              </span>
            </div>
            <Badge variant={isPro ? 'default' : 'muted'} size="sm">
              {isPro ? (summary?.plan === 'PRO_ANNUAL' ? 'Pro Annual' : 'Pro Monthly') : 'Free'}
            </Badge>
          </div>
        </CardHeader>

        <CardBody className="pt-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/[0.07] via-[var(--color-surface)] to-[var(--color-surface)] p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black tracking-tight text-[var(--color-text-main)]">
                    {isPro ? (summary?.plan === 'PRO_ANNUAL' ? 'Tracker Pro Annual' : 'Tracker Pro Monthly') : 'Tracker Free'}
                  </h3>
                  {summary && (
                    <Badge variant={statusVariant(summary)} dot size="sm">
                      {statusLabel(summary)}
                    </Badge>
                  )}
                </div>

                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {plan?.tagline || 'Your essential Tracker workspace.'}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[var(--color-text-muted)]">
                  {plan && plan.price > 0 && (
                    <span>
                      <strong className="text-sm font-black text-[var(--color-text-main)]">
                        {formatCurrency(plan.price, plan.currency)}
                      </strong>
                      {plan.interval !== 'none' ? ` / ${plan.interval === 'annual' ? 'year' : 'month'}` : ''}
                    </span>
                  )}
                  {sub?.currentPeriodEnd && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {isCancelScheduled ? 'Access until' : 'Renews'} {formatDate(sub.currentPeriodEnd)}
                    </span>
                  )}
                  {sub?.providerSubscriptionId && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-mono transition-colors hover:text-[var(--color-text-main)]"
                      title={sub.providerSubscriptionId}
                      onClick={async () => {
                        await navigator.clipboard.writeText(sub.providerSubscriptionId)
                        setCopiedId(sub.providerSubscriptionId)
                        setTimeout(() => setCopiedId(null), 1800)
                      }}
                    >
                      <span>#{shortId(sub.providerSubscriptionId)}</span>
                      {copiedId === sub.providerSubscriptionId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {isTransitional && (
                  <Button variant="outline" size="sm" isLoading={reconciling} onClick={handleReconcile} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                    Check Status
                  </Button>
                )}

                {isPro && !isCancelScheduled && canonicalState === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCancelDialog(true)}
                    className="border-rose-500/20 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                  >
                    Cancel
                  </Button>
                )}

                {isPro && canonicalState === 'ACTIVE' && summary?.plan === 'PRO_MONTHLY' && (
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={changingPlan === 'PRO_ANNUAL'}
                    disabled={changingPlan !== null}
                    onClick={() => handleChangePlan('PRO_ANNUAL')}
                    icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  >
                    Switch to Annual
                  </Button>
                )}

                {isPro && canonicalState === 'ACTIVE' && summary?.plan === 'PRO_ANNUAL' && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={changingPlan === 'PRO_MONTHLY'}
                    disabled={changingPlan !== null}
                    onClick={() => handleChangePlan('PRO_MONTHLY')}
                  >
                    Switch to Monthly
                  </Button>
                )}

                {!isPro && (
                  <Link href="/pricing">
                    <Button variant="primary" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />}>
                      Upgrade to Pro
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {isCancelScheduled && sub?.currentPeriodEnd && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Cancellation scheduled.</strong>
                <span className="ml-1">Your current Pro entitlements remain active until {formatDate(sub.currentPeriodEnd)}.</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-text-main)]">
                Plan Capabilities
              </span>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
              From your active entitlement set
            </span>
          </div>
        </CardHeader>

        <CardBody className="pt-1">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {capabilityRows.map((capability) => (
              <div
                key={capability.key}
                className="group flex min-h-[76px] items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 transition-all hover:-translate-y-px hover:shadow-sm"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${capability.enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 text-[var(--color-text-muted)] dark:bg-zinc-900'}`}>
                  {capabilityIcons[capability.key]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-text-main)]">{capability.name}</span>
                    <Badge variant={capability.enabled ? 'success' : 'muted'} size="sm">
                      {capability.enabled ? 'Included' : 'Not included'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{capability.description}</p>
                </div>
                {capability.enabled && capability.href && (
                  <Link
                    href={capability.href}
                    className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] opacity-70 transition-opacity hover:opacity-100"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-slate-50/60 px-3.5 py-3 dark:bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <LockKeyhole className="h-4 w-4 text-[var(--color-text-muted)]" />
                <div>
                  <div className="text-xs font-bold text-[var(--color-text-main)]">Secure Vault capacity</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">Encrypted document files</div>
                </div>
              </div>
              <strong className={`text-xs ${isPro ? 'text-emerald-500' : 'text-[var(--color-text-main)]'}`}>
                {vaultLimit.toLocaleString()} files
              </strong>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-slate-50/60 px-3.5 py-3 dark:bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-[var(--color-text-muted)]" />
                <div>
                  <div className="text-xs font-bold text-[var(--color-text-main)]">Active activities</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">Recurring activity capacity</div>
                </div>
              </div>
              <strong className={`text-xs ${isPro ? 'text-emerald-500' : 'text-[var(--color-text-main)]'}`}>
                {activityLimit.toLocaleString()}
              </strong>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Billing history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-text-main)]">
                Billing History
              </span>
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {summary?.history?.length || 0} transaction{summary?.history?.length === 1 ? '' : 's'}
            </span>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {summary?.history && summary.history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="border-y border-[var(--color-border)] bg-slate-50/60 text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] dark:bg-zinc-900/40">
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Amount</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                    <th className="px-4 py-2.5 font-bold">Plan</th>
                    <th className="px-4 py-2.5 font-bold">Payment</th>
                    <th className="px-4 py-2.5 font-bold">Subscription</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {summary.history.map((tx) => (
                    <tr key={tx.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-zinc-900/30">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-text-main)]">
                        {formatDate(tx.paidAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-black text-[var(--color-text-main)]">
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={tx.status === 'SUCCESS' ? 'success' : tx.status === 'FAILED' ? 'danger' : 'muted'}
                          size="sm"
                        >
                          {tx.status === 'SUCCESS' ? 'Paid' : tx.status === 'PENDING' ? 'Pending' : tx.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--color-text-muted)]">
                        {tx.plan ? (PLANS[tx.plan as keyof typeof PLANS]?.name || tx.plan) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          title={tx.providerPaymentId}
                          className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-main)] hover:text-[var(--color-primary)]"
                          onClick={async () => {
                            await navigator.clipboard.writeText(tx.providerPaymentId)
                            setCopiedId(tx.providerPaymentId)
                            setTimeout(() => setCopiedId(null), 1800)
                          }}
                        >
                          {shortId(tx.providerPaymentId)}
                          {copiedId === tx.providerPaymentId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {(tx.providerSubscriptionId || sub?.providerSubscriptionId) ? (
                          <button
                            type="button"
                            title={tx.providerSubscriptionId || sub?.providerSubscriptionId || ''}
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-main)] hover:text-[var(--color-primary)]"
                            onClick={async () => {
                              const value = tx.providerSubscriptionId || sub?.providerSubscriptionId || ''
                              await navigator.clipboard.writeText(value)
                              setCopiedId(value)
                              setTimeout(() => setCopiedId(null), 1800)
                            }}
                          >
                            {shortId(tx.providerSubscriptionId || sub?.providerSubscriptionId)}
                            {copiedId === (tx.providerSubscriptionId || sub?.providerSubscriptionId) ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <CreditCard className="mx-auto h-8 w-8 text-[var(--color-text-muted)] opacity-30" />
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">No billing transactions found for this account.</p>
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Pro Subscription?"
        description={`Your Pro access will remain active until ${sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'the end of your current billing period'}. You will not be charged again after the current period.`}
        confirmText={cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
        cancelText="Keep Subscription"
        variant="danger"
        isLoading={cancelling}
        onConfirm={handleCancelSubscription}
        onClose={() => setShowCancelDialog(false)}
      />
    </div>
  )
}
