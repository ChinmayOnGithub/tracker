"use client"

import React, { useState } from 'react'
import { ActivityTemplate, Tag, RecurrenceType, ActivityType, Priority, CalendarProvider } from '@/types'
import { createActivityTemplate, updateActivityTemplate } from '@/app/actions/template'
import { ICON_OPTIONS, Icon } from './Icon'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { Modal, Input, Textarea, Select, Button } from '@/design-system'

interface TemplateModalProps {
  isOpen: boolean
  onClose: () => void
  templateToEdit: ActivityTemplate | null
  allTags?: Tag[]
}

const COLOR_OPTIONS = [
  { value: 'zinc', bgClass: 'bg-zinc-500', borderClass: 'border-zinc-500', textClass: 'text-zinc-650' },
  { value: 'red', bgClass: 'bg-red-500', borderClass: 'border-red-500', textClass: 'text-red-650' },
  { value: 'orange', bgClass: 'bg-orange-500', borderClass: 'border-orange-500', textClass: 'text-orange-650' },
  { value: 'amber', bgClass: 'bg-amber-500', borderClass: 'border-amber-500', textClass: 'text-amber-650' },
  { value: 'green', bgClass: 'bg-green-500', borderClass: 'border-green-500', textClass: 'text-green-650' },
  { value: 'blue', bgClass: 'bg-blue-500', borderClass: 'border-blue-500', textClass: 'text-blue-500' },
  { value: 'purple', bgClass: 'bg-purple-500', borderClass: 'border-purple-500', textClass: 'text-purple-650' },
  { value: 'pink', bgClass: 'bg-pink-500', borderClass: 'border-pink-500', textClass: 'text-pink-655' },
]

