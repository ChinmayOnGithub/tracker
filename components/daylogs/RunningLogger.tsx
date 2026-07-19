"use client"

import React from 'react'

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
    <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
      <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Running Details</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Distance (km)</label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 5.2"
            value={distance}
            onChange={e => setDistance(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Duration (minutes)</label>
          <input
            type="number"
            placeholder="e.g. 30"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 dark:text-zinc-500 mb-1 font-medium">Energy / Feeling</label>
          <select
            value={energy}
            onChange={e => setEnergy(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-350 dark:focus:border-zinc-700 cursor-pointer"
          >
            <option value="High">⚡ High</option>
            <option value="Medium">⚡ Medium</option>
            <option value="Low">⚡ Low</option>
          </select>
        </div>
      </div>
    </div>
  )
}
