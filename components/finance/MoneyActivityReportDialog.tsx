"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { ActivityTemplate, ActivityLog } from '@/types'
import { formatMoney } from '@/lib/formatMoney'
import { getActivityReportLogs } from '@/app/actions/activity-report'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/design-system'
import { CalendarDays, ChartColumnIncreasing, Pencil, RefreshCw } from 'lucide-react'

type ReportLog = ActivityLog & { date?: string; logDate?: string | Date; amount?: number | null; payload?: unknown }
const historyCache = new Map<string, { savedAt: number; records: ReportLog[] }>()
const HISTORY_CACHE_TTL = 2 * 60 * 1000

function readAmount(log: ReportLog, template: ActivityTemplate): number | null {
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
    const metadata = template.metadata && typeof template.metadata === 'object'
      ? template.metadata as Record<string, unknown>
      : typeof template.metadata === 'string'
        ? (() => { try { return JSON.parse(template.metadata as string) as Record<string, unknown> } catch { return {} } })()
        : {}
    const completion = metadata.completion && typeof metadata.completion === 'object' ? completionObject(metadata.completion) : {}
    const schema = (completion.schema || completion.form) as { fields?: Array<{ id: string; label?: string; type?: string; unit?: string }> } | undefined
    const sources = [
      obj.value && typeof obj.value === 'object' && !Array.isArray(obj.value) ? obj.value as Record<string, unknown> : null,
      obj.values && typeof obj.values === 'object' && !Array.isArray(obj.values) ? obj.values as Record<string, unknown> : null,
      obj,
    ]
    const moneyKey = /amount|cost|price|spent|total|payment|money|expense|bill|fee|charge|currency/i
    for (const field of schema?.fields || []) {
      if (field.type === 'currency' || /₹|\$|€|£|\bINR\b|\bUSD\b|\bEUR\b|\bGBP\b/i.test(field.unit || '') || moneyKey.test(field.id) || moneyKey.test(field.label || '')) {
        for (const source of sources) {
          if (source && Object.prototype.hasOwnProperty.call(source, field.id)) {
            const amount = numeric(source[field.id])
            if (amount !== null) return amount
          }
        }
      }
    }
    for (const source of sources) {
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
function completionObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
function dateKey(log: ReportLog): string {
  const value = log.date || log.logDate
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value instanceof Date ? value.toISOString().slice(0, 10) : ''
}
function isSkipped(log: ReportLog): boolean {
  return ['skipped', 'canceled', 'cancelled', 'postponed', 'deleted'].includes(String(log.status || '').toLowerCase())
}
function Chart({ data, money }: { data: { label: string; value: number }[]; money: boolean }) {
  const max = Math.max(1, ...data.map(item => item.value))
  return (
    <div className="w-full min-w-0">
      <div className="grid h-44 w-full items-end gap-1 border-b border-[var(--color-border)] px-1 pt-4 sm:gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map(item => {
          const height = item.value > 0 ? Math.max(4, (item.value / max) * 112) : 2
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5" title={`${item.label}: ${money ? moneyLabel(item.value) : item.value}`}>
              <span className="w-full truncate text-center text-[9px] font-medium text-[var(--color-text-muted)] sm:text-[10px]">
                {item.value > 0 ? (money ? (item.value >= 1000 ? `₹${(item.value / 1000).toFixed(1)}k` : `₹${Math.round(item.value)}`) : String(item.value)) : ''}
              </span>
              <div className="w-full max-w-8 rounded-t-md bg-[var(--color-primary)]/80 transition-[height] duration-300" style={{ height: `${height}px` }} />
              <span className="text-[9px] text-[var(--color-text-muted)] sm:text-[10px]">{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
function ActivityHeatmap({ dates, year }: { dates: string[]; year: number }) {
  const counts = useMemo(() => dates.reduce<Record<string, number>>((result, date) => {
    if (date.startsWith(`${year}-`)) result[date] = (result[date] || 0) + 1
    return result
  }, {}), [dates, year])
  const days = useMemo(() => {
    const start = new Date(year, 0, 1)
    const end = new Date(year + 1, 0, 1)
    const offset = (start.getDay() + 6) % 7
    const result: { key: string; count: number; month?: string }[] = []
    for (let i = 0; i < offset; i++) result.push({ key: `pad-${i}`, count: 0 })
    for (let date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
      const key = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      result.push({ key, count: counts[key] || 0, month: date.getDate() === 1 ? date.toLocaleDateString('en-US', { month: 'short' }) : undefined })
    }
    return result
  }, [year, counts])
  const max = Math.max(1, ...Object.values(counts))
  return (
    <section className="rounded-2xl border border-[var(--color-border)] p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold">Activity consistency</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">Every square is a day. Darker means more entries.</p></div>
        <span className="shrink-0 rounded-full bg-[var(--color-bg-subtle)] px-2.5 py-1 text-xs">{Object.keys(counts).length ? Object.keys(counts).length : 0} days</span>
      </div>
      <div className="grid w-full grid-flow-col grid-rows-7 gap-[3px] sm:gap-1" style={{ gridTemplateColumns: `repeat(${Math.ceil(days.length / 7)}, minmax(0, 1fr))` }}>
        {days.map(day => {
          const intensity = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / max) * 4))
          return <div key={day.key} title={day.key.startsWith('pad-') ? '' : `${day.key}: ${day.count} entr${day.count === 1 ? 'y' : 'ies'}`} className={`aspect-square min-w-0 rounded-[2px] ${day.key.startsWith('pad-') ? 'invisible' : intensity === 0 ? 'bg-[var(--color-bg-subtle)]' : intensity === 1 ? 'bg-[var(--color-primary)]/25' : intensity === 2 ? 'bg-[var(--color-primary)]/45' : intensity === 3 ? 'bg-[var(--color-primary)]/70' : 'bg-[var(--color-primary)]'}`} />
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-[var(--color-text-muted)]"><span>Less</span>{[0,1,2,3,4].map(level => <span key={level} className={`h-2.5 w-2.5 rounded-[2px] ${level === 0 ? 'bg-[var(--color-bg-subtle)]' : level === 1 ? 'bg-[var(--color-primary)]/25' : level === 2 ? 'bg-[var(--color-primary)]/45' : level === 3 ? 'bg-[var(--color-primary)]/70' : 'bg-[var(--color-primary)]'}`} />)}<span>More</span></div>
    </section>
  )
}

interface ActivityReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: ActivityTemplate | null
  logs: ActivityLog[]
  onEdit: (template: ActivityTemplate) => void
}
export function MoneyActivityReportDialog({ open, onOpenChange, template, logs, onEdit }: ActivityReportDialogProps) {
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [year, setYear] = useState(new Date().getFullYear())
  const [reportLogs, setReportLogs] = useState<ReportLog[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const money = template ? isMoneyActivity(template) : false

  useEffect(() => {
    if (!open || !template) return
    let cancelled = false
    const cached = historyCache.get(template.id)
    const isFresh = cached && Date.now() - cached.savedAt < HISTORY_CACHE_TTL
    if (isFresh) {
      setReportLogs(cached.records)
      setIsLoadingHistory(false)
      setHistoryError(null)
      return
    }
    setIsLoadingHistory(true)
    setHistoryError(null)
    setReportLogs(cached?.records || (logs.filter(log => log.activityId === template.id) as ReportLog[]))
    getActivityReportLogs(template.id)
      .then(records => {
        const normalized = records as ReportLog[]
        historyCache.set(template.id, { savedAt: Date.now(), records: normalized })
        if (!cancelled) setReportLogs(normalized)
      })
      .catch(error => { if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'Could not load complete activity history.') })
      .finally(() => { if (!cancelled) setIsLoadingHistory(false) })
    return () => { cancelled = true }
  }, [open, template, logs])

  const entries = useMemo(() => reportLogs
    .filter(log => log.activityId === template?.id && !isSkipped(log))
    .map(log => ({ date: dateKey(log), amount: money && template ? readAmount(log, template) : null }))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .sort((a, b) => a.date.localeCompare(b.date)), [reportLogs, template, money])
  const yearlyData = useMemo(() => Array.from(new Set([...entries.map(item => Number(item.date.slice(0, 4))), year])).sort((a, b) => a - b).slice(-6).map(y => ({
    label: String(y),
    value: entries.filter(item => item.date.startsWith(`${y}-`)).reduce((sum, item) => sum + (money ? Math.max(0, item.amount || 0) : 1), 0),
  })), [entries, year, money])
  const monthlyData = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0')
    return { label: new Date(year, index, 1).toLocaleDateString('en-US', { month: 'short' }), value: entries.filter(item => item.date.startsWith(`${year}-${month}-`)).reduce((sum, item) => sum + (money ? Math.max(0, item.amount || 0) : 1), 0) }
  }), [entries, year, money])
  const yearEntries = entries.filter(item => item.date.startsWith(`${year}-`))
  const activeDays = new Set(yearEntries.map(item => item.date)).size
  const yearTotal = yearEntries.reduce((sum, item) => sum + (money ? Math.max(0, item.amount || 0) : 1), 0)
  const totalLabel = money ? moneyLabel(yearTotal) : String(yearTotal)
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : 0
  const currentMonthTotal = monthlyData[currentMonth]?.value ?? 0
  const average = yearTotal / 12
  const dates = entries.map(item => item.date)

  if (!template) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]"><ChartColumnIncreasing size={20} /></div>
            <div className="min-w-0"><DialogTitle>{template.name} — Activity report</DialogTitle><DialogDescription>{money ? 'Spending trends and activity consistency.' : 'Completion trends and activity consistency.'} History is fetched once when this report opens.</DialogDescription></div>
          </div>
        </DialogHeader>
        <div className="space-y-4 p-1 sm:p-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-[var(--color-border)] p-1">
              <button type="button" onClick={() => setView('monthly')} aria-pressed={view === 'monthly'} className={`rounded-lg px-3 py-2 text-sm transition-colors active:scale-[.98] ${view === 'monthly' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'}`}>Monthly</button>
              <button type="button" onClick={() => setView('yearly')} aria-pressed={view === 'yearly'} className={`rounded-lg px-3 py-2 text-sm transition-colors active:scale-[.98] ${view === 'yearly' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'}`}>Yearly</button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setYear(value => value - 1)} aria-label="Previous year">←</Button>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><CalendarDays size={14} />{year}</span>
              <Button variant="outline" size="sm" onClick={() => setYear(value => Math.min(new Date().getFullYear(), value + 1))} disabled={year >= new Date().getFullYear()} aria-label="Next year">→</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--color-border)] p-3"><p className="text-xs text-[var(--color-text-muted)]">{money ? 'Recorded spend' : 'Entries'} · {year}</p><p className="mt-1 break-words text-lg font-bold tabular-nums">{totalLabel}</p></div>
            <div className="rounded-2xl border border-[var(--color-border)] p-3"><p className="text-xs text-[var(--color-text-muted)]">Active days</p><p className="mt-1 text-lg font-bold tabular-nums">{activeDays}</p></div>
            <div className="rounded-2xl border border-[var(--color-border)] p-3"><p className="text-xs text-[var(--color-text-muted)]">Avg / month</p><p className="mt-1 break-words text-lg font-bold tabular-nums">{money ? moneyLabel(average) : average.toFixed(1)}</p></div>
            <div className="rounded-2xl border border-[var(--color-border)] p-3"><p className="text-xs text-[var(--color-text-muted)]">This month</p><p className="mt-1 break-words text-lg font-bold tabular-nums">{money ? moneyLabel(currentMonthTotal) : currentMonthTotal}</p></div>
          </div>
          <section className="rounded-2xl border border-[var(--color-border)] p-4 sm:p-5">
            <div className="mb-3"><h3 className="text-sm font-semibold">{view === 'monthly' ? `Monthly ${money ? 'spending' : 'activity'} · ${year}` : `Yearly ${money ? 'spending' : 'activity'}`}</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">{money ? 'Totals from saved monetary entries.' : 'Number of saved activity entries per period.'}</p></div>
            <Chart data={view === 'monthly' ? monthlyData : yearlyData} money={money} />
            {!entries.length && <p className="mt-3 rounded-xl bg-[var(--color-bg-subtle)] p-3 text-center text-sm text-[var(--color-text-muted)]">No saved entries for this activity yet.</p>}
          </section>
          <ActivityHeatmap dates={dates} year={year} />
          <p className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]" role="status">
            {isLoadingHistory ? <RefreshCw size={14} className="mt-0.5 animate-spin" /> : <CalendarDays size={14} className="mt-0.5" />}
            <span>{isLoadingHistory ? 'Loading saved history…' : historyError ? `Could not refresh full history. Showing locally available entries. ${historyError}` : `Showing ${entries.length} saved entr${entries.length === 1 ? 'y' : 'ies'} across all available history.`}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close report</Button>
          <Button onClick={() => { onOpenChange(false); onEdit(template) }} icon={<Pencil size={14} />}>Edit activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
