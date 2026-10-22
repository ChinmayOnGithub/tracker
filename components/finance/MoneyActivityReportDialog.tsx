"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { ActivityTemplate, ActivityLog } from '@/types'
import { formatMoney } from '@/lib/formatMoney'
import { getActivityReportLogs } from '@/app/actions/activity-report'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/design-system'
import { CalendarDays, ChartColumnIncreasing, Pencil } from 'lucide-react'

type MoneyPoint = { date: string; amount: number }

function readAmount(log: ActivityLog, template: ActivityTemplate): number | null {
  const numeric = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
    return null
  }

  const direct = numeric(log.amount)
  if (direct !== null) return direct

  const payload = log.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>
    const moneyKey = /amount|cost|price|spent|total|payment|money|expense|bill|fee|charge|currency/i
    const metadata = template.metadata && typeof template.metadata === 'object'
      ? template.metadata as Record<string, unknown>
      : typeof template.metadata === 'string'
        ? (() => { try { return JSON.parse(template.metadata as string) as Record<string, unknown> } catch { return {} } })()
        : {}
    const completion = metadata.completion && typeof metadata.completion === 'object'
      ? metadata.completion as Record<string, unknown>
      : {}
    const schema = (completion.schema || completion.form) as { fields?: Array<{ id: string; label?: string; type?: string; unit?: string }> } | undefined
    const valueObject = obj.value && typeof obj.value === 'object' && !Array.isArray(obj.value)
      ? obj.value as Record<string, unknown>
      : null
    const valuesObject = obj.values && typeof obj.values === 'object' && !Array.isArray(obj.values)
      ? obj.values as Record<string, unknown>
      : null
    const nestedObjects = [valueObject, valuesObject, obj]

    for (const field of schema?.fields || []) {
      if (field.type === 'currency' || /₹|\$|€|£|\bINR\b|\bUSD\b|\bEUR\b|\bGBP\b/i.test(field.unit || '') ||
          moneyKey.test(field.id) || moneyKey.test(field.label || '')) {
        for (const source of nestedObjects) {
          if (source && Object.prototype.hasOwnProperty.call(source, field.id)) {
            const amount = numeric(source[field.id])
            if (amount !== null) return amount
          }
        }
      }
    }

    for (const key of ['amount', 'value', 'cost', 'price', 'spent', 'total', 'payment', 'expense', 'bill', 'fee', 'charge']) {
      for (const source of nestedObjects) {
        if (source && Object.prototype.hasOwnProperty.call(source, key)) {
          const amount = numeric(source[key])
          if (amount !== null) return amount
        }
      }
    }

    for (const source of nestedObjects) {
      if (!source) continue
      for (const [key, value] of Object.entries(source)) {
        if (moneyKey.test(key)) {
          const amount = numeric(value)
          if (amount !== null) return amount
        }
      }
    }
  }

  return numeric(template.amount)
}
export function isMoneyActivity(template: ActivityTemplate): boolean {
  if (template.amount !== null && template.amount !== undefined) return true
  if (template.type === 'BILL' || template.category.toLowerCase() === 'finance') return true
  const metadata = template.metadata
  const serialized = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {})
  return /currency|\bexpense\b|\bspending\b|\bpayment\b|\bprice\b|\bcost\b|\bmoney\b/i.test(serialized)
}

function moneyLabel(amount: number): string {
  return formatMoney(amount) || `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function BarChart({ data, formatLabel }: { data: { label: string; value: number }[]; formatLabel?: (value: number) => string }) {
  const max = Math.max(1, ...data.map(item => item.value))
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex h-48 min-w-[520px] items-end gap-2 border-b border-[var(--color-border)] px-1 pt-4">
        {data.map(item => {
          const height = item.value > 0 ? Math.max(4, (item.value / max) * 142) : 2
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${item.label}: ${moneyLabel(item.value)}`}>
              <span className="max-w-full truncate text-[10px] font-medium text-[var(--color-text-muted)]">{item.value > 0 ? (formatLabel ? formatLabel(item.value) : moneyLabel(item.value)) : ''}</span>
              <div className="w-full max-w-10 rounded-t-md bg-[var(--color-primary)]/80 transition-all" style={{ height: `${height}px` }} />
              <span className="pb-2 text-[10px] text-[var(--color-text-muted)]">{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface MoneyActivityReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: ActivityTemplate | null
  logs: ActivityLog[]
  onEdit: (template: ActivityTemplate) => void
}

