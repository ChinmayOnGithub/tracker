"use client"

import React from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { WorkoutExercise, WorkoutSet } from '@/types'
import { Button, Select } from '@/design-system'

interface WorkoutLoggerProps {
  exercises: WorkoutExercise[]
  setExercises: React.Dispatch<React.SetStateAction<WorkoutExercise[]>>
  energy: string
  setEnergy: (val: string) => void
}

export const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({
  exercises,
  setExercises,
  energy,
  setEnergy,
}) => {
  const handleAddExercise = () => {
    setExercises(prev => [...prev, { name: '', sets: [{ reps: 10 }] }])
  }

  const handleRemoveExercise = (idx: number) => {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  const handleExerciseNameChange = (idx: number, name: string) => {
    setExercises(prev =>
      prev.map((ex, i) => (i === idx ? { ...ex, name } : ex))
    )
  }

  const handleExerciseNoteChange = (idx: number, note: string) => {
    setExercises(prev =>
      prev.map((ex, i) => (i === idx ? { ...ex, note } : ex))
    )
  }

  const handleAddSet = (exerciseIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i === exerciseIdx) {
          const lastSet = ex.sets[ex.sets.length - 1]
          const newSet = lastSet ? { ...lastSet } : { reps: 10 }
          return { ...ex, sets: [...ex.sets, newSet] }
        }
        return ex
      })
    )
  }

  const handleRemoveSet = (exerciseIdx: number, setIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i === exerciseIdx) {
          return { ...ex, sets: ex.sets.filter((_, s) => s !== setIdx) }
        }
        return ex
      })
    )
  }

  const handleSetChange = (
    exerciseIdx: number,
    setIdx: number,
    field: keyof WorkoutSet,
    val: string | number | undefined
  ) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i === exerciseIdx) {
          return {
            ...ex,
            sets: ex.sets.map((set, s) => {
              if (s === setIdx) {
                return { ...set, [field]: val }
              }
              return set
            }),
          }
        }
        return ex
      })
    )
  }

  return (
    <div className="border-t border-slate-200 dark:border-zinc-800 pt-4 space-y-4">
      {/* Energy Selector for Workout */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2">
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

      {/* Quick Presets Bar */}
      <div className="space-y-1">
        <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500">Quick Bodyweight & Cardio Presets</span>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            'Pushups', 'Squats', 'Plank', 'Suryanamaskar', 'Pullups', 'Burpees', 'Dips',
            'Walking', 'Running', 'Cycling', 'Stretching', 'Mobility', 'Yoga', 'Core Work'
          ].map(preset => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setExercises(prev => {
                  if (prev.length === 1 && prev[0].name.trim() === '') {
                    return [{ name: preset, sets: [{ reps: 10 }] }]
                  }
                  return [...prev, { name: preset, sets: [{ reps: 10 }] }]
                })
              }}
            >
              + {preset}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400">Workout Exercises</label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddExercise}
          icon={<Plus size={12} />}
        >
          Add Exercise
        </Button>
      </div>

      <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
        {exercises.map((ex, exIdx) => (
          <div key={exIdx} className="bg-slate-100/40 dark:bg-zinc-900/60 p-3 rounded-lg border border-slate-200 dark:border-zinc-800/80 relative space-y-3">
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => handleRemoveExercise(exIdx)}
              className="absolute top-2 right-2"
              aria-label="Remove exercise"
            >
              <Trash2 size={14} />
            </Button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
              <div>
                <input
                  type="text"
                  placeholder="Exercise Name (e.g. Bench Press)"
                  value={ex.name}
                  onChange={e => handleExerciseNameChange(exIdx, e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Exercise Note (optional)"
                  value={ex.note || ''}
                  onChange={e => handleExerciseNoteChange(exIdx, e.target.value)}
                  className="w-full bg-white dark:bg-zinc-955 border border-slate-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Sets list */}
            <div className="space-y-1.5 pl-2">
              {ex.sets.map((set, setIdx) => (
                <div key={setIdx} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 dark:text-zinc-500 font-mono w-10">Set {setIdx + 1}:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="Reps"
                      value={set.reps}
                      onChange={e =>
                        handleSetChange(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)
                      }
                      className="w-16 bg-white dark:bg-zinc-955 border border-slate-200 dark:border-zinc-800 rounded px-1.5 py-0.5 text-center text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-slate-400 dark:text-zinc-650">reps</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="Weight"
                      value={set.weight !== undefined ? set.weight : ''}
                      onChange={e =>
                        handleSetChange(
                          exIdx,
                          setIdx,
                          'weight',
                          e.target.value !== '' ? parseFloat(e.target.value) : undefined
                        )
                      }
                      className="w-16 bg-white dark:bg-zinc-955 border border-slate-200 dark:border-zinc-800 rounded px-1.5 py-0.5 text-center text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-slate-400 dark:text-zinc-600 font-semibold">kg</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Set Note"
                    value={set.note || ''}
                    onChange={e => handleSetChange(exIdx, setIdx, 'note', e.target.value)}
                    className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded px-2 py-0.5 text-slate-900 dark:text-white placeholder-slate-350 dark:placeholder-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveSet(exIdx, setIdx)}
                    className="text-slate-400 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddSet(exIdx)}
                className="mt-1"
              >
                + Add Set
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
