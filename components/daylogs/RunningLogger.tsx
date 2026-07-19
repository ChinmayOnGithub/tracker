"use client"

import React from 'react'
import { Input, Select } from '@/design-system'

interface RunningLoggerProps {
  distance: string
  setDistance: (val: string) => void
  duration: string
  setDuration: (val: string) => void
  energy: string
  setEnergy: (val: string) => void
}

export const RunningLogger: React.FC<RunningLoggerProps> = ({
  distance,
  setDistance,
  duration,
  setDuration,
  energy,
  setEnergy,
}) => {
  return (
    <div className="border-t border-[var(--color-border)] pt-4 space-y-4">
      <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        Running Details
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          type="number"
          label="Distance (km)"
          step={0.01}
          placeholder="e.g. 5.2"
          value={distance}
          onChange={e => setDistance(e.target.value)}
        />
        <Input
          type="number"
          label="Duration (minutes)"
          placeholder="e.g. 30"
          value={duration}
          onChange={e => setDuration(e.target.value)}
        />
        <Select
          label="Energy / Feeling"
          value={energy}
          onChange={e => setEnergy(e.target.value)}
          options={[
            { value: 'High', label: '⚡ High' },
            { value: 'Medium', label: '⚡ Medium' },
            { value: 'Low', label: '⚡ Low' },
          ]}
        />
      </div>
    </div>
  )
}
