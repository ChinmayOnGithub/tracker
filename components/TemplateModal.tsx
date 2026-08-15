"use client"

import React, { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActivityTemplate, Tag, RecurrenceType, ActivityType, Priority, CalendarProvider } from '@/types'
import { createActivityTemplate, updateActivityTemplate } from '@/app/actions/template'
import { ICON_OPTIONS, Icon } from './Icon'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { Modal, Input, Select, Button } from '@/design-system'
import { templateFormSchema, type TemplateFormValues } from '@/lib/validations'

interface TemplateModalProps {
  isOpen: boolean
  onClose: () => void
  templateToEdit: ActivityTemplate | null
  allTags?: Tag[]
}

const COLOR_OPTIONS = [
  { value: 'zinc',   bgClass: 'bg-zinc-500' },
  { value: 'red',    bgClass: 'bg-red-500' },
  { value: 'orange', bgClass: 'bg-orange-500' },
  { value: 'amber',  bgClass: 'bg-amber-500' },
  { value: 'green',  bgClass: 'bg-green-500' },
  { value: 'blue',   bgClass: 'bg-blue-500' },
  { value: 'purple', bgClass: 'bg-purple-500' },
  { value: 'pink',   bgClass: 'bg-pink-500' },
]

const CATEGORIES = [
  { value: 'personal', label: 'Personal' },
  { value: 'work',     label: 'Work' },
  { value: 'health',   label: 'Health' },
  { value: 'fitness',  label: 'Fitness' },
  { value: 'finance',  label: 'Finance' },
  { value: 'chores',   label: 'Chores' },
  { value: 'custom',   label: 'Custom' },
]

