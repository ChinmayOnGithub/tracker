"use client"

import React, { useState, useCallback, useEffect } from 'react'
import { Plus, Minus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { useStore, WeightRecord } from '@/lib/store/store'
import { Input, Button, Card } from '@/design-system'
import { notify } from '@/lib/notifications'
import { todayYMD, toYMD, fmtDateShort, fmtDateMed } from '@/lib/dateUtils'

interface WeightPanelProps {
  initialRecords: WeightRecord[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Premium SVG Chart (no external dependencies)
// ---------------------------------------------------------------------------
export interface SparklineProps {
  data: { date: string; weight: number }[]
  width?: number
  height?: number
}

export function Sparkline({ data, width = 600, height = 160 }: SparklineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const gradId = React.useId()
  
  if (data.length === 0) return null

  // Margins
  const padLeft = 45
  const padRight = 15
  const padTop = 15
  const padBottom = 25
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  // Single-record state: render a clear single point indicator without fabricating a trend
  if (data.length === 1) {
    const single = data[0]
    const x = padLeft + chartW / 2
    const y = padTop + chartH / 2

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full select-none" style={{ height }}>
          <line
            x1={padLeft}
            y1={y}
            x2={width - padRight}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <text
            x={padLeft - 8}
            y={y + 3}
            textAnchor="end"
            className="text-[9px] font-mono fill-[var(--color-text-muted)] tabular-nums"
          >
            {single.weight.toFixed(1)}
          </text>
          <text
            x={x}
            y={height - 8}
            textAnchor="middle"
            className="text-[9px] font-mono fill-[var(--color-text-muted)]"
          >
            {fmtDateMed(single.date)}
          </text>
          <circle
            cx={x}
            cy={y}
            r="6"
            fill="var(--color-primary)"
            stroke="var(--color-bg-surface)"
            strokeWidth="2"
          />
          <text
            x={x}
            y={y - 12}
            textAnchor="middle"
            className="text-[11px] font-bold fill-[var(--color-text-main)]"
          >
            {single.weight.toFixed(1)} kg
          </text>
        </svg>
        <div className="text-center text-[10px] text-[var(--color-text-muted)] mt-1 font-medium">
          Single measurement recorded ({fmtDateMed(single.date)}). Add more entries to visualize your weight trend.
        </div>
      </div>
    )
  }

  const weights = data.map(d => d.weight)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1

  // 7-day rolling average calculation
  const rollingAvg = data.map((_d, i) => {
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
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
                className="text-[9px] font-mono fill-[var(--color-text-muted)] tabular-nums"
              >
                {val.toFixed(1)}
              </text>
            </g>
          )
        })}

        {/* X-axis Date labels */}
        {dateTicks.map((pt, idx) => {
          const label = fmtDateMed(pt.date)
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
        <path d={areaD} fill={`url(#${gradId})`} />

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
            {fmtDateShort(pts[hoveredIdx].date)}
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
  onLogged?: (record: WeightRecord) => void
}

function LogForm({ todayRecord, onLogged: _onLogged }: LogFormProps) {
  const [weight, setWeight] = useState(todayRecord ? String(todayRecord.weight) : '')
  const [notes, setNotes] = useState(todayRecord?.notes ?? '')
  const [logDate, setLogDate] = useState(todayYMD())
  const [saving, setSaving] = useState(false)

  const handleDateChange = (newDate: string) => {
    setLogDate(newDate)
    if (newDate === todayYMD() && todayRecord) {
      setWeight(String(todayRecord.weight))
      setNotes(todayRecord.notes ?? '')
    }
  }

  const { logWeightAction } = useStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const w = parseFloat(weight)
    if (isNaN(w) || w <= 0) return
    setSaving(true)
    try {
      await logWeightAction(logDate, w, notes || null)
      notify.saved('Weight record')
    } catch (err) {
      console.error(err)
      notify.error('Failed to save weight record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">
          ⚖️ Log Weight Record
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="date"
            label="Record Date"
            value={logDate}
            onChange={e => handleDateChange(e.target.value)}
            required
          />
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Input
                type="number"
                step="0.1"
                min="20"
                max="500"
                label="Weight (kg)"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 72.5"
                required
                className="pr-10 text-lg font-black"
              />
              <span className="absolute right-3 bottom-2.5 text-xs font-bold text-[var(--color-text-muted)]">kg</span>
            </div>

            <div className="flex gap-1 pb-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWeight(w => (parseFloat(w || '0') + 0.1).toFixed(1))}
                className="w-8 h-8 p-0"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWeight(w => Math.max(0, parseFloat(w || '0') - 0.1).toFixed(1))}
                className="w-8 h-8 p-0"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <Input
          type="text"
          label="Notes (Optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Morning weight, post-workout"
        />

        <Button
          type="submit"
          disabled={saving || !weight}
          isLoading={saving}
          className="w-full"
        >
          Save Weight Record
        </Button>
      </Card>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------
export const WeightPanel: React.FC<WeightPanelProps> = ({ initialRecords }) => {
  const { state, initialize, deleteWeightAction } = useStore()

  useEffect(() => {
    initialize({ weightRecords: initialRecords })
  }, [initialRecords, initialize])

  const records = state.weightRecords.length > 0 ? state.weightRecords : initialRecords
  const [period, setPeriod] = useState<'30D' | '60D' | '90D' | 'All'>('30D')
  const [heightCm, setHeightCm] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tracker-user-height')
      return saved ? Number(saved) : 175
    }
    return 175
  })
  const today = todayYMD()

  const handleHeightChange = (val: number) => {
    setHeightCm(val)
    if (typeof window !== 'undefined') {
      localStorage.setItem('tracker-user-height', String(val))
    }
  }

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

  // BMI calculation
  const heightM = heightCm / 100
  const bmi = current ? current / (heightM * heightM) : null
  const bmiCategory = !bmi ? ''
    : bmi < 18.5 ? 'Underweight'
    : bmi < 25.0 ? 'Healthy'
    : bmi < 30.0 ? 'Overweight'
    : 'Obese'

  const handleLogged = useCallback((_record: WeightRecord) => {
    // No-op since store handles state updates
  }, [])

  const handleDelete = async (id: string) => {
    await deleteWeightAction(id)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div>
          <h1 className="text-xl font-black text-[var(--color-text-main)] tracking-tight">Weight Tracker</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {records.length} log{records.length !== 1 ? 's' : ''} recorded
          </p>
        </div>

        {/* Height Settings */}
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
          <span>Height:</span>
          <div className="relative">
            <input
              type="number"
              min="100"
              max="250"
              value={heightCm}
              onChange={e => handleHeightChange(Number(e.target.value) || 175)}
              className="w-16 px-2 py-1 text-center font-black border border-[var(--color-border)] rounded-md bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-hidden"
            />
            <span className="absolute right-2 top-1.5 text-[10px] text-[var(--color-text-muted)] pointer-events-none">cm</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {current !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatsPill label="Current" value={`${current.toFixed(1)} kg`} />
          <StatsPill label="Lowest" value={lowest !== null ? `${lowest.toFixed(1)} kg` : '—'} />
          <StatsPill label="Highest" value={highest !== null ? `${highest.toFixed(1)} kg` : '—'} />
          <StatsPill label="Average" value={avg !== null ? `${avg.toFixed(1)} kg` : '—'} />
          <StatsPill
            label="BMI"
            value={bmi !== null ? `${bmi.toFixed(1)}` : '—'}
            subText={bmiCategory}
          />
        </div>
      )}

      {/* Chart */}
      {chartData.length >= 1 ? (
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                Weight Trend
              </h2>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {chartData.length > 1
                  ? `${fmtDateShort(chartData[0].date)} → ${fmtDateShort(chartData[chartData.length - 1].date)}`
                  : fmtDateShort(chartData[0].date)}
              </span>
            </div>
            {chartData.length > 1 && (
              <div className="flex bg-slate-100 dark:bg-zinc-900/60 p-0.5 rounded-[9px] shadow-inner text-[10px] self-start">
                {(['30D', '60D', '90D', 'All'] as const).map(p => (
                  <Button
                    key={p}
                    type="button"
                    variant={period === p ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 text-center font-bold rounded-md transition-all duration-200 cursor-pointer ${
                      period === p
                        ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                        : 'text-slate-500 dark:text-zinc-550 hover:text-slate-700 dark:hover:text-zinc-300 border-none bg-transparent shadow-none hover:bg-transparent'
                    }`}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Sparkline data={chartData} />
        </div>
      ) : (
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-6 text-center text-xs text-[var(--color-text-muted)] space-y-2">
          <p className="font-bold">📈 Weight Trend Graph</p>
          <p className="opacity-75">No logs recorded yet. Please log your weight above to view your progress graph.</p>
        </div>
      )}

      {/* Log Form */}
      <LogForm key={todayRecord?.id || 'new'} todayRecord={todayRecord} onLogged={handleLogged} />

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
                      <span className="text-[10px] text-[var(--color-text-muted)]">{fmtDateShort(record.date)}</span>
                      {record.notes && (
                        <span className="text-[10px] text-[var(--color-text-muted)] truncate">· {record.notes}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(record.id)}
                    className="opacity-0 sm:group-hover:opacity-100 p-1.5"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

