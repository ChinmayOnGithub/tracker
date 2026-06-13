"use client"

import React, { useState } from 'react'
import { ActivityTemplate, Tag, RecurrenceType } from '@/types'
import { createActivityTemplate, updateActivityTemplate } from '@/app/actions/template'
import { ICON_OPTIONS, Icon } from './Icon'
import { X, Info } from 'lucide-react'

interface TemplateModalProps {
  isOpen: boolean
  onClose: () => void
  templateToEdit: ActivityTemplate | null
  allTags: Tag[]
}

const COLOR_OPTIONS = [
  { value: 'zinc', bgClass: 'bg-zinc-500', borderClass: 'border-zinc-500', textClass: 'text-zinc-650' },
  { value: 'red', bgClass: 'bg-red-500', borderClass: 'border-red-500', textClass: 'text-red-650' },
  { value: 'orange', bgClass: 'bg-orange-500', borderClass: 'border-orange-500', textClass: 'text-orange-650' },
  { value: 'amber', bgClass: 'bg-amber-500', borderClass: 'border-amber-500', textClass: 'text-amber-650' },
  { value: 'green', bgClass: 'bg-green-500', borderClass: 'border-green-500', textClass: 'text-green-650' },
  { value: 'blue', bgClass: 'bg-blue-500', borderClass: 'border-blue-500', textClass: 'text-blue-650' },
  { value: 'purple', bgClass: 'bg-purple-500', borderClass: 'border-purple-500', textClass: 'text-purple-650' },
  { value: 'pink', bgClass: 'bg-pink-500', borderClass: 'border-pink-500', textClass: 'text-pink-655' },
]

