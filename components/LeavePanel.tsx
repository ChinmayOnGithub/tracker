"use client"

import React, { useState, useTransition, useEffect } from 'react'
import { useStore, LeaveRecord as StoreLeaveRecord, LeaveAllowance as StoreLeaveAllowance } from '@/lib/store/store'
import {
  CalendarX, Plus, Trash2, CheckCircle2, Clock, XCircle, TrendingDown, ChevronDown, Sliders, X, Palette
} from 'lucide-react'
import { Input, Select, Button, Card } from '@/design-system'
import { toYMD, fmtDateShort, inclusiveDays } from '@/lib/dateUtils'
import {
  LeaveType, LeaveTypeMeta, DEFAULT_LEAVE_TYPES_META, COLOR_OPTIONS,
  getLeaveTypeStyle, useLeaveMeta, saveStoredLeaveMeta
} from '@/lib/leaveConfig'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

const ALL_LEAVE_TYPES: LeaveType[] = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF', 'HALF_DAY', 'WFH']

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

// ---------------------------------------------------------------------------
// Balance Card (Shows Allocated, Used, Remaining)
// ---------------------------------------------------------------------------
function BalanceCard({
  leaveType, allowance, used, year, meta
}: { leaveType: LeaveType; allowance: number; used: number; year: number; meta: LeaveTypeMeta }) {
  const { updateLeaveAllowanceAction } = useStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(allowance))
  const [isSaving, setIsSaving] = useState(false)

  const remaining = Math.max(0, allowance - used)
  const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0
  const colorStyle = getLeaveTypeStyle(meta.color)

  const handleSave = async () => {
    const val = parseFloat(editValue)
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
    try {
      await updateLeaveAllowanceAction(leaveType, year, val)
      toast.success(`${meta.label} entitlement updated`)
    } catch {
      toast.error('Failed to update entitlement')
    } finally {
      setIsSaving(false)
      setIsEditing(false)
    }
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
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${colorStyle}`}>
          {meta.label}
        </span>
        <TrendingDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-1 flex-wrap">
          <div>
            <span className="text-2xl font-black text-[var(--color-text-main)] tabular-nums">{remaining}</span>
            <span className="text-xs text-[var(--color-text-muted)] ml-1">remaining</span>
          </div>
          <div className="text-right text-xs">
            {isEditing ? (
              <input
                type="number"
                min="0"
                max="365"
                step="0.5"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-16 text-xs font-bold border border-blue-500/50 rounded-md px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 tabular-nums"
                autoFocus
              />
            ) : (
              <span
                onClick={() => setIsEditing(true)}
                className="text-[var(--color-text-muted)] hover:text-blue-500 cursor-pointer font-bold border-b border-dashed border-transparent hover:border-blue-500/50 px-1 py-0.5 transition-colors tabular-nums rounded-md hover:bg-blue-500/5"
                title="Click to edit annual entitlement"
              >
                {allowance} allocated
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{used} used</p>
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
// Entitlements & Leave Types Customization Modal
// ---------------------------------------------------------------------------
interface EntitlementsModalProps {
  isOpen: boolean
  onClose: () => void
  currentYear: number
  leaveAllowances: LeaveAllowance[]
  metaMap: Record<LeaveType, LeaveTypeMeta>
  onSave: (allowances: { leaveType: LeaveType; allowance: number }[], updatedMeta: Record<LeaveType, LeaveTypeMeta>) => Promise<void>
}

function EntitlementsModal({
  isOpen, onClose, currentYear, leaveAllowances, metaMap: initialMeta, onSave
}: EntitlementsModalProps) {
  const [allowanceMap, setAllowanceMap] = useState<Record<LeaveType, number>>(() => {
    const map: Record<string, number> = {}
    ALL_LEAVE_TYPES.forEach(t => {
      map[t] = leaveAllowances.find(a => a.leaveType === t)?.allowance ?? 0
    })
    return map as Record<LeaveType, number>
  })
  
  const [editableMeta, setEditableMeta] = useState<Record<LeaveType, LeaveTypeMeta>>(initialMeta)
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleToggleEnabled = (type: LeaveType) => {
    setEditableMeta(prev => {
      const current = prev[type] || DEFAULT_LEAVE_TYPES_META[type]
      const nextEnabled = !current.enabled
      // If disabling, set allowance to 0
      if (!nextEnabled) {
        setAllowanceMap(a => ({ ...a, [type]: 0 }))
      }
      return {
        ...prev,
        [type]: { ...current, enabled: nextEnabled }
      }
    })
  }

  const handleLabelChange = (type: LeaveType, newLabel: string) => {
    setEditableMeta(prev => ({
      ...prev,
      [type]: { ...(prev[type] || DEFAULT_LEAVE_TYPES_META[type]), label: newLabel }
    }))
  }

  const handleColorChange = (type: LeaveType, newColor: string) => {
    setEditableMeta(prev => ({
      ...prev,
      [type]: { ...(prev[type] || DEFAULT_LEAVE_TYPES_META[type]), color: newColor }
    }))
  }

  const handleAllowanceChange = (type: LeaveType, val: string) => {
    const num = parseFloat(val)
    setAllowanceMap(prev => ({ ...prev, [type]: isNaN(num) ? 0 : Math.max(0, num) }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = ALL_LEAVE_TYPES.map(t => ({
        leaveType: t,
        allowance: editableMeta[t]?.enabled ? (allowanceMap[t] ?? 0) : 0,
      }))
      await onSave(updates, editableMeta)
      toast.success('Leave types and entitlements saved successfully')
      onClose()
    } catch {
      toast.error('Failed to save leave entitlements')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h3 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-wider">
              {currentYear} Custom Leave Types & Entitlements
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Rename, color, enable/disable, or remove unused types (0 days hides the type).
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={16} />} />
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {ALL_LEAVE_TYPES.map(type => {
            const meta = editableMeta[type] || DEFAULT_LEAVE_TYPES_META[type]
            const isEnabled = meta.enabled

            return (
              <div
                key={type}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  isEnabled
                    ? 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]/40 shadow-xs'
                    : 'border-dashed border-[var(--color-border)]/60 opacity-60 bg-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggleEnabled(type)}
                      className="rounded border-[var(--color-border)] accent-[var(--color-primary)] w-4 h-4 cursor-pointer"
                      title={isEnabled ? "Click to disable/hide this leave type" : "Click to enable"}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={meta.label}
                          disabled={!isEnabled}
                          onChange={e => handleLabelChange(type, e.target.value)}
                          placeholder="e.g. Casual / Sick Leave"
                          className="text-xs font-bold bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:bg-[var(--color-bg-surface)] px-1 py-0.5 rounded text-[var(--color-text-main)] w-full outline-hidden"
                        />
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)] px-1">
                        System key: <span className="font-mono">{type}</span> {isEnabled ? '' : '— (Disabled / Hidden)'}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Color Picker & Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Color selector */}
                    <div className="flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      <select
                        disabled={!isEnabled}
                        value={meta.color}
                        onChange={e => handleColorChange(type, e.target.value)}
                        className="text-xs font-medium bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text-main)] focus:outline-hidden disabled:opacity-40"
                      >
                        {COLOR_OPTIONS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Disable/Remove button */}
                    {isEnabled && (
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(type)}
                        title="Remove / Disable this leave type"
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Days/Year input */}
                {isEnabled && (
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]/40 text-xs">
                    <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                      Annual Allocation (setting 0 hides the leave card):
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="365"
                        step="0.5"
                        value={allowanceMap[type] ?? 0}
                        onChange={e => handleAllowanceChange(type, e.target.value)}
                        className="w-20 text-xs font-bold border border-[var(--color-border)] rounded-lg px-2 py-1 bg-[var(--color-bg-surface)] text-[var(--color-text-main)] focus:outline-hidden focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      <span className="text-[11px] text-[var(--color-text-muted)]">days/yr</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]/20">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={saving}>
            Save Customizations
          </Button>
        </div>
      </div>
    </div>
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
  activeTypes: LeaveType[]
  metaMap: Record<LeaveType, LeaveTypeMeta>
  existingRecords: LeaveRecord[]
}

function RequestForm({ onSubmit, loading, activeTypes, metaMap, existingRecords }: RequestFormProps) {
  const [selectedType, setSelectedType] = useState<LeaveType | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  // Derived active leaveType
  const leaveType = selectedType && activeTypes.includes(selectedType) ? selectedType : (activeTypes[0] || 'CASUAL')

  const totalDays = startDate && endDate ? inclusiveDays(startDate, endDate) : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !endDate) {
      toast.error('Please specify start and end dates')
      return
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error('End date must be on or after start date')
      return
    }

    // Check for client-side overlapping approved/pending leaves
    const overlap = existingRecords.find(r => {
      if (r.status === 'REJECTED') return false
      const rStart = toYMD(r.startDate)
      const rEnd = toYMD(r.endDate)
      return startDate <= rEnd && endDate >= rStart
    })

    if (overlap) {
      const typeLabel = metaMap[overlap.leaveType]?.label || overlap.leaveType
      toast.error(`Overlapping leave already exists for ${typeLabel} (${toYMD(overlap.startDate)} to ${toYMD(overlap.endDate)})`)
      return
    }

    await onSubmit({ leaveType, startDate, endDate, totalDays, notes })
    setStartDate('')
    setEndDate('')
    setNotes('')
    setIsOpen(false)
  }

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-xs">
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
                onChange={e => setSelectedType(e.target.value as LeaveType)}
                options={activeTypes.map(t => ({ value: t, label: metaMap[t]?.label || t }))}
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
  leaveRecords: initial, leaveAllowances: initialAllowances, currentYear
}) => {
  const {
    state, initialize, createLeaveRecordAction, updateLeaveRecordAction,
    deleteLeaveRecordAction, ensureLeaveAllowancesAction, batchUpdateLeaveAllowancesAction
  } = useStore()

  useEffect(() => {
    initialize({
      leaveRecords: initial as unknown as StoreLeaveRecord[],
      leaveAllowances: initialAllowances as unknown as StoreLeaveAllowance[]
    })
  }, [initial, initialAllowances, initialize])

  const records = (state.leaveRecords.length > 0 ? state.leaveRecords : initial) as unknown as LeaveRecord[]
  const allowances = (state.leaveAllowances.length > 0 ? state.leaveAllowances : initialAllowances) as unknown as LeaveAllowance[]
  const [isPending, _startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)
  const [isEntitlementsOpen, setIsEntitlementsOpen] = useState(false)

  // Use external store hook to synchronize stored custom leave metadata reactively without effect cascading renders
  const metaMap = useLeaveMeta()

  // Compute used days per leave type from APPROVED records
  const usedByType: Partial<Record<LeaveType, number>> = {}
  records.filter(r => r.status === 'APPROVED').forEach(r => {
    const t = r.leaveType as LeaveType
    usedByType[t] = (usedByType[t] ?? 0) + r.totalDays
  })

  // Display only leave types that are enabled AND have an allowance > 0 (or approved records)
  // If allowance is 0 and not used, it is excluded from the Time Off cards as requested
  const visibleCardTypes = ALL_LEAVE_TYPES.filter(type => {
    const meta = metaMap[type] || DEFAULT_LEAVE_TYPES_META[type]
    if (!meta.enabled) return false
    const allowance = allowances.find(a => a.leaveType === type)?.allowance ?? 0
    const used = usedByType[type] ?? 0
    return allowance > 0 || used > 0
  })

  // Types available in the dropdown
  const activeRequestTypes = ALL_LEAVE_TYPES.filter(type => {
    const meta = metaMap[type] || DEFAULT_LEAVE_TYPES_META[type]
    return meta.enabled
  })

  const handleSubmit = async (data: {
    leaveType: LeaveType; startDate: string; endDate: string; totalDays: number; notes: string
  }) => {
    setSubmitting(true)
    try {
      await createLeaveRecordAction(data)
      const label = metaMap[data.leaveType]?.label || data.leaveType
      toast.success(`${label} requested successfully`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to cancel and delete this leave record?')) {
      try {
        await deleteLeaveRecordAction(id)
        toast.success('Leave record deleted')
      } catch {
        toast.error('Failed to delete leave record')
      }
    }
  }

  const handleStatusChange = async (id: string, status: LeaveStatus) => {
    try {
      await updateLeaveRecordAction(id, status)
      toast.success(`Leave status updated to ${STATUS_CONFIG[status].label}`)
    } catch {
      toast.error('Failed to update leave status')
    }
  }

  const handleSeedAllowances = async () => {
    try {
      await ensureLeaveAllowancesAction(currentYear)
      toast.success('Default allowances initialized')
    } catch {
      toast.error('Failed to initialize allowances')
    }
  }

  const handleSaveEntitlements = async (
    updates: { leaveType: LeaveType; allowance: number }[],
    updatedMeta: Record<LeaveType, LeaveTypeMeta>
  ) => {
    await batchUpdateLeaveAllowancesAction(currentYear, updates)
    saveStoredLeaveMeta(updatedMeta)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[var(--color-text-main)] tracking-tight">Time Off</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{currentYear} leave & entitlement tracker</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEntitlementsOpen(true)}
            icon={<Sliders size={14} />}
            title="Configure Annual Entitlements"
          >
            Configure Entitlements
          </Button>
          <CalendarX className="w-6 h-6 text-[var(--color-text-muted)]" />
        </div>
      </div>

      {/* Balance Cards */}
      {visibleCardTypes.length === 0 ? (
        <div className="text-center py-8 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl space-y-3 shadow-xs">
          <p className="text-xs text-[var(--color-text-muted)]">
            No active leave types with allocation configured for {currentYear}.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setIsEntitlementsOpen(true)} size="sm">
              Configure Leave Types
            </Button>
            <Button onClick={handleSeedAllowances} variant="outline" size="sm">
              Set Defaults
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleCardTypes.map(type => {
            const allowance = allowances.find(a => a.leaveType === type)?.allowance ?? 0
            const meta = metaMap[type] || DEFAULT_LEAVE_TYPES_META[type]
            return (
              <BalanceCard
                key={type}
                leaveType={type}
                allowance={allowance}
                used={usedByType[type] ?? 0}
                year={currentYear}
                meta={meta}
              />
            )
          })}
        </div>
      )}

      {/* Request Form */}
      <RequestForm
        onSubmit={handleSubmit}
        loading={submitting}
        activeTypes={activeRequestTypes}
        metaMap={metaMap}
        existingRecords={records}
      />

      {/* History Table */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
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
              const sc = STATUS_CONFIG[record.status as LeaveStatus] || STATUS_CONFIG.APPROVED
              const meta = metaMap[record.leaveType as LeaveType] || DEFAULT_LEAVE_TYPES_META[record.leaveType as LeaveType]
              const colorStyle = getLeaveTypeStyle(meta?.color || 'blue')

              return (
                <div key={record.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-accent)] transition-colors group">
                  {/* Type badge */}
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${colorStyle}`}>
                    {meta?.label || record.leaveType}
                  </span>

                  {/* Dates */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-main)]">
                      {fmtDateShort(record.startDate)}
                      {toYMD(record.startDate) !== toYMD(record.endDate) && ` → ${fmtDateShort(record.endDate)}`}
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

      {/* Entitlements Modal */}
      <EntitlementsModal
        isOpen={isEntitlementsOpen}
        onClose={() => setIsEntitlementsOpen(false)}
        currentYear={currentYear}
        leaveAllowances={allowances}
        metaMap={metaMap}
        onSave={handleSaveEntitlements}
      />
    </div>
  )
}
export default LeavePanel