const CATEGORIES = [
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
  { value: 'health', label: 'Health' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'finance', label: 'Finance' },
  { value: 'chores', label: 'Chores' },
  { value: 'custom', label: 'Custom' },
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

export const TemplateModal: React.FC<TemplateModalProps> = ({
  isOpen,
  onClose,
  templateToEdit
}) => {
  // Derive default fields from templateToEdit on mount
  const [name, setName] = useState(templateToEdit?.name || '')
  const [category, setCategory] = useState(templateToEdit?.category || 'personal')
  const [icon, setIcon] = useState(templateToEdit?.icon || 'CheckSquare')
  const [color, setColor] = useState(templateToEdit?.color || 'zinc')
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(templateToEdit?.recurrenceType || 'daily')
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(() => 
    templateToEdit?.recurrenceDaysOfWeek ? templateToEdit.recurrenceDaysOfWeek.split(',').map(Number) : []
  )
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(() => 
    templateToEdit?.recurrenceDayOfMonth ? String(templateToEdit.recurrenceDayOfMonth) : '15'
  )
  const [targetDate, setTargetDate] = useState(() => 
    templateToEdit?.targetDate ? templateToEdit.targetDate.split('T')[0] : new Date().toISOString().split('T')[0]
  )
  const [isAllDay, setIsAllDay] = useState(() => {
    if (!templateToEdit) return true
    const meta = typeof templateToEdit.metadata === 'string' 
      ? JSON.parse(templateToEdit.metadata) 
      : templateToEdit.metadata || {}
    return meta.isAllDay ?? true
  })
  const [startTime, setStartTime] = useState(() => {
    if (!templateToEdit) return '09:00'
    const meta = typeof templateToEdit.metadata === 'string' 
      ? JSON.parse(templateToEdit.metadata) 
      : templateToEdit.metadata || {}
    return meta.startTime ?? '09:00'
  })

  // Advanced section
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [priority, setPriority] = useState<Priority>(templateToEdit?.priority || 'NORMAL')
  const [type, setType] = useState<ActivityType>(templateToEdit?.type || 'PERSONAL')
  const [notes, setNotes] = useState(templateToEdit?.notes || '')
  const [location, setLocation] = useState(() => {
    if (!templateToEdit) return ''
    const meta = typeof templateToEdit.metadata === 'string' 
      ? JSON.parse(templateToEdit.metadata) 
      : templateToEdit.metadata || {}
    return meta.location ?? ''
  })
  const [amount, setAmount] = useState(() => 
    templateToEdit?.amount !== null && templateToEdit?.amount !== undefined ? String(templateToEdit.amount) : ''
  )
  const [tagsInput, setTagsInput] = useState(() => 
    templateToEdit?.tags ? templateToEdit.tags.map(t => t.name).join(', ') : ''
  )
  const [estimatedDuration, setEstimatedDuration] = useState(() => 
    templateToEdit?.estimatedDuration ? String(templateToEdit.estimatedDuration) : '30'
  )
  const [calendarProvider, setCalendarProvider] = useState<CalendarProvider>(templateToEdit?.calendarProvider || 'NONE')
  const [hasReminder, setHasReminder] = useState(() => {
    if (!templateToEdit) return false
    const rules = typeof templateToEdit.notificationRules === 'string'
      ? JSON.parse(templateToEdit.notificationRules)
      : templateToEdit.notificationRules
    return Array.isArray(rules) && rules.length > 0
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [iconSearch, setIconSearch] = useState('')

  // Also support resetting state if props change without unmounting (rare but safe)
  const [prevTemplateToEdit, setPrevTemplateToEdit] = useState(templateToEdit)
  if (templateToEdit !== prevTemplateToEdit) {
    setPrevTemplateToEdit(templateToEdit)
    if (templateToEdit) {
      setName(templateToEdit.name)
      setCategory(templateToEdit.category)
      setIcon(templateToEdit.icon)
      setColor(templateToEdit.color)
      setRecurrenceType(templateToEdit.recurrenceType)
      setSelectedWeekdays(templateToEdit.recurrenceDaysOfWeek ? templateToEdit.recurrenceDaysOfWeek.split(',').map(Number) : [])
      setRecurrenceDayOfMonth(templateToEdit.recurrenceDayOfMonth ? String(templateToEdit.recurrenceDayOfMonth) : '15')
      setTargetDate(templateToEdit.targetDate ? templateToEdit.targetDate.split('T')[0] : new Date().toISOString().split('T')[0])
      setPriority(templateToEdit.priority)
      setType(templateToEdit.type)
      setNotes(templateToEdit.notes || '')
      setAmount(templateToEdit.amount !== null && templateToEdit.amount !== undefined ? String(templateToEdit.amount) : '')
      setTagsInput(templateToEdit.tags ? templateToEdit.tags.map(t => t.name).join(', ') : '')
      setCalendarProvider(templateToEdit.calendarProvider)

      const meta = typeof templateToEdit.metadata === 'string' 
        ? JSON.parse(templateToEdit.metadata) 
        : templateToEdit.metadata || {}
      setIsAllDay(meta.isAllDay ?? true)
      setStartTime(meta.startTime ?? '09:00')
      setLocation(meta.location ?? '')
      setEstimatedDuration(templateToEdit.estimatedDuration ? String(templateToEdit.estimatedDuration) : '30')

      const rules = typeof templateToEdit.notificationRules === 'string'
        ? JSON.parse(templateToEdit.notificationRules)
        : templateToEdit.notificationRules
      setHasReminder(Array.isArray(rules) && rules.length > 0)
    } else {
      setName('')
      setCategory('personal')
      setIcon('CheckSquare')
      setColor('zinc')
      setRecurrenceType('daily')
      setSelectedWeekdays([])
      setRecurrenceDayOfMonth('15')
      setTargetDate(new Date().toISOString().split('T')[0])
      setIsAllDay(true)
      setStartTime('09:00')
      setPriority('NORMAL')
      setType('PERSONAL')
      setNotes('')
      setLocation('')
      setAmount('')
      setTagsInput('')
      setEstimatedDuration('30')
      setCalendarProvider('NONE')
      setHasReminder(false)
      setShowAdvanced(false)
    }
    setErrorMsg('')
    setIconSearch('')
  }

  if (!isOpen) return null

  const handleWeekdayToggle = (day: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const getNaturalRecurrenceText = () => {
    switch (recurrenceType) {
      case 'daily':
        return 'Repeats daily'
      case 'weekly':
        if (selectedWeekdays.length === 0) return 'Repeats weekly'
        const days = selectedWeekdays.map(d => {
          const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          return names[d]
        })
        return `Repeats weekly on ${days.join(', ')}`
      case 'monthly':
        return `Repeats monthly on day ${recurrenceDayOfMonth}`
      case 'one_time':
        return `Once on ${targetDate}`
      default:
        return 'No repeat'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Please specify an activity name')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')

    const parsedAmount = amount.trim() !== '' ? parseFloat(amount) : null
    const parsedDaysOfWeek = recurrenceType === 'weekly' && selectedWeekdays.length > 0
      ? selectedWeekdays.join(',')
      : null
    const parsedDayOfMonth = ['monthly'].includes(recurrenceType)
      ? parseInt(recurrenceDayOfMonth) || 15
      : null
    const parsedTargetDate = recurrenceType === 'one_time' && targetDate ? `${targetDate}T00:00:00.000Z` : null

    const tagNames = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    const meta = {
      startTime,
      isAllDay,
      location
    }

    const payload = {
      name: name.trim(),
      category,
      type,
      priority,
      estimatedDuration: isAllDay ? 0 : parseInt(estimatedDuration) || 0,
      scheduledTime: isAllDay ? null : startTime,
      calendarProvider,
      notificationRules: hasReminder ? [{ channel: 'PUSH', offsetMinutes: -15 }] : [],
      icon,
      color,
      notes: notes.trim() || null,
      amount: parsedAmount,
      recurrenceType,
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: parsedDaysOfWeek,
      recurrenceDayOfMonth: parsedDayOfMonth,
      recurrenceMonth: null,
      targetDate: parsedTargetDate,
      remindBeforeDays: null,
      tagNames,
      metadata: meta,
    }

    let result
    if (templateToEdit) {
      result = await updateActivityTemplate(templateToEdit.id, payload)
    } else {
      result = await createActivityTemplate(payload)
    }

    if (result.success) {
      setIsSubmitting(false)
      onClose()
    } else {
      setIsSubmitting(false)
      setErrorMsg(result.error || 'Something went wrong saving the activity.')
    }
  }

  const filteredIcons = ICON_OPTIONS.filter(opt =>
    opt.label.toLowerCase().includes(iconSearch.toLowerCase()) ||
    opt.name.toLowerCase().includes(iconSearch.toLowerCase())
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={templateToEdit ? 'Edit Activity' : 'New Activity'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-500 rounded-lg flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Basic Details Section */}
        <div className="space-y-4 pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] border-b border-[var(--color-border)]/40 pb-1.5">
            Basic Details
          </h4>

          {/* Name input */}
        <Input
          label="Activity Name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Daily Reflection, Workout, Study session"
          required
        />

        {/* Category */}
        <Select
          label="Category"
          value={category}
          onChange={e => setCategory(e.target.value)}
          options={CATEGORIES}
        />

        {/* Icon Selector — Notion-style visual grid with Search */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--color-text-muted)]">Icon</label>
            <input
              type="text"
              placeholder="Search icons..."
              value={iconSearch}
              onChange={e => setIconSearch(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)] focus:outline-hidden focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] w-44"
            />
          </div>
          <div className="max-h-48 overflow-y-auto pr-1 grid grid-cols-6 sm:grid-cols-8 gap-2 border border-[var(--color-border)]/50 p-2 rounded-xl bg-slate-50/50 dark:bg-zinc-900/30">
            {filteredIcons.map(opt => (
              <Button
                key={opt.name}
                type="button"
                variant={icon === opt.name ? 'primary' : 'outline'}
                onClick={() => setIcon(opt.name)}
                className={`flex flex-col items-center justify-center gap-1 p-2.5 ${
                  icon === opt.name ? 'ring-1 ring-[var(--color-primary)]/30' : ''
                }`}
                title={opt.label}
              >
                <Icon name={opt.name} size={18} />
                <span className="text-[8px] font-bold leading-none truncate w-full text-center">{opt.label.split('/')[0]}</span>
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
            {COLOR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setColor(opt.value)}
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
        <div className="grid grid-cols-2 gap-4 border border-[var(--color-border)] p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-base)]">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isAllDay"
              checked={isAllDay}
              onChange={e => setIsAllDay(e.target.checked)}
              className="w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer"
            />
            <label htmlFor="isAllDay" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
              Anytime / All Day
            </label>
          </div>

          {!isAllDay && (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                label="Start Time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
          )}
        </div>

        </div>

        {/* Repeat Recurrence Builder */}
        <div className="space-y-3 pt-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] border-b border-[var(--color-border)]/40 pb-1.5">
            Schedule & Recurrence
          </h4>
          <div className="border border-[var(--color-border)] p-3.5 rounded-[var(--radius-md)] space-y-3 bg-[var(--color-bg-base)]">
          <Select
            label="Repeat Interval"
            value={recurrenceType}
            onChange={e => setRecurrenceType(e.target.value as RecurrenceType)}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'one_time', label: 'Once (No Repeat)' },
            ]}
          />

          {recurrenceType === 'weekly' && (
            <div className="flex justify-between gap-1 pt-1.5 font-sans">
              {WEEKDAYS.map(day => {
                const isSelected = selectedWeekdays.includes(day.value)
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
              value={recurrenceDayOfMonth}
              onChange={e => setRecurrenceDayOfMonth(e.target.value)}
            />
          )}

          {recurrenceType === 'one_time' && (
            <Input
              type="date"
              label="Date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
            />
          )}

          <div className="text-[10px] font-bold text-[var(--color-text-muted)] italic pt-0.5">
            {getNaturalRecurrenceText()}
          </div>
        </div>
        </div>
        {/* Collapsible Advanced Section */}
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
              <Select
                label="Activity Sub-Type"
                value={type}
                onChange={e => setType(e.target.value as ActivityType)}
                options={[
                  { value: 'PERSONAL', label: 'Personal Task' },
                  { value: 'WORKOUT', label: 'Workout Session' },
                  { value: 'MEETING', label: 'Meeting Event' },
                  { value: 'BILL', label: 'Financial Bill' },
                  { value: 'MEDICINE', label: 'Medicine Intake' },
                  { value: 'LEAVE', label: 'Leave Holiday' },
                  { value: 'JOURNAL', label: 'Journal Log' },
                  { value: 'LEARNING', label: 'Study Learning' },
                  { value: 'REMINDER', label: 'Custom Alert' },
                ]}
              />


              {!isAllDay && (
                <Input
                  type="number"
                  label="Duration (Minutes)"
                  value={estimatedDuration}
                  onChange={e => setEstimatedDuration(e.target.value)}
                />
              )}

              <Input
                label="Location / Meeting URL"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Zoom Link, Local Gym, Office"
              />

              <Input
                label="Tags (Comma Separated)"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="e.g. gym, wellness, finance"
              />

              <Input
                type="number"
                label="Billing Amount (₹)"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 500"
              />

              <div className="grid grid-cols-2 gap-4 border border-[var(--color-border)] p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-base)]">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasReminder"
                    checked={hasReminder}
                    onChange={e => setHasReminder(e.target.checked)}
                    className="w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer"
                  />
                  <label htmlFor="hasReminder" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
                    Enable Reminders
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="googleSync"
                    checked={calendarProvider === 'GOOGLE'}
                    onChange={e => setCalendarProvider(e.target.checked ? 'GOOGLE' : 'NONE')}
                    className="w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer"
                  />
                  <label htmlFor="googleSync" className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
                    Sync to Google Calendar
                  </label>
                </div>
              </div>

              <Textarea
                label="Notes / Instructions"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Write bullet points or reference notes..."
              />
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4 mt-4">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>
            Save Activity
          </Button>
        </div>
      </form>
    </Modal>
  )
}

