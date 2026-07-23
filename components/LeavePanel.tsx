"use client"

import React, { useState, useTransition, useEffect } from 'react'
import {
  createLeaveRequest, updateLeaveStatus, deleteLeaveRecord, ensureLeaveAllowances, updateLeaveAllowance
} from '@/app/actions/leave'
import { useRouter } from 'next/navigation'
import {
  CalendarX, Plus, Trash2, CheckCircle2, Clock, XCircle, TrendingDown, ChevronDown
} from 'lucide-react'
import { Input, Select, Button, Card } from '@/design-system'

// ---------------------------------------------------------------------------
// Types (mirroring Prisma enums / model shape)
// ---------------------------------------------------------------------------
type LeaveType = 'CASUAL' | 'SICK' | 'PTO' | 'COMP_OFF' | 'HALF_DAY' | 'WFH'
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface LeaveRecord {
  id: string
  leaveType: LeaveType
  startDate: Date | string
  endDate: Date | string
  totalDays: number
  status: LeaveStatus
  notes: string | null
  createdAt: Date | string
}

interface LeaveAllowance {
  leaveType: LeaveType
  allowance: number
}

interface LeavePanelProps {
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  currentYear: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LEAVE_LABELS: Record<LeaveType, string> = {
  CASUAL: 'Casual', SICK: 'Sick', PTO: 'PTO',
  COMP_OFF: 'Comp Off', HALF_DAY: 'Half Day', WFH: 'Work From Home',
}

const LEAVE_COLORS: Record<LeaveType, string> = {
  CASUAL: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  SICK: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  PTO: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  COMP_OFF: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  HALF_DAY: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  WFH: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
}

const STATUS_CONFIG: Record<LeaveStatus, { icon: React.ReactNode; label: string; cls: string }> = {
  APPROVED: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: 'Approved', cls: 'text-emerald-600 dark:text-emerald-400',
  },
  PENDING: {
    icon: <Clock className="w-3 h-3" />,
    label: 'Pending', cls: 'text-amber-600 dark:text-amber-400',
  },
  REJECTED: {
    icon: <XCircle className="w-3 h-3" />,
    label: 'Rejected', cls: 'text-red-600 dark:text-red-400',
  },
}

function fmt(d: Date | string) {
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

function daysBetween(start: string, end: string) {
  const a = new Date(start), b = new Date(end)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

// ---------------------------------------------------------------------------
// Balance Card
// ---------------------------------------------------------------------------
function BalanceCard({
  leaveType, allowance, used, year
}: { leaveType: LeaveType; allowance: number; used: number; year: number }) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(allowance))
  const [isSaving, setIsSaving] = useState(false)

  const remaining = Math.max(0, allowance - used)
  const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0

  const handleSave = async () => {
    const val = parseInt(editValue)
    if (isNaN(val) || val < 0) {
      setIsEditing(false)
      setEditValue(String(allowance))
      return
    }
    if (val === allowance) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    const res = await updateLeaveAllowance(leaveType, year, val)
    if (res.success) {
      router.refresh()
    }
    setIsSaving(false)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(String(allowance))
    }
  }

  return (
    <Card className={`p-4 space-y-3 relative transition-opacity ${isSaving ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${LEAVE_COLORS[leaveType]}`}>
          {LEAVE_LABELS[leaveType]}
        </span>
        <TrendingDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
      </div>
      <div>
        <div className="flex items-end gap-1 flex-wrap">
          <span className="text-2xl font-black text-[var(--color-text-main)] tabular-nums">{remaining}</span>
          <span className="text-xs text-[var(--color-text-muted)] mb-0.5">/</span>
          {isEditing ? (
            <input
              type="number"
              min="0"
              max="365"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-14 text-xs font-bold border border-blue-500/50 rounded-md px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 tabular-nums -mx-1"
              autoFocus
            />
          ) : (
            <span
              onClick={() => setIsEditing(true)}
              className="text-xs text-[var(--color-text-muted)] mb-0.5 hover:text-blue-500 cursor-pointer font-bold border-b border-dashed border-transparent hover:border-blue-500/50 px-1.5 py-0.5 -mx-1 transition-colors tabular-nums rounded-md hover:bg-blue-500/5"
              title="Click to edit allowance"
            >
              {allowance} days
            </span>
          )}
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)]">{used} used</p>
      </div>
      <div className="w-full h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Request Form
