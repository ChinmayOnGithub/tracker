"use client"

import React from 'react'
import { Scale } from 'lucide-react'
import { Card } from '@/design-system'
import { Sparkline } from '../WeightPanel'
import { WeightRecord } from '@/lib/store/store'

interface WeightWidgetProps {
  isVisible: boolean
  weightRecords: WeightRecord[]
}

export const WeightWidget: React.FC<WeightWidgetProps> = ({
  isVisible,
  weightRecords,
}) => {
  if (!isVisible) return null

  const sparklineData = [...weightRecords]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(r => ({
      date: typeof r.date === 'string' ? r.date : r.date.toISOString(),
      weight: r.weight
    }))

  const latestWeightRecord = weightRecords.length > 0
    ? [...weightRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : null

  return (
    <Card className="p-4 space-y-3 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
        <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <Scale className="w-3.5 h-3.5 text-[var(--color-completed)]" />
          Weight Graph
        </span>
        {latestWeightRecord && (
          <span className="text-xs font-black text-[var(--color-text-main)] tabular-nums">
            {latestWeightRecord.weight.toFixed(1)} kg
          </span>
        )}
      </div>
      {sparklineData.length >= 2 ? (
        <div className="pt-2">
          <Sparkline data={sparklineData} width={280} height={120} />
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-[var(--color-text-muted)] italic">
          Need at least 2 logs to show weight graph.
        </div>
      )}
    </Card>
  )
}
