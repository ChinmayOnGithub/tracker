"use client"

import React from 'react'
import { Input } from '@/design-system'

interface MeasurementsLoggerProps {
  weight: string
  setWeight: (val: string) => void
  waist: string
  setWaist: (val: string) => void
  chest: string
  setChest: (val: string) => void
  arms: string
  setArms: (val: string) => void
}

export const MeasurementsLogger: React.FC<MeasurementsLoggerProps> = ({
  weight,
  setWeight,
  waist,
  setWaist,
  chest,
  setChest,
  arms,
  setArms,
}) => {
  return (
    <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
      <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Weekly Body Measurements</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Input
          label="Weight (kg)"
          type="number"
          step="0.1"
          placeholder="e.g. 74.5"
          value={weight}
          onChange={e => setWeight(e.target.value)}
        />
        <Input
          label="Waist (inches)"
          type="number"
          step="0.1"
          placeholder="e.g. 32.5"
          value={waist}
          onChange={e => setWaist(e.target.value)}
        />
        <Input
          label="Chest (inches)"
          type="number"
          step="0.1"
          placeholder="e.g. 40.0"
          value={chest}
          onChange={e => setChest(e.target.value)}
        />
        <Input
          label="Arms (inches)"
          type="number"
          step="0.1"
          placeholder="e.g. 14.5"
          value={arms}
          onChange={e => setArms(e.target.value)}
        />
      </div>
    </div>
  )
}