// ---------------------------------------------------------------------------
interface RequestFormProps {
  onSubmit: (data: {
    leaveType: LeaveType; startDate: string; endDate: string; totalDays: number; notes: string
  }) => Promise<void>
  loading: boolean
}

function RequestForm({ onSubmit, loading }: RequestFormProps) {
  const [enabledTypes, setEnabledTypes] = useState<LeaveType[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_enabled_leave_types')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) { console.error(e) }
      }
    }
    return ['CASUAL', 'SICK', 'PTO', 'COMP_OFF']
  })

  useEffect(() => {
    const cb = () => {
      const saved = localStorage.getItem('personal_enabled_leave_types')
      if (saved) {
        try {
          setEnabledTypes(JSON.parse(saved))
        } catch (e) { console.error(e) }
      }
    }
    window.addEventListener('personal_settings_changed', cb)
    return () => window.removeEventListener('personal_settings_changed', cb)
  }, [])

  const [leaveType, setLeaveType] = useState<LeaveType>(() => enabledTypes[0] || 'CASUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  // Sync default selected leaveType if enabledTypes changes
  useEffect(() => {
    if (enabledTypes.length > 0 && !enabledTypes.includes(leaveType)) {
      const timer = setTimeout(() => {
        setLeaveType(enabledTypes[0])
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [enabledTypes, leaveType])

  const totalDays = startDate && endDate ? daysBetween(startDate, endDate) : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !endDate) return
    await onSubmit({ leaveType, startDate, endDate, totalDays, notes })
    setStartDate(''); setEndDate(''); setNotes(''); setIsOpen(false)
  }

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-[var(--color-text-main)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-[var(--color-primary)]" />
          Request Time Off
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)]">
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Leave Type */}
            <div className="sm:col-span-2">
              <Select
                label="Leave Type"
                value={leaveType}
                onChange={e => setLeaveType(e.target.value as LeaveType)}
                options={enabledTypes.map(t => ({ value: t, label: LEAVE_LABELS[t] || t }))}
              />
            </div>

            {/* Start */}
            <Input
              type="date"
              label="Start Date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); if (!endDate) setEndDate(e.target.value) }}
              required
            />

            {/* End */}
            <Input
              type="date"
              label={`End Date ${totalDays > 0 ? `(${totalDays} day${totalDays !== 1 ? 's' : ''})` : ''}`}
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              required
            />

            {/* Notes */}
            <div className="sm:col-span-2">
              <Input
                label="Notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Reason or additional details…"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !startDate || !endDate}
            isLoading={loading}
            className="w-full mt-2"
          >
            Submit Request
          </Button>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------
