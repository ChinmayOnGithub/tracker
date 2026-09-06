"use client"

import React from 'react'
import { CalendarX } from 'lucide-react'
import { Card, CardHeader, CardBody, CardFooter, Button } from '@/design-system'
import { LeaveRecord, LeaveAllowance } from '@/lib/store/store'
import {
  LeaveType, DEFAULT_LEAVE_TYPES_META,
  useLeaveMeta, getLeaveTypeStyle
} from '@/lib/leaveConfig'

interface LeaveWidgetProps {
  isVisible: boolean
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  onTabChange: (tab: string) => void
  gridW?: number
  gridH?: number
}

/**
 * LeaveWidget
 * Displays remaining time-off using customized leave types, labels, and colors.
 * Excludes types where allocation is 0 and no leaves have been used.
 * Adapts smartly to grid dimensions: uses space-efficient compact row/grid when h <= 3.
 */
export const LeaveWidget: React.FC<LeaveWidgetProps> = ({
  isVisible,
  leaveRecords,
  leaveAllowances,
  onTabChange,
  gridW: _gridW = 7,
  gridH = 4,
}) => {
  const metaMap = useLeaveMeta()

  if (!isVisible) return null

  const isCompactHeight = gridH <= 3

  // Compute approved leaves used
  const usedByType: Record<string, number> = {}
  leaveRecords.filter(r => r.status === 'APPROVED').forEach(r => {
    usedByType[r.leaveType] = (usedByType[r.leaveType] ?? 0) + r.totalDays
  })

  // Filter types that are enabled AND have allowance > 0 or used > 0
  const ALL_LEAVE_TYPES: LeaveType[] = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF', 'HALF_DAY', 'WFH']
  const displayTypes = ALL_LEAVE_TYPES.filter(type => {
    const meta = metaMap[type] || DEFAULT_LEAVE_TYPES_META[type]
    if (!meta.enabled) return false
    const allowance = leaveAllowances.find(a => a.leaveType === type)?.allowance ?? 0
    const used = usedByType[type] ?? 0
    return allowance > 0 || used > 0
  })

  return (
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className={`${isCompactHeight ? 'pb-1 mb-1' : 'pb-2 mb-2'} border-b border-[var(--color-border)]/40 flex items-center justify-between`}>
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <CalendarX className="w-3.5 h-3.5 text-[var(--color-overdue)]" />
          Time Off
        </span>
        <button
          onClick={() => onTabChange('leave')}
          className="text-[10px] font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
        >
          {isCompactHeight ? 'Manage' : 'Remaining'}
        </button>
      </CardHeader>
      <CardBody className="py-1">
        {displayTypes.length === 0 ? (
          <div className="text-center py-2 text-xs text-[var(--color-text-muted)]">
            No active leave entitlements
          </div>
        ) : isCompactHeight ? (
          /* Compact mode: 1 row flex chips or tight grid to fit minimal height without scrollbar */
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            {displayTypes.map(type => {
              const meta = metaMap[type] || DEFAULT_LEAVE_TYPES_META[type]
              const allowance = leaveAllowances.find(a => a.leaveType === type)?.allowance ?? 0
              const used = usedByType[type] ?? 0
              const remaining = Math.max(0, allowance - used)
              const colorStyle = getLeaveTypeStyle(meta.color)

              return (
                <div key={type} className={`border px-2.5 py-1 rounded-lg flex items-center gap-2 shrink-0 ${colorStyle}`}>
                  <span className="text-xs font-black tabular-nums">{remaining}/{allowance}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-90 truncate max-w-[80px]" title={meta.label}>
                    {meta.label}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {displayTypes.map(type => {
              const meta = metaMap[type] || DEFAULT_LEAVE_TYPES_META[type]
              const allowance = leaveAllowances.find(a => a.leaveType === type)?.allowance ?? 0
              const used = usedByType[type] ?? 0
              const remaining = Math.max(0, allowance - used)
              const colorStyle = getLeaveTypeStyle(meta.color)

              return (
                <div key={type} className={`border p-2 rounded-xl flex flex-col justify-center ${colorStyle}`}>
                  <div className="text-sm font-black tabular-nums">{remaining} / {allowance}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider opacity-90 mt-0.5 truncate" title={meta.label}>
                    {meta.label}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardBody>
      {!isCompactHeight && (
        <CardFooter className="pt-2 border-t border-[var(--color-border)]/40 mt-2">
          <Button
            onClick={() => onTabChange('leave')}
            size="sm"
            variant="outline"
            className="w-full text-xs font-semibold"
          >
            Request Time Off
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
export default LeaveWidget
