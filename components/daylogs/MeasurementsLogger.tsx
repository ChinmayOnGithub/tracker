"use client"

import React from 'react'

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
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Weight (kg)</label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 74.5"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Waist (inches)</label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 32.5"
            value={waist}
            onChange={e => setWaist(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Chest (inches)</label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 40.0"
            value={chest}
            onChange={e => setChest(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Arms (inches)</label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 14.5"
            value={arms}
            onChange={e => setArms(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355"
          />
        </div>
      </div>
    </div>
  )
}