export function MoneyActivityReportDialog({ open, onOpenChange, template, logs, onEdit }: MoneyActivityReportDialogProps) {
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [year, setYear] = useState(new Date().getFullYear())
  const [reportLogs, setReportLogs] = useState<ActivityLog[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !template) return
    let cancelled = false
    setIsLoadingHistory(true)
    setHistoryError(null)
    setReportLogs(logs.filter(log => log.activityId === template.id))
    getActivityReportLogs(template.id)
      .then(records => { if (!cancelled) setReportLogs(records as ActivityLog[]) })
      .catch(error => { if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'Could not load complete activity history.') })
      .finally(() => { if (!cancelled) setIsLoadingHistory(false) })
    return () => { cancelled = true }
  }, [open, template, logs])

  const points = useMemo<MoneyPoint[]>(() => reportLogs
    .filter(log => log.activityId === template?.id && !['skipped', 'canceled', 'cancelled', 'postponed'].includes(log.status.toLowerCase()))
    .map(log => ({ date: String(log.date || log.logDate || '').slice(0, 10), amount: template ? (readAmount(log, template) ?? 0) : 0 }))
    .filter(point => point.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(point.date))
    .sort((a, b) => a.date.localeCompare(b.date)), [reportLogs, template])

  const monthlyData = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0')
    return {
      label: new Date(year, index, 1).toLocaleDateString('en-US', { month: 'short' }),
      value: points.filter(point => point.date.startsWith(`${year}-${month}-`)).reduce((sum, point) => sum + point.amount, 0),
    }
  }), [points, year])

  const yearlyData = useMemo(() => {
    const years = Array.from(new Set(points.map(point => Number(point.date.slice(0, 4)))))
    if (!years.includes(year)) years.push(year)
    const visibleYears = years.sort((a, b) => a - b).slice(-6)
    return visibleYears.map(itemYear => ({
      label: String(itemYear),
      value: points.filter(point => point.date.startsWith(`${itemYear}-`)).reduce((sum, point) => sum + point.amount, 0),
    }))
  }, [points, year])

  const monthlyTotal = monthlyData.reduce((sum, item) => sum + item.value, 0)
  const selectedMonth = new Date().getFullYear() === year ? new Date().getMonth() : 0
  const currentMonthTotal = monthlyData[selectedMonth]?.value ?? 0
  const averageMonthly = monthlyTotal / 12

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <ChartColumnIncreasing size={20} />
            </div>
            <div className="min-w-0">
              <DialogTitle>{template.name} — Spending report</DialogTitle>
              <DialogDescription>Monthly and yearly spending based on recorded activity logs.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-[var(--color-border)] p-1">
              <button type="button" onClick={() => setView('monthly')} className={`rounded-md px-3 py-1.5 text-sm ${view === 'monthly' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>Monthly</button>
              <button type="button" onClick={() => setView('yearly')} className={`rounded-md px-3 py-1.5 text-sm ${view === 'yearly' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>Yearly</button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setYear(value => value - 1)} aria-label="Previous year">←</Button>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><CalendarDays size={14} />{year}</span>
              <Button variant="outline" size="sm" onClick={() => setYear(value => Math.min(new Date().getFullYear(), value + 1))} disabled={year >= new Date().getFullYear()} aria-label="Next year">→</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Total in {year}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{moneyLabel(monthlyTotal)}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Monthly average</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{moneyLabel(averageMonthly)}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-text-muted)]">{new Date(year, selectedMonth, 1).toLocaleDateString('en-US', { month: 'long' })} total</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{moneyLabel(currentMonthTotal)}</p>
            </div>
          </div>

          <section className="rounded-xl border border-[var(--color-border)] p-4">
            <h3 className="mb-1 text-sm font-semibold">{view === 'monthly' ? `Month-by-month spending · ${year}` : 'Year-by-year spending'}</h3>
            <p className="mb-4 text-xs text-[var(--color-text-muted)]">{view === 'monthly' ? 'Each bar shows the total recorded for that month.' : 'Compare yearly totals across recorded history.'}</p>
            {(view === 'monthly' ? monthlyData : yearlyData).some(item => item.value > 0) ? (
              <BarChart data={view === 'monthly' ? monthlyData : yearlyData} formatLabel={value => value >= 1000 ? `₹${(value / 1000).toFixed(1)}k` : `₹${Math.round(value)}`} />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg bg-[var(--color-bg-subtle)] text-center text-sm text-[var(--color-text-muted)]">No spending records for {year} yet.</div>
            )}
          </section>
          <p className="text-xs text-[var(--color-text-muted)]">{isLoadingHistory ? 'Loading complete activity history… ' : ''}{points.length} spending record{points.length === 1 ? '' : 's'} included. {historyError ? `History refresh failed: ${historyError}. Showing locally available records.` : 'History is loaded from saved activity logs.'}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close report</Button>
          <Button onClick={() => { onOpenChange(false); onEdit(template) }} icon={<Pencil size={14} />}>Edit activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