export const LeavePanel: React.FC<LeavePanelProps> = ({
  leaveRecords: initial, leaveAllowances, currentYear
}) => {
  const router = useRouter()
  const [records, setRecords] = useState<LeaveRecord[]>(initial)
  const [isPending, startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)

  const [enabledTypes, setEnabledTypes] = useState<LeaveType[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_enabled_leave_types')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) { console.error(e) }
      }
    }
    return ['CASUAL', 'SICK', 'PTO', 'COMP_OFF']
  })

  useEffect(() => {
    const cb = () => {
      const saved = localStorage.getItem('personal_enabled_leave_types')
      if (saved) {
        try {
          setEnabledTypes(JSON.parse(saved))
        } catch (e) { console.error(e) }
      }
    }
    window.addEventListener('personal_settings_changed', cb)
    return () => window.removeEventListener('personal_settings_changed', cb)
  }, [])

  // Compute used days per leave type from APPROVED records
  const usedByType: Partial<Record<LeaveType, number>> = {}
  records.filter(r => r.status === 'APPROVED').forEach(r => {
    const t = r.leaveType
    usedByType[t] = (usedByType[t] ?? 0) + r.totalDays
  })

  // Only show balance cards for enabled leave types that have allowances
  const trackableTypes = leaveAllowances
    .map(a => a.leaveType)
    .filter(type => enabledTypes.includes(type))

  const handleSubmit = async (data: {
    leaveType: LeaveType; startDate: string; endDate: string; totalDays: number; notes: string
  }) => {
    setSubmitting(true)
    const res = await createLeaveRequest(data as Parameters<typeof createLeaveRequest>[0])
    if (res.success && res.record) {
      setRecords(prev => [res.record! as LeaveRecord, ...prev])
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    await deleteLeaveRecord(id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  const handleStatusChange = async (id: string, status: LeaveStatus) => {
    startTransition(async () => {
      const res = await updateLeaveStatus(id, status as import('@prisma/client').LeaveStatus)
      if (res.success) {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      }
    })
  }

  const handleSeedAllowances = async () => {
    await ensureLeaveAllowances(currentYear)
    router.refresh()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[var(--color-text-main)] tracking-tight">Time Off</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{currentYear} leave tracker</p>
        </div>
        <CalendarX className="w-6 h-6 text-[var(--color-text-muted)]" />
      </div>

      {/* Balance Cards */}
      {leaveAllowances.length === 0 ? (
        <div className="text-center py-6 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">No leave allowances configured for {currentYear}.</p>
          <Button onClick={handleSeedAllowances} size="sm">
            Set Default Allowances
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {trackableTypes.map(type => {
            const allowance = leaveAllowances.find(a => a.leaveType === type)?.allowance ?? 0
            return (
              <BalanceCard
                key={type}
                leaveType={type}
                allowance={allowance}
                used={usedByType[type] ?? 0}
                year={currentYear}
              />
            )
          })}
        </div>
      )}

      {/* Request Form */}
      <RequestForm onSubmit={handleSubmit} loading={submitting} />

      {/* History Table */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">
            Leave History — {records.length} record{records.length !== 1 ? 's' : ''}
          </h2>
        </div>

        {records.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
            No leave records yet. Request your first time off above.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {records.map(record => {
              const sc = STATUS_CONFIG[record.status]
              return (
                <div key={record.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-accent)] transition-colors group">
                  {/* Type badge */}
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${LEAVE_COLORS[record.leaveType]}`}>
                    {LEAVE_LABELS[record.leaveType]}
                  </span>

                  {/* Dates */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-main)]">
                      {fmt(record.startDate)}
                      {toYMD(record.startDate) !== toYMD(record.endDate) && ` → ${fmt(record.endDate)}`}
                      <span className="ml-2 text-[var(--color-text-muted)] font-normal">
                        {record.totalDays} day{record.totalDays !== 1 ? 's' : ''}
                      </span>
                    </p>
                    {record.notes && (
                      <p className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">{record.notes}</p>
                    )}
                  </div>

                  {/* Status selector */}
                  <Select
                    value={record.status}
                    onChange={e => handleStatusChange(record.id, e.target.value as LeaveStatus)}
                    disabled={isPending}
                    options={(['APPROVED', 'PENDING', 'REJECTED'] as LeaveStatus[]).map(s => ({ value: s, label: STATUS_CONFIG[s].label }))}
                    className={`text-[10px] font-bold ${sc.cls}`}
                  />

                  {/* Delete */}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(record.id)}
                    className="opacity-0 sm:group-hover:opacity-100 shrink-0"
                    aria-label="Delete record"
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