const CATEGORIES = ['fitness', 'health', 'finance', 'chores', 'personal', 'custom']

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
  templateToEdit,
}) => {
  const [name, setName] = useState(templateToEdit?.name || '')
  const [category, setCategory] = useState(templateToEdit?.category || 'personal')
  const [icon, setIcon] = useState(templateToEdit?.icon || 'CheckSquare')
  const [color, setColor] = useState(templateToEdit?.color || 'zinc')
  const [notes, setNotes] = useState(templateToEdit?.notes || '')
  const [amount, setAmount] = useState(
    templateToEdit?.amount !== null && templateToEdit?.amount !== undefined
      ? String(templateToEdit.amount)
      : ''
  )
  
  // Recurrence configuration
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    templateToEdit?.recurrenceType || 'daily'
  )
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    templateToEdit?.recurrenceInterval ? String(templateToEdit.recurrenceInterval) : '1'
  )
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(() => {
    if (templateToEdit?.recurrenceDaysOfWeek) {
      return templateToEdit.recurrenceDaysOfWeek.split(',').map(Number)
    }
    return []
  })
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(
    templateToEdit?.recurrenceDayOfMonth ? String(templateToEdit.recurrenceDayOfMonth) : '15'
  )
  const [recurrenceMonth, setRecurrenceMonth] = useState(
    templateToEdit?.recurrenceMonth ? String(templateToEdit.recurrenceMonth) : '1'
  )
  const [targetDate, setTargetDate] = useState(
    templateToEdit?.targetDate || new Date().toISOString().split('T')[0]
  )
  const [remindBeforeDays, setRemindBeforeDays] = useState(
    templateToEdit?.remindBeforeDays ? String(templateToEdit.remindBeforeDays) : '3'
  )
  
  // Tag fields
  const [tagsInput, setTagsInput] = useState(
    templateToEdit?.tags ? templateToEdit.tags.map(t => t.name).join(', ') : ''
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (!isOpen) return null

  const handleWeekdayToggle = (day: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Please enter a template name')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')

    const parsedAmount = amount.trim() !== '' ? parseFloat(amount) : null
    const parsedInterval = recurrenceType === 'custom' ? parseInt(recurrenceInterval) || 1 : null
    const parsedDaysOfWeek = recurrenceType === 'weekly' && selectedWeekdays.length > 0
      ? selectedWeekdays.join(',')
      : null
    const parsedDayOfMonth = ['monthly', 'yearly'].includes(recurrenceType)
      ? parseInt(recurrenceDayOfMonth) || 15
      : null
    const parsedMonth = recurrenceType === 'yearly' ? parseInt(recurrenceMonth) || 1 : null
    const parsedTargetDate = recurrenceType === 'one_time' ? targetDate : null
    const parsedRemindBefore = remindBeforeDays.trim() !== '' ? parseInt(remindBeforeDays) || 0 : null

    // Split tags by comma and clean them up
    const tagNames = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    const payload = {
      name: name.trim(),
      category,
      icon,
      color,
      notes: notes.trim() || null,
      amount: parsedAmount,
      recurrenceType,
      recurrenceInterval: parsedInterval,
      recurrenceDaysOfWeek: parsedDaysOfWeek,
      recurrenceDayOfMonth: parsedDayOfMonth,
      recurrenceMonth: parsedMonth,
      targetDate: parsedTargetDate,
      remindBeforeDays: parsedRemindBefore,
      tagNames,
    }

    let result
    if (templateToEdit) {
      result = await updateActivityTemplate(templateToEdit.id, payload)
    } else {
      result = await createActivityTemplate(payload)
    }

    setIsSubmitting(true) // Keep loader visible briefly while Next.js routes update
    if (result.success) {
      setIsSubmitting(false)
      onClose()
    } else {
      setIsSubmitting(false)
      setErrorMsg(result.error || 'Something went wrong saving the template.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {templateToEdit ? 'Edit Activity Template' : 'Create New Activity Template'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-slate-600 dark:text-zinc-300">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-650 dark:text-red-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Name & Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Activity Name *</label>
              <input
                type="text"
                placeholder="e.g. Gym Workout, Haircut"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700"
                required
              />
            </div>
            <div>
              <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700 capitalize cursor-pointer"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Icon Picker */}
          <div>
            <label className="block text-slate-500 dark:text-zinc-400 mb-2 font-medium">Select Icon</label>
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-lg border border-slate-200 dark:border-zinc-800 max-h-36 overflow-y-auto">
              {ICON_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.name}
                  onClick={() => setIcon(opt.name)}
                  title={opt.label}
                  className={`p-2 rounded-md flex justify-center items-center hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${
                    icon === opt.name 
                      ? 'bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-300 dark:border-zinc-700' 
                      : 'text-slate-455 dark:text-zinc-500'
                  }`}
                >
                  <Icon name={opt.name} size={20} />
                </button>
              ))}
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-slate-500 dark:text-zinc-400 mb-2 font-medium">Color Label</label>
            <div className="flex flex-wrap gap-3">
              {COLOR_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setColor(opt.value)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${opt.bgClass} ${
                    color === opt.value ? 'ring-2 ring-slate-400 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-105' : ''
                  }`}
                  aria-label={opt.value}
                />
              ))}
            </div>
          </div>

          {/* Recurrence Selector */}
          <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Recurrence Type</label>
                <select
                  value={recurrenceType}
                  onChange={e => setRecurrenceType(e.target.value as RecurrenceType)}
                  className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-350 dark:focus:border-zinc-700 cursor-pointer"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom Interval</option>
                  <option value="milestone">Milestone (Last-Done Tracking)</option>
                  <option value="one_time">One-Time Event</option>
                </select>
              </div>

              {/* Conditional Recurrence Fields */}
              {recurrenceType === 'custom' && (
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Interval (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={recurrenceInterval}
                    onChange={e => setRecurrenceInterval(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                  />
                </div>
              )}

              {recurrenceType === 'monthly' && (
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Day of Month (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recurrenceDayOfMonth}
                    onChange={e => setRecurrenceDayOfMonth(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                  />
                </div>
              )}

              {recurrenceType === 'one_time' && (
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Target Date</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={e => setTargetDate(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                  />
                </div>
              )}
            </div>

            {recurrenceType === 'weekly' && (
              <div>
                <label className="block text-slate-500 dark:text-zinc-400 mb-2 font-medium">Select Days of Week (Optional)</label>
                <div className="flex gap-2">
                  {WEEKDAYS.map(day => {
                    const isSelected = selectedWeekdays.includes(day.value)
                    return (
                      <button
                        type="button"
                        key={day.value}
                        onClick={() => handleWeekdayToggle(day.value)}
                        className={`w-9 h-9 rounded-md flex items-center justify-center font-semibold transition-colors cursor-pointer ${
                          isSelected 
                            ? 'bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-300 dark:border-zinc-700' 
                            : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-400 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-white'
                        }`}
                      >
                        {day.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5 font-medium">
                  If no days are selected, it defaults to weekly from the last completion date.
                </p>
              </div>
            )}

            {recurrenceType === 'yearly' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Month (1-12)</label>
                  <select
                    value={recurrenceMonth}
                    onChange={e => setRecurrenceMonth(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700 cursor-pointer"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium">Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recurrenceDayOfMonth}
                    onChange={e => setRecurrenceDayOfMonth(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                  />
                </div>
              </div>
            )}

            {/* Warning Alert Threshold */}
            {recurrenceType !== 'milestone' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 dark:border-zinc-800 pt-3">
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1.5 font-medium flex items-center gap-1">
                    Warning Threshold (Days)
                    <span className="group relative text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer">
                      <Info size={14} />
                      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[10px] text-slate-500 dark:text-zinc-450 p-2 rounded-md w-44 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                        Highlights task in yellow this many days before the due date.
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 3"
                    value={remindBeforeDays}
                    onChange={e => setRemindBeforeDays(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-355 dark:focus:border-zinc-700"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Amount (Bills/Subscriptions) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-550 dark:text-zinc-400 mb-1.5 font-medium">
                Amount (Optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 dark:text-zinc-600 font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">For bills, sub payments, domain renewals, etc.</p>
            </div>
            <div>
              <label className="block text-slate-550 dark:text-zinc-400 mb-1.5 font-medium">
                Tags (Comma Separated)
              </label>
              <input
                type="text"
                placeholder="e.g. finance, sub, daily, health"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-550 dark:text-zinc-400 mb-1.5 font-medium">Notes / Instructions</label>
            <textarea
              placeholder="Provide context, details, or steps for this activity..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-700 focus:outline-hidden focus:border-slate-300 dark:focus:border-zinc-700 h-20 resize-y"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-355 font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSubmitting ? 'Saving...' : templateToEdit ? 'Save Changes' : 'Create Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

