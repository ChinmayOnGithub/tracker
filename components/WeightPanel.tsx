"use client"

import React, { useState, useCallback } from 'react'
import { logWeight, deleteWeightRecord } from '@/app/actions/weight'
import { Scale, TrendingDown, TrendingUp, Minus, Trash2, Plus } from 'lucide-react'
import { Input, Button, Card } from '@/design-system'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WeightRecord {
  id: string
  date: Date | string
  weight: number
  notes: string | null
}

interface WeightPanelProps {
  initialRecords: WeightRecord[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function toYMD(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dy = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

// ---------------------------------------------------------------------------
// Premium SVG Chart (no external dependencies)
// ---------------------------------------------------------------------------
interface SparklineProps {
  data: { date: string; weight: number }[]
  width?: number
  height?: number
}

function Sparkline({ data, width = 600, height = 160 }: SparklineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  
  if (data.length < 2) return null

  // Margins
  const padLeft = 45
  const padRight = 15
  const padTop = 15
  const padBottom = 25
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const weights = data.map(d => d.weight)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1

  // 7-day rolling average calculation
  const rollingAvg = data.map((d, i) => {
    const startIdx = Math.max(0, i - 6)
    const slice = data.slice(startIdx, i + 1)
    const avg = slice.reduce((sum, item) => sum + item.weight, 0) / slice.length
    return avg
  })

  // Map to SVG coordinates
  const pts = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1)) * chartW
    const y = padTop + chartH - ((d.weight - minW) / range) * chartH
    return { x, y, ...d }
  })

  const avgPts = rollingAvg.map((w, i) => {
    const x = padLeft + (i / (data.length - 1)) * chartW
    const y = padTop + chartH - ((w - minW) / range) * chartH
    return { x, y }
  })

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${width - padRight},${height - padBottom} L${padLeft},${height - padBottom} Z`

  const avgPathD = avgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const trend = data[data.length - 1].weight - data[0].weight

  // Grid line levels
  const gridLevels = 3
  const yValStep = (maxW - minW) / gridLevels
  const gridYValues = Array.from({ length: gridLevels + 1 }, (_, i) => minW + yValStep * i)

  // X-axis date markings (4-5 items)
  const dateTickInterval = Math.max(1, Math.floor(data.length / 4))
  const dateTicks = pts.filter((_, idx) => idx % dateTickInterval === 0 || idx === data.length - 1)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full select-none" style={{ height }}>
        <defs>
          <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines and Y-axis text */}
        {gridYValues.map((val, idx) => {
          const y = padTop + chartH - ((val - minW) / range) * chartH
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[9px] font-mono fill-[var(--color-text-muted)]"
              >
                {val.toFixed(1)}
              </text>
            </g>
          )
        })}

        {/* X-axis Date labels */}
        {dateTicks.map((pt, idx) => {
          const d = new Date(pt.date)
          const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          return (
            <text
              key={idx}
              x={pt.x}
              y={height - 8}
              textAnchor="middle"
              className="text-[9px] font-mono fill-[var(--color-text-muted)]"
            >
              {label}
            </text>
          )
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#wGrad)" />

        {/* Rolling average dashed line */}
        <path
          d={avgPathD}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeOpacity="0.5"
        />

        {/* Main Line */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover vertical line and tooltip marker */}
        {hoveredIdx !== null && pts[hoveredIdx] && (
          <g>
            <line
              x1={pts[hoveredIdx].x}
              y1={padTop}
              x2={pts[hoveredIdx].x}
              y2={height - padBottom}
              stroke="var(--color-primary)"
              strokeOpacity="0.2"
              strokeWidth="1"
            />
            <circle
              cx={pts[hoveredIdx].x}
              cy={pts[hoveredIdx].y}
              r="5"
              fill="var(--color-primary)"
              stroke="var(--color-bg-surface)"
              strokeWidth="2.5"
            />
            {/* Rolling average dot when hovered */}
            {avgPts[hoveredIdx] && (
              <circle
                cx={avgPts[hoveredIdx].x}
                cy={avgPts[hoveredIdx].y}
                r="3.5"
                fill="var(--color-primary)"
                fillOpacity="0.5"
                stroke="var(--color-bg-surface)"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}

        {/* Latest point dot (when not hovering) */}
        {hoveredIdx === null && pts.length > 0 && (
          <circle
            cx={pts[pts.length - 1].x}
            cy={pts[pts.length - 1].y}
            r="4.5"
            fill="var(--color-primary)"
            stroke="var(--color-bg-surface)"
            strokeWidth="2"
          />
        )}

        {/* Invisible mouse hover listener slices */}
        {pts.map((pt, idx) => {
          const sliceW = chartW / (pts.length - 1 || 1)
          const sliceX = pt.x - sliceW / 2
          return (
            <rect
              key={idx}
              x={sliceX}
              y={padTop}
              width={sliceW}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            />
          )
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredIdx !== null && pts[hoveredIdx] && (
        <div
          className="absolute pointer-events-none bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 shadow-md text-left z-10 text-[10px]"
          style={{
            left: `${Math.min(width - 110, Math.max(padLeft, pts[hoveredIdx].x - 50))}px`,
            top: `${Math.max(10, pts[hoveredIdx].y - 45)}px`,
          }}
        >
          <div className="font-bold text-[var(--color-text-main)]">
            {pts[hoveredIdx].weight.toFixed(1)} kg
          </div>
          <div className="text-[8px] text-[var(--color-text-muted)] font-semibold mt-0.5">
            {new Date(pts[hoveredIdx].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* Trend indicator */}
      <div className="absolute top-1 right-1 flex items-center gap-1.5 text-[10px] font-bold">
        <span className="text-[8px] text-[var(--color-text-muted)] font-normal mr-1">
          7D Avg (dashed)
        </span>
        {Math.abs(trend) < 0.1 ? (
          <Minus className="w-3 h-3 text-[var(--color-text-muted)]" />
        ) : trend < 0 ? (
          <TrendingDown className="w-3 h-3 text-emerald-500" />
        ) : (
          <TrendingUp className="w-3 h-3 text-amber-500" />
        )}
        <span className={trend < 0 ? 'text-emerald-500' : trend > 0 ? 'text-amber-500' : 'text-[var(--color-text-muted)]'}>
          {trend > 0 ? '+' : ''}{trend.toFixed(1)} kg
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats Row
// ---------------------------------------------------------------------------
function StatsPill({ label, value, subText }: { label: string; value: string; subText?: string }) {
  return (
    <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-center flex flex-col justify-center">
      <div className="text-base font-black text-[var(--color-text-main)] leading-none">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mt-1.5 leading-none">{label}</div>
      {subText && (
        <div className="text-[8px] font-medium text-[var(--color-text-muted)] mt-1 opacity-75 leading-none">{subText}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Log Form
// ---------------------------------------------------------------------------
interface LogFormProps {
  todayRecord: WeightRecord | null
  onLogged: (record: WeightRecord) => void
}

function LogForm({ todayRecord, onLogged }: LogFormProps) {
  const [weight, setWeight] = useState(todayRecord ? String(todayRecord.weight) : '')
  const [notes, setNotes] = useState(todayRecord?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const w = parseFloat(weight)
    if (isNaN(w) || w <= 0) return
    setSaving(true)
    const res = await logWeight(todayYMD(), w, notes || null)
    if (res.success && res.record) {
      onLogged(res.record as WeightRecord)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">
          {todayRecord ? '✏️ Update' : '⚖️ Log'} Today&apos;s Weight
        </h2>

        <div className="flex items-center gap-3">
          {/* Weight input */}
          <div className="flex-1 relative">
            <Input
              type="number"
              step="0.1"
              min="20"
              max="500"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="e.g. 72.5"
              required
              className="pr-10 text-lg font-black"
            />
            <span className="absolute right-3 bottom-2.5 text-xs font-bold text-[var(--color-text-muted)]">kg</span>
          </div>

          {/* Increment / Decrement */}
          <div className="flex flex-col gap-1 pt-5">
            <button
              type="button"
              onClick={() => setWeight(w => (parseFloat(w || '0') + 0.1).toFixed(1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setWeight(w => Math.max(0, parseFloat(w || '0') - 0.1).toFixed(1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <Input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional — e.g. post-workout)"
        />

        <Button
          type="submit"
          disabled={saving || !weight}
          isLoading={saving}
          className="w-full"
        >
          {saved ? '✓ Saved!' : todayRecord ? 'Update Weight' : 'Log Weight'}
        </Button>
      </Card>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------
export const WeightPanel: React.FC<WeightPanelProps> = ({ initialRecords }) => {
  const [records, setRecords] = useState<WeightRecord[]>(initialRecords)
  const [period, setPeriod] = useState<'30D' | '60D' | '90D' | 'All'>('30D')
  const today = todayYMD()

  const todayRecord = records.find(r => toYMD(r.date) === today) ?? null

  const sorted = [...records].sort((a, b) => toYMD(a.date).localeCompare(toYMD(b.date)))

  // Filter records based on selected period
  const getFilteredChartData = () => {
    if (period === '30D') return sorted.slice(-30)
    if (period === '60D') return sorted.slice(-60)
    if (period === '90D') return sorted.slice(-90)
    return sorted
  }

  const filteredData = getFilteredChartData()
  const chartData = filteredData.map(r => ({ date: toYMD(r.date), weight: r.weight }))

  const weights = sorted.map(r => r.weight)
  const current = weights[weights.length - 1] ?? null
  const lowest = weights.length ? Math.min(...weights) : null
  const highest = weights.length ? Math.max(...weights) : null
  const avg = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null

  // BMI calculation (constant height 175cm = 1.75m)
  const heightM = 1.75
  const bmi = current ? current / (heightM * heightM) : null
  const bmiCategory = !bmi ? ''
    : bmi < 18.5 ? 'Underweight'
    : bmi < 25.0 ? 'Healthy'
    : bmi < 30.0 ? 'Overweight'
    : 'Obese'


  const handleLogged = useCallback((record: WeightRecord) => {
    setRecords(prev => {
      const exists = prev.findIndex(r => toYMD(r.date) === toYMD(record.date))
      if (exists >= 0) {
        const copy = [...prev]; copy[exists] = record; return copy
      }
      return [...prev, record].sort((a, b) => toYMD(a.date).localeCompare(toYMD(b.date)))
    })
  }, [])

  const handleDelete = async (id: string) => {
    await deleteWeightRecord(id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[var(--color-text-main)]">Weight Tracker</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {records.length} log{records.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <Scale className="w-6 h-6 text-[var(--color-text-muted)]" />
      </div>

      {/* Stats Row */}
      {current !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatsPill label="Current" value={`${current.toFixed(1)}`} />
          <StatsPill label="Lowest" value={lowest !== null ? `${lowest.toFixed(1)}` : '—'} />
          <StatsPill label="Highest" value={highest !== null ? `${highest.toFixed(1)}` : '—'} />
          <StatsPill label="Average" value={avg !== null ? `${avg.toFixed(1)}` : '—'} />
          <StatsPill
            label="BMI"
            value={bmi !== null ? `${bmi.toFixed(1)}` : '—'}
            subText={bmiCategory}
          />
        </div>
      )}

      {/* Chart */}
      {chartData.length >= 2 ? (
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                Weight Trend
              </h2>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {fmtDate(chartData[0].date)} → {fmtDate(chartData[chartData.length - 1].date)}
              </span>
            </div>
            {/* Period selector */}
            <div className="flex items-center gap-1 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-lg p-0.5 self-start">
              {(['30D', '60D', '90D', 'All'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black cursor-pointer transition-all ${
                    period === p
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Sparkline data={chartData} />
        </div>
      ) : (
        records.length >= 2 && (
          <div className="py-6 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl">
            Not enough data in the selected period.
          </div>
        )
      )}

      {/* Log Form */}
      <LogForm todayRecord={todayRecord} onLogged={handleLogged} />

      {/* History Table */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
            History
          </h2>
        </div>
        {records.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
            No entries yet. Log your first weight above.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
            {[...records].sort((a, b) => toYMD(b.date).localeCompare(toYMD(a.date))).map((record, idx, arr) => {
              const prev = arr[idx + 1]
              const delta = prev ? record.weight - prev.weight : null
              return (
                <div key={record.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--color-accent)] transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--color-text-main)]">
                        {record.weight.toFixed(1)} kg
                      </span>
                      {delta !== null && Math.abs(delta) >= 0.05 && (
                        <span className={`text-[10px] font-bold ${delta < 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--color-text-muted)]">{fmtDate(record.date)}</span>
                      {record.notes && (
                        <span className="text-[10px] text-[var(--color-text-muted)] truncate">· {record.notes}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

