"use client"

import React, { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Textarea, Select
} from '@/design-system'
import { taskCreateSchema, TaskCreateFormValues } from '@/lib/validations'
import { Icon, ICON_OPTIONS } from '@/components/Icon'
import { CheckSquare } from 'lucide-react'

export interface TaskCreateDialogProps {
  isOpen: boolean
  onClose: () => void
  initialDate?: string
  initialTime?: string
  initialAllDay?: boolean
  source?: 'today' | 'calendar' | 'activities'
  onSubmitTask: (data: {
    name: string
    category: string
    type: string
    priority: string
    icon: string
    color: string
    targetDate: string
    scheduledTime?: string | null
    estimatedDuration?: number | null
    isAllDay: boolean
    notes?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

const COLOR_OPTIONS = [
  { value: 'blue',   label: 'Blue',   bgClass: 'bg-blue-500' },
  { value: 'green',  label: 'Green',  bgClass: 'bg-green-500' },
  { value: 'amber',  label: 'Amber',  bgClass: 'bg-amber-500' },
  { value: 'orange', label: 'Orange', bgClass: 'bg-orange-500' },
  { value: 'red',    label: 'Red',    bgClass: 'bg-red-500' },
  { value: 'purple', label: 'Purple', bgClass: 'bg-purple-500' },
  { value: 'pink',   label: 'Pink',   bgClass: 'bg-pink-500' },
  { value: 'zinc',   label: 'Zinc',   bgClass: 'bg-zinc-500' },
]

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

const TYPE_OPTIONS = [
  { value: 'TASK', label: 'Task' },
  { value: 'WORKOUT', label: 'Workout' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'BILL', label: 'Bill / Payment' },
  { value: 'MEDICINE', label: 'Medicine' },
  { value: 'JOURNAL', label: 'Journal' },
  { value: 'LEARNING', label: 'Learning' },
  { value: 'PERSONAL', label: 'Personal' },
]

export const TaskCreateDialog: React.FC<TaskCreateDialogProps> = ({
  isOpen,
  onClose,
  initialDate,
  initialTime,
  initialAllDay = true,
  source = 'calendar',
  onSubmitTask,
}) => {
  const defaultDate = initialDate || new Date().toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskCreateFormValues>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      name: '',
      category: 'general',
      icon: 'CheckSquare',
      color: 'blue',
      priority: 'NORMAL',
      type: 'TASK',
      isAllDay: initialAllDay,
      targetDate: defaultDate,
      startTime: initialTime || '10:00',
      estimatedDuration: '30',
      notes: '',
    },
  })

  const isAllDay = watch('isAllDay')
  const selectedColor = watch('color')
  const selectedIcon = watch('icon')

  // Re-sync form when initial inputs change on open
  useEffect(() => {
    if (isOpen) {
      reset({
        name: '',
        category: 'general',
        icon: 'CheckSquare',
        color: 'blue',
        priority: 'NORMAL',
        type: 'TASK',
        isAllDay: initialTime ? false : initialAllDay,
        targetDate: initialDate || new Date().toISOString().split('T')[0],
        startTime: initialTime || '10:00',
        estimatedDuration: '30',
        notes: '',
      })
    }
  }, [isOpen, initialDate, initialTime, initialAllDay, reset])

  const onFormSubmit = async (values: TaskCreateFormValues) => {
    const durationNum = values.estimatedDuration ? parseInt(values.estimatedDuration, 10) : null
    
    await onSubmitTask({
      name: values.name.trim(),
      category: values.category || 'general',
      type: values.type,
      priority: values.priority,
      icon: values.icon,
      color: values.color,
      targetDate: `${values.targetDate}T00:00:00.000Z`,
      scheduledTime: values.isAllDay ? null : values.startTime,
      estimatedDuration: !values.isAllDay && !isNaN(durationNum ?? NaN) ? durationNum : null,
      isAllDay: values.isAllDay,
      notes: values.notes?.trim() || null,
      metadata: {
        isQuickTask: true,
        source,
        isAllDay: values.isAllDay,
        startTime: values.isAllDay ? undefined : values.startTime,
      },
    })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="md" className="p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 bg-[var(--color-bg-subtle)]/40 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center border border-[var(--color-primary)]/20">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-[var(--color-text-main)]">
                Create Task
              </DialogTitle>
              <DialogDescription className="text-[11px] text-[var(--color-text-muted)]">
                Schedule a new task or activity for {defaultDate}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-6 space-y-4 text-xs">
          {/* Task Name */}
          <div className="space-y-1">
            <Input
              label="Task Title *"
              placeholder="e.g., Read chapter 4, Team sync, Submit report…"
              {...register('name')}
              error={errors.name?.message}
              autoFocus
            />
          </div>

          {/* Date & All-day row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input
              type="date"
              label="Target Date"
              {...register('targetDate')}
              error={errors.targetDate?.message}
            />

            <div className="flex items-center gap-2 pb-2">
              <Controller
                control={control}
                name="isAllDay"
                render={({ field }) => (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="w-4 h-4 rounded-sm border-[var(--color-border)] accent-[var(--color-primary)] cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-[var(--color-text-main)]">
                      Anytime / All Day
                    </span>
                  </label>
                )}
              />
            </div>
          </div>

          {/* Timed options if not all day */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--color-bg-subtle)]/40 border border-[var(--color-border)] animate-in fade-in-50 duration-150">
              <Input
                type="time"
                label="Start Time"
                {...register('startTime')}
                error={errors.startTime?.message}
              />
              <Input
                type="number"
                label="Duration (minutes)"
                placeholder="30"
                min="5"
                max="720"
                step="5"
                {...register('estimatedDuration')}
                error={errors.estimatedDuration?.message}
              />
            </div>
          )}

          {/* Type & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  label="Type"
                  value={field.value}
                  onChange={field.onChange}
                  options={TYPE_OPTIONS}
                />
              )}
            />

            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select
                  label="Priority"
                  value={field.value}
                  onChange={field.onChange}
                  options={PRIORITY_OPTIONS}
                />
              )}
            />
          </div>

          {/* Icon & Color Selection */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Color & Style
              </label>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => field.onChange(c.value)}
                        className={`w-6 h-6 rounded-full transition-all cursor-pointer ${c.bgClass} ${
                          selectedColor === c.value
                            ? 'ring-2 ring-offset-2 ring-[var(--color-primary)] scale-110'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        title={c.label}
                      />
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Icon
              </label>
              <Controller
                control={control}
                name="icon"
                render={({ field }) => (
                  <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-subtle)]/30">
                    {ICON_OPTIONS.map(opt => (
                      <button
                        key={opt.name}
                        type="button"
                        onClick={() => field.onChange(opt.name)}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                          selectedIcon === opt.name
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-main)]'
                        }`}
                        title={opt.label}
                      >
                        <Icon name={opt.name} size={14} />
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1">
            <Textarea
              label="Notes (Optional)"
              placeholder="Additional details or links…"
              rows={2}
              {...register('notes')}
              error={errors.notes?.message}
            />
          </div>

          <DialogFooter className="px-0 pt-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export default TaskCreateDialog
