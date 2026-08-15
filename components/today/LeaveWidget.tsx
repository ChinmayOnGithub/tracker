"use client"

import React from 'react'
import { CalendarX } from 'lucide-react'
import { Card, CardHeader, CardBody, CardFooter, Button } from '@/design-system'
import { LeaveRecord, LeaveAllowance } from '@/lib/store/store'

interface LeaveWidgetProps {
  isVisible: boolean
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  onTabChange: (tab: string) => void
}

/**
 * LeaveWidget
 * Standardized using Card components and design token colors/borders.
 */
export const LeaveWidget: React.FC<LeaveWidgetProps> = ({
  isVisible,
  leaveRecords,
  leaveAllowances,
  onTabChange,
}) => {
  if (!isVisible) return null

  // Compute approved leaves used
  const usedByType: Record<string, number> = {}
  leaveRecords.filter(r => r.status === 'APPROVED').forEach(r => {
    usedByType[r.leaveType] = (usedByType[r.leaveType] ?? 0) + r.totalDays
  })

  const leaveTypes = ['CASUAL', 'SICK', 'PTO', 'COMP_OFF']
  const leaveLabels: Record<string, string> = {
    CASUAL: 'Casual', SICK: 'Sick', PTO: 'PTO', COMP_OFF: 'Comp Off'
  }
  const leaveColors: Record<string, string> = {
    CASUAL: 'text-blue-500 border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10',
    SICK: 'text-red-500 border-red-500/20 bg-red-500/5 dark:bg-red-500/10',
    PTO: 'text-purple-500 border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10',
    COMP_OFF: 'text-amber-500 border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10'
  }

  return (
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className="pb-2 border-b border-[var(--color-border)]/40 mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <CalendarX className="w-3.5 h-3.5 text-[var(--color-overdue)]" />
          Time Off
        </span>
        <span className="text-[10px] font-bold text-[var(--color-text-muted)]">Remaining</span>
      </CardHeader>
      <CardBody className="py-1">
        <div className="grid grid-cols-2 gap-2">
          {leaveTypes.map(type => {
            const allowance = leaveAllowances.find(a => a.leaveType === type)?.allowance ?? 0
            const used = usedByType[type] ?? 0
            const remaining = Math.max(0, allowance - used)
            return (
              <div key={type} className={`border border-[var(--color-border)] p-2 rounded-xl flex flex-col justify-center ${leaveColors[type] || ''}`}>
                <div className="text-sm font-black tabular-nums">{remaining} / {allowance}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider opacity-85 mt-0.5">{leaveLabels[type] || type}</div>
              </div>
            )
          })}
        </div>
      </CardBody>
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
    </Card>
  )
}