const WEEKDAYS = [
  { value: 0, label: 'Su' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMeta(template: ActivityTemplate | null) {
  if (!template) return {}
  return typeof template.metadata === 'string'
    ? JSON.parse(template.metadata || '{}')
    : (template.metadata ?? {})
}

function parseRules(template: ActivityTemplate | null) {
  if (!template) return []
  return typeof template.notificationRules === 'string'
    ? JSON.parse(template.notificationRules || '[]')
    : (template.notificationRules ?? [])
}

function buildDefaultValues(template: ActivityTemplate | null): TemplateFormValues {
  const meta = parseMeta(template)
  const rules = parseRules(template)

  return {
    name:                 template?.name ?? '',
    category:             template?.category ?? 'personal',
    icon:                 template?.icon ?? 'CheckSquare',
    color:                template?.color ?? 'zinc',
    recurrenceType:       (template?.recurrenceType as RecurrenceType) ?? 'daily',
    selectedWeekdays:     template?.recurrenceDaysOfWeek
                            ? template.recurrenceDaysOfWeek.split(',').map(Number)
                            : [],
    recurrenceDayOfMonth: template?.recurrenceDayOfMonth ? String(template.recurrenceDayOfMonth) : '15',
    targetDate:           template?.targetDate
                            ? template.targetDate.split('T')[0]
                            : new Date().toISOString().split('T')[0],
    isAllDay:             meta.isAllDay ?? true,
    startTime:            meta.startTime ?? '09:00',
    completionMethod:     meta.completion?.method ?? 'CHECKBOX',
    completionHook:       meta.completion?.hook ?? 'none',
    valueLabel:           meta.completion?.value?.label ?? '',
    valueInputType:       meta.completion?.value?.inputType ?? 'number',
    valueUnit:            meta.completion?.value?.unit ?? '',
    valueRequired:        meta.completion?.value?.required ?? false,
    valueMinimum:         meta.completion?.value?.minimum != null
                            ? String(meta.completion.value.minimum)
                            : '',
    valueMaximum:         meta.completion?.value?.maximum != null
                            ? String(meta.completion.value.maximum)
                            : '',
    priority:             (template?.priority as Priority) ?? 'NORMAL',
    type:                 (template?.type as ActivityType) ?? 'PERSONAL',
    notes:                template?.notes ?? '',
    location:             meta.location ?? '',
    amount:               template?.amount != null ? String(template.amount) : '',
    tagsInput:            template?.tags ? template.tags.map((t: Tag) => t.name).join(', ') : '',
    estimatedDuration:    template?.estimatedDuration ? String(template.estimatedDuration) : '30',
    calendarProvider:     (template?.calendarProvider as CalendarProvider) ?? 'NONE',
    hasReminder:          Array.isArray(rules) && rules.length > 0,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const TemplateModal: React.FC<TemplateModalProps> = ({
  isOpen,
  onClose,
  templateToEdit,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [iconSearch, setIconSearch] = useState('')
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: buildDefaultValues(templateToEdit),
  })

  // Reset the form whenever the modal opens with a new (or null) template
  useEffect(() => {
    if (isOpen) {
      reset(buildDefaultValues(templateToEdit))
      setShowAdvanced(false)
      setIconSearch('')
      setServerError('')
    }
  }, [isOpen, templateToEdit, reset])

  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() is not memoizable by design; intentional
  const recurrenceType  = watch('recurrenceType')
  const isAllDay        = watch('isAllDay')
  const completionMethod = watch('completionMethod')
  const valueInputType  = watch('valueInputType')
  const selectedWeekdays = watch('selectedWeekdays')
  const icon            = watch('icon')
  const color           = watch('color')
  const targetDate      = watch('targetDate')
  const recurrenceDayOfMonth = watch('recurrenceDayOfMonth')
  const valueUnit       = watch('valueUnit')

  if (!isOpen) return null

  // ── Helpers ──────────────────────────────────────────────────────────────

  const handleWeekdayToggle = (day: number) => {
    const current = selectedWeekdays ?? []
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort()
    setValue('selectedWeekdays', next)
  }

  const getNaturalRecurrenceText = () => {
    switch (recurrenceType) {
      case 'daily':    return 'Repeats daily'
      case 'weekly': {
        if (!selectedWeekdays?.length) return 'Repeats weekly'
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return `Repeats weekly on ${selectedWeekdays.map((d) => names[d]).join(', ')}`
      }
      case 'monthly':  return `Repeats monthly on day ${recurrenceDayOfMonth}`
      case 'one_time': return `Once on ${targetDate}`
      case 'milestone': return 'Custom / Ad-hoc (Unscheduled, added manually)'
      default:         return 'No repeat'
    }
  }

  const onSubmit = async (values: TemplateFormValues) => {
    setServerError('')

    const parsedAmount        = values.amount.trim() !== '' ? parseFloat(values.amount) : null
    const parsedDaysOfWeek    = values.recurrenceType === 'weekly' && values.selectedWeekdays.length > 0
                                  ? values.selectedWeekdays.join(',')
                                  : null
    const parsedDayOfMonth    = values.recurrenceType === 'monthly'
                                  ? parseInt(values.recurrenceDayOfMonth) || 15
                                  : null
    const parsedTargetDate    = values.recurrenceType === 'one_time' && values.targetDate
                                  ? `${values.targetDate}T00:00:00.000Z`
                                  : null

    const tagNames = values.tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    const meta: {
      startTime: string
      isAllDay: boolean
      location: string
      completion: {
        method: 'CHECKBOX' | 'VALUE' | 'FORM'
        hook: string
        value?: {
          label: string
          inputType: string
          unit: string | null
          required: boolean
          minimum: number | null
          maximum: number | null
        }
      }
    } = {
      startTime:  values.startTime,
      isAllDay:   values.isAllDay,
      location:   values.location,
      completion: { method: values.completionMethod, hook: values.completionHook },
    }

    if (values.completionMethod === 'VALUE') {
      meta.completion.value = {
        label:     values.valueLabel.trim() || values.name.trim(),
        inputType: values.valueInputType,
        unit:      values.valueUnit.trim() || null,
        required:  values.valueRequired,
        minimum:   values.valueMinimum.trim() !== '' ? parseFloat(values.valueMinimum) : null,
        maximum:   values.valueMaximum.trim() !== '' ? parseFloat(values.valueMaximum) : null,
      }
    }

    const payload = {
      name:                 values.name.trim(),
      category:             values.category,
      type:                 values.type as ActivityType,
      priority:             values.priority as Priority,
      estimatedDuration:    values.isAllDay ? 0 : parseInt(values.estimatedDuration) || 0,
      scheduledTime:        values.isAllDay ? null : values.startTime,
      calendarProvider:     values.calendarProvider as CalendarProvider,
      notificationRules:    values.hasReminder ? [{ channel: 'PUSH', offsetMinutes: -15 }] : [],
      icon:                 values.icon,
      color:                values.color,
      notes:                values.notes.trim() || null,
      amount:               parsedAmount,
      recurrenceType:       values.recurrenceType,
      recurrenceInterval:   1,
      recurrenceDaysOfWeek: parsedDaysOfWeek,
      recurrenceDayOfMonth: parsedDayOfMonth,
      recurrenceMonth:      null,
      targetDate:           parsedTargetDate,
      remindBeforeDays:     null,
      tagNames,
      metadata:             meta,
    }

    const result = templateToEdit
      ? await updateActivityTemplate(templateToEdit.id, payload)
      : await createActivityTemplate(payload)

    if (result.success) {
      onClose()
    } else {
      setServerError(result.error || 'Something went wrong saving the activity.')
    }
  }

  const filteredIcons = ICON_OPTIONS.filter(
    (opt) =>
      opt.label.toLowerCase().includes(iconSearch.toLowerCase()) ||
      opt.name.toLowerCase().includes(iconSearch.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={templateToEdit ? 'Edit Activity' : 'New Activity'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Server-level error banner */}
        {serverError && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-500 rounded-lg flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* ── Basic Details ──────────────────────────────────────────────── */}
        <div className="space-y-4 pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] border-b border-[var(--color-border)]/40 pb-1.5">
            Basic Details
          </h4>

          <Input
            label="Activity Name"
            placeholder="e.g. Daily Reflection, Workout, Study session"
            error={errors.name?.message}
            {...register('name')}
          />

          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select
                label="Category"
                options={CATEGORIES}
                error={errors.category?.message}
                {...field}
              />
            )}
          />

          {/* Icon Selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--color-text-muted)]">Icon</label>
              <input
                type="text"
                placeholder="Search icons..."
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)] focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] w-44"
              />
            </div>
            <div className="max-h-48 overflow-y-auto pr-1 grid grid-cols-6 sm:grid-cols-8 gap-2 border border-[var(--color-border)]/50 p-2 rounded-xl bg-slate-50/50 dark:bg-zinc-900/30">
              {filteredIcons.map((opt) => (
                <Button
                  key={opt.name}
                  type="button"
                  variant={icon === opt.name ? 'primary' : 'outline'}
                  onClick={() => setValue('icon', opt.name)}
                  className={`flex flex-col items-center justify-center gap-1 p-2.5 ${icon === opt.name ? 'ring-1 ring-[var(--color-primary)]/30' : ''}`}
                  title={opt.label}
                >
                  <Icon name={opt.name} size={18} />
                  <span className="text-[8px] font-bold leading-none truncate w-full text-center">
                    {opt.label.split('/')[0]}
                  </span>
                </Button>
              ))}
              {filteredIcons.length === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-[var(--color-text-muted)] font-medium">
                  No matching icons found.
                </div>
              )}
            </div>
          </div>

          {/* Color Tags */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Color Tag</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('color', opt.value)}
                  className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${opt.bgClass} ${
                    color === opt.value
                      ? 'ring-2 ring-[var(--color-primary)] ring-offset-2 scale-105'
                      : 'hover:scale-105'
                  }`}
                  title={opt.value}
                />
              ))}
            </div>
          </div>

          {/* Time Settings */}
          {recurrenceType !== 'milestone' && (
            <div className="grid grid-cols-2 gap-4 border border-[var(--color-border)] p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-base)]">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAllDay"
                  className="w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer"
                  {...register('isAllDay')}
                />
                <label htmlFor="isAllDay" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
                  Anytime / All Day
                </label>
              </div>
              {!isAllDay && (
                <Input
                  type="time"
                  label="Start Time"
                  {...register('startTime')}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Schedule & Recurrence ──────────────────────────────────────── */}
        <div className="space-y-4 pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] border-b border-[var(--color-border)]/40 pb-1.5">
            Schedule & Recurrence
          </h4>
          <div className="border border-[var(--color-border)] p-3.5 rounded-[var(--radius-md)] space-y-3 bg-[var(--color-bg-base)]">
            <Controller
              name="recurrenceType"
              control={control}
              render={({ field }) => (
                <Select
                  label="Repeat Interval"
                  options={[
                    { value: 'daily',     label: 'Daily' },
                    { value: 'weekly',    label: 'Weekly' },
                    { value: 'monthly',   label: 'Monthly' },
                    { value: 'milestone', label: 'Custom / Ad-hoc (Unscheduled)' },
                    { value: 'one_time',  label: 'Once (Scheduled Date)' },
                  ]}
                  {...field}
                />
              )}
            />

            {recurrenceType === 'weekly' && (
              <div className="flex justify-between gap-1 pt-1.5 font-sans">
                {WEEKDAYS.map((day) => {
                  const isSelected = (selectedWeekdays ?? []).includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => handleWeekdayToggle(day.value)}
                      className={`w-7 h-7 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--color-primary)] text-white font-black'
                          : 'bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-slate-350'
                      }`}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            )}

            {recurrenceType === 'monthly' && (
              <Input
                type="number"
                min="1"
                max="31"
                label="Day of Month"
                {...register('recurrenceDayOfMonth')}
              />
            )}

            {recurrenceType === 'one_time' && (
              <Input
                type="date"
                label="Date"
                {...register('targetDate')}
              />
            )}

            <div className="text-[10px] font-bold text-[var(--color-text-muted)] italic pt-0.5">
              {getNaturalRecurrenceText()}
            </div>
          </div>
        </div>

        {/* ── Advanced Options ───────────────────────────────────────────── */}
        <div className="border-t border-[var(--color-border)] pt-3 mt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between py-1 text-slate-400 dark:text-zinc-500 hover:text-[var(--color-text-main)] select-none text-[10px] uppercase tracking-wider font-extrabold cursor-pointer"
          >
            <span>Advanced Options</span>
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-3.5 border-t border-dashed border-[var(--color-border)] mt-2">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select
                    label="Activity Sub-Type"
                    options={[
                      { value: 'PERSONAL',  label: 'Personal Task' },
                      { value: 'WORKOUT',   label: 'Workout Session' },
                      { value: 'MEETING',   label: 'Meeting Event' },
                      { value: 'BILL',      label: 'Financial Bill' },
                      { value: 'MEDICINE',  label: 'Medicine Intake' },
                      { value: 'LEAVE',     label: 'Leave Holiday' },
                      { value: 'JOURNAL',   label: 'Journal Log' },
                      { value: 'LEARNING',  label: 'Study Learning' },
                      { value: 'REMINDER',  label: 'Custom Alert' },
                    ]}
                    {...field}
                  />
                )}
              />

              {!isAllDay && (
                <Input
                  type="number"
                  label="Duration (Minutes)"
                  {...register('estimatedDuration')}
                />
              )}

              <Input
                label="Location / Meeting URL"
                placeholder="e.g. Zoom Link, Local Gym, Office"
                {...register('location')}
              />

              <Input
                label="Tags (Comma Separated)"
                placeholder="e.g. gym, wellness, finance"
                {...register('tagsInput')}
              />

              <Input
                type="number"
                label="Billing Amount (₹)"
                placeholder="e.g. 500"
                {...register('amount')}
              />

              {/* Completion Engine */}
              <div className="border border-[var(--color-border)] p-3 rounded-[var(--radius-md)] space-y-3 bg-[var(--color-bg-base)]">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">Completion Method</h5>

                <Controller
                  name="completionMethod"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Method"
                      options={[
                        { value: 'CHECKBOX', label: 'Checkbox Only' },
                        { value: 'VALUE',    label: 'Value Prompt' },
                        { value: 'FORM',     label: 'Custom Form (Disabled)' },
                      ]}
                      {...field}
                    />
                  )}
                />

                <Controller
                  name="completionHook"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Domain Hook"
                      options={[
                        { value: 'none',   label: 'None' },
                        { value: 'weight', label: 'Weight Tracking' },
                      ]}
                      {...field}
                    />
                  )}
                />

                {completionMethod === 'VALUE' && (
                  <div className="space-y-3 pt-2 border-t border-dashed border-[var(--color-border)]">
                    <Input
                      label="Value Label"
                      placeholder="e.g. Fuel Amount, Pages Read"
                      {...register('valueLabel')}
                    />

                    <Controller
                      name="valueInputType"
                      control={control}
                      render={({ field }) => (
                        <Select
                          label="Input Type"
                          options={[
                            { value: 'number',     label: 'Number' },
                            { value: 'decimal',    label: 'Decimal' },
                            { value: 'currency',   label: 'Currency' },
                            { value: 'text',       label: 'Text' },
                            { value: 'duration',   label: 'Duration' },
                            { value: 'percentage', label: 'Percentage' },
                          ]}
                          {...field}
                          onChange={(e) => {
                            const nextType = e.target.value
                            field.onChange(e)
                            if (nextType === 'currency' && !valueUnit) {
                              setValue('valueUnit', '₹')
                            } else if (!['number', 'decimal', 'currency', 'percentage'].includes(nextType)) {
                              setValue('valueUnit', '')
                            }
                          }}
                        />
                      )}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      {valueInputType === 'currency' ? (
                        <div className="space-y-2">
                          <Select
                            label="Currency"
                            value={['₹', '$', '€', '£', '¥'].includes(valueUnit) ? valueUnit : 'custom'}
                            onChange={(e) => {
                              const val = e.target.value
                              setValue('valueUnit', val !== 'custom' ? val : '')
                            }}
                            options={[
                              { value: '₹',      label: '₹ (INR - Rupees)' },
                              { value: '$',      label: '$ (USD - Dollars)' },
                              { value: '€',      label: '€ (EUR - Euros)' },
                              { value: '£',      label: '£ (GBP - Pounds)' },
                              { value: '¥',      label: '¥ (JPY - Yen)' },
                              { value: 'custom', label: 'Other / Custom' },
                            ]}
                          />
                          {!['₹', '$', '€', '£', '¥'].includes(valueUnit) && (
                            <Input
                              label="Custom Currency Symbol"
                              placeholder="e.g. CAD, AUD"
                              {...register('valueUnit')}
                            />
                          )}
                        </div>
                      ) : ['number', 'decimal', 'percentage'].includes(valueInputType) ? (
                        <Input
                          label="Unit Label"
                          placeholder="e.g. L, kg, ml"
                          {...register('valueUnit')}
                        />
                      ) : (
                        <div /> /* spacer */
                      )}

                      <div className="flex items-center gap-2 pt-5">
                        <input
                          type="checkbox"
                          id="valueRequired"
                          className="w-4 h-4 cursor-pointer"
                          {...register('valueRequired')}
                        />
                        <label htmlFor="valueRequired" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
                          Required
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        label="Minimum Value"
                        placeholder="Optional"
                        {...register('valueMinimum')}
                      />
                      <Input
                        type="number"
                        label="Maximum Value"
                        placeholder="Optional"
                        {...register('valueMaximum')}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Reminder */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasReminder"
                  className="w-4 h-4 cursor-pointer"
                  {...register('hasReminder')}
                />
                <label htmlFor="hasReminder" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
                  Enable Reminder (15 min before)
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2 border-t border-[var(--color-border)]">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            className="flex-1"
          >
            {templateToEdit ? 'Save Changes' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
