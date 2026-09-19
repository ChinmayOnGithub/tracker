"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Button, Badge, ConfirmDialog, Skeleton } from '@/design-system'
import {
  CreditCard, Sparkles, Check, AlertCircle, ArrowUpRight,
  Clock, ShieldCheck, History, Calendar, Copy, RefreshCw
} from 'lucide-react'
import {
  getBillingSummaryAction,
  cancelSubscriptionAction,
  reconcileBillingAction,
  BillingSummary
} from '@/app/actions/billing'
import { PLANS } from '@/lib/billing/plans'
import { useEntitlements } from '@/lib/context/EntitlementContext'
import Link from 'next/link'

export const SettingsBillingSection: React.FC = () => {
  const { refreshEntitlements } = useEntitlements()
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Cancellation modal state
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

  const handleReconcile = async () => {
    setReconciling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await reconcileBillingAction(summary?.subscription?.providerSubscriptionId)
      if (res.success) {
        if (res.entitlements) {
          await refreshEntitlements(res.entitlements)
        } else {
          await refreshEntitlements()
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tracker_entitlements_refresh'))
        }
        await reloadBillingData()
        setSuccessMsg(`Subscription status synchronized: ${res.status || 'Updated'}`)
      } else {
        setError(res.error || 'Could not synchronize status with Razorpay.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synchronization failed.')
    } finally {
      setReconciling(false)
    }
  }

  useEffect(() => {
    let active = true
    getBillingSummaryAction()
      .then((res) => {
        if (!active) return
        if (res.success && res.data) {
          setSummary(res.data)
        } else {
          setError(res.error || 'Failed to load billing information.')
        }
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Error fetching billing data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleCancelSubscription = async () => {
    setCancelling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await cancelSubscriptionAction()
      if (res.success) {
        setSuccessMsg(
          res.effectiveDate
            ? `Subscription cancellation scheduled. You retain full Pro access until ${new Date(res.effectiveDate).toLocaleDateString()}.`
            : 'Subscription canceled successfully.'
        )
        if (res.entitlements) {
          await refreshEntitlements(res.entitlements)
        } else {
          await refreshEntitlements()
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tracker_entitlements_refresh'))
        }
        await reloadBillingData()
      } else {
        setError(res.error || 'Failed to cancel subscription.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation error occurred.')
    } finally {
      setCancelling(false)
      setShowCancelDialog(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton variant="text" className="h-5 w-40" />
          </CardHeader>
          <CardBody className="space-y-4">
            <Skeleton variant="rect" className="h-20 w-full" />
            <Skeleton variant="text" className="h-4 w-3/4" />
          </CardBody>
        </Card>
      </div>
    )
  }

  const sub = summary?.subscription
  const isPro = summary?.plan === 'PRO_MONTHLY' || summary?.plan === 'PRO_ANNUAL'
  const isCancelScheduled = sub?.cancelAtPeriodEnd === true
  const isTransitional = sub?.status === 'PENDING' || sub?.status === 'CREATED'

  return (
    <div className="space-y-6">
      {/* Notifications / Alerts */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-3">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. Current Plan & Subscription Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                Plan & Subscription Status
              </span>
            </div>
            {isPro ? (
              <Badge variant="default" className="text-xs font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>{summary?.plan === 'PRO_ANNUAL' ? 'Pro Annual' : 'Pro Monthly'}</span>
              </Badge>
            ) : (
              <Badge variant="muted" className="text-xs font-bold">
                Free Plan
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850 rounded-xl">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[var(--color-text-main)]">
                  {isPro
                    ? summary?.plan === 'PRO_ANNUAL'
                      ? 'Tracker Pro (Annual Billing)'
                      : 'Tracker Pro (Monthly Billing)'
                    : 'Tracker Free Tier'}
                </h3>
                {sub ? (
                  <Badge
                    variant={
                      isCancelScheduled ? 'warning' :
                      sub.status === 'ACTIVE' || sub.status === 'AUTHENTICATED' ? 'success' :
                      sub.status === 'PENDING' || sub.status === 'CREATED' ? 'warning' :
                      'muted'
                    }
                    dot
                    size="sm"
                  >
                    {isCancelScheduled ? 'Cancels at Period End' :
                     sub.status === 'ACTIVE' || sub.status === 'AUTHENTICATED' ? 'Active' :
                     sub.status === 'PENDING' ? 'Pending Confirmation' :
                     sub.status === 'CREATED' ? 'Created' :
                     sub.status === 'HALTED' ? 'Halted' :
                     sub.status}
                  </Badge>
                ) : null}
              </div>

              <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                {sub?.providerSubscriptionId && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)]">Subscription ID:</span>
                    <span className="text-[var(--color-text-main)] font-mono text-[11px]">{sub.providerSubscriptionId}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
                      title="Copy Subscription ID"
                      onClick={async () => {
                        await navigator.clipboard.writeText(sub.providerSubscriptionId)
                        setCopiedId(sub.providerSubscriptionId)
                        setTimeout(() => setCopiedId(null), 2000)
                      }}
                      icon={copiedId === sub.providerSubscriptionId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    />
                  </div>
                )}

                {isPro && sub?.currentPeriodEnd && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    <span>
                      {isCancelScheduled ? 'Access ends on: ' : 'Next renewal date: '}
                      <strong className="text-[var(--color-text-main)] font-semibold">
                        {new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </strong>
                    </span>
                  </div>
                )}

                {summary?.isEligibleForIntro && !isPro && (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Your account is eligible for the introductory ₹{PLANS.PRO_MONTHLY.introductoryPrice} first-month promotion!</span>
                  </div>
                )}

                {!summary?.isEligibleForIntro && sub?.isIntroductory && (
                  <div className="text-[11px] text-[var(--color-text-muted)] pt-0.5">
                    Introductory first-month offer previously claimed.
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {isTransitional && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={reconciling}
                  onClick={handleReconcile}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Check Status
                </Button>
              )}
              {isPro ? (
                <>
                  {!isCancelScheduled && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancelDialog(true)}
                      className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-rose-500/20"
                    >
                      Cancel Subscription
                    </Button>
                  )}
                  {summary?.plan === 'PRO_MONTHLY' && !isCancelScheduled && (
                    <Link href="/pricing">
                      <Button variant="primary" size="sm" icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
                        Switch to Annual (Save 33%)
                      </Button>
                    </Link>
                  )}
                </>
              ) : (
                <Link href="/pricing">
                  <Button variant="primary" size="sm" icon={<Sparkles className="w-3.5 h-3.5" />}>
                    Upgrade to Pro
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Cancellation Warning Banner */}
          {isCancelScheduled && sub?.currentPeriodEnd && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <div className="font-bold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Subscription Cancellation Scheduled</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                You will not be billed again. Your Pro features, automated calendar writebacks, and unlimited vault file capacity remain fully active until{' '}
                <strong>{new Date(sub.currentPeriodEnd).toLocaleDateString()}</strong>.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2. Active Entitlements & Capacity Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
              What Your Plan Includes
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(summary?.entitlements?.plan
              ? PLANS[summary.entitlements.plan]?.featureDetails
              : PLANS.FREE.featureDetails
            )?.map((detail) => {
              const isLimit = detail.type === 'limit'
              const plan = summary?.entitlements?.plan
                ? PLANS[summary.entitlements.plan]
                : PLANS.FREE
              const value = isLimit
                ? detail.id === 'vault_storage'
                  ? summary?.entitlements.limits.vault_storage
                  : detail.id === 'active_activities'
                    ? summary?.entitlements.limits.active_activities
                    : null
                : summary?.entitlements.features[detail.id as keyof typeof summary.entitlements.features]

              return (
                <div
                  key={detail.id}
                  className="p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-bold text-[var(--color-text-main)]">
                      {detail.name}
                    </div>
                    <Badge
                      variant={value === false ? 'muted' : 'success'}
                      size="sm"
                    >
                      {isLimit
                        ? value !== null && value !== undefined
                          ? value.toLocaleString()
                          : '—'
                        : value === false
                          ? 'Not included'
                          : 'Included'}
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                    {detail.description}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-[11px] text-[var(--color-text-muted)]">
            These capabilities come from the same canonical plan definition used by the server entitlement engine. The UI does not independently decide what your subscription unlocks.
          </p>
        </CardBody>
      </Card>
      {/* 3. Payment & Billing History Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <span className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
              Billing & Payment History
            </span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {summary?.history && summary.history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-slate-50/50 dark:bg-zinc-900/50 text-[var(--color-text-muted)]">
                    <th className="p-3.5 font-semibold">Date</th>
                    <th className="p-3.5 font-semibold">Amount</th>
                    <th className="p-3.5 font-semibold">Status</th>
                    <th className="p-3.5 font-semibold">Plan</th>
                    <th className="p-3.5 font-semibold">Identifiers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {summary.history.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="p-3.5 font-medium text-[var(--color-text-main)]">
                        {tx.paidAt ? new Date(tx.paidAt).toLocaleDateString() : 'Pending'}
                      </td>
                      <td className="p-3.5 font-bold text-[var(--color-text-main)]">
                        ₹{tx.amount.toFixed(2)}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant={tx.status === 'SUCCESS' ? 'success' : tx.status === 'FAILED' ? 'danger' : 'muted'}
                          size="sm"
                        >
                          {tx.status === 'SUCCESS' ? 'Paid' : tx.status === 'PENDING' ? 'Pending' : tx.status}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-[var(--color-text-muted)]">
                        {tx.plan || 'Tracker Pro'}
                      </td>
                      <td className="p-3.5 text-[11px] text-[var(--color-text-muted)] space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)]">Payment:</span>
                          <span title={tx.providerPaymentId} className="font-mono text-[var(--color-text-main)]">
                            {tx.providerPaymentId.length > 14 ? `${tx.providerPaymentId.slice(0, 14)}...` : tx.providerPaymentId}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-5 w-5 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
                            title="Copy Payment ID"
                            onClick={async () => {
                              await navigator.clipboard.writeText(tx.providerPaymentId)
                              setCopiedId(tx.providerPaymentId)
                              setTimeout(() => setCopiedId(null), 2000)
                            }}
                            icon={copiedId === tx.providerPaymentId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          />
                        </div>
                        {(tx.providerSubscriptionId || sub?.providerSubscriptionId) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)]">Subscription:</span>
                            <span title={tx.providerSubscriptionId || sub?.providerSubscriptionId || ''} className="font-mono text-[var(--color-text-main)]">
                              {((tx.providerSubscriptionId || sub?.providerSubscriptionId)!).length > 14
                                ? `${(tx.providerSubscriptionId || sub?.providerSubscriptionId)!.slice(0, 14)}...`
                                : (tx.providerSubscriptionId || sub?.providerSubscriptionId)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-5 w-5 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
                              title="Copy Subscription ID"
                              onClick={async () => {
                                const sId = tx.providerSubscriptionId || sub?.providerSubscriptionId || ''
                                await navigator.clipboard.writeText(sId)
                                setCopiedId(sId)
                                setTimeout(() => setCopiedId(null), 2000)
                              }}
                              icon={copiedId === (tx.providerSubscriptionId || sub?.providerSubscriptionId) ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[var(--color-text-muted)] space-y-2">
              <CreditCard className="w-8 h-8 mx-auto opacity-30" />
              <p>No billing transactions found for this account.</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Confirmation Dialog for Subscription Cancellation */}
      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Pro Subscription?"
        description={`Are you sure you want to cancel your Pro subscription? Your Pro access and unlimited storage will remain fully active until ${
          sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : 'the end of your current cycle'
        }. You will not be charged again.`}
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
