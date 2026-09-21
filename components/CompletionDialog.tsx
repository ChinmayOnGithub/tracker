"use client"

import React, { useState } from 'react'
import { Modal, Input, Select, Button } from '@/design-system'
import { ActivityTemplate } from '@/types'
import { CompletionService } from '@/lib/services/CompletionService'

interface CompletionDialogProps {
  isOpen: boolean
  onClose: () => void
  template: ActivityTemplate | null
  onSave: (payload: { value: unknown; values?: Record<string, unknown> }) => void
}

export const CompletionDialog: React.FC<CompletionDialogProps> = ({
  isOpen,
  onClose,
  template,
  onSave,
}) => {
  const [value, setValue] = useState('')
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [errorMsg, setErrorMsg] = useState('')

  const config = template ? CompletionService.getCompletionConfig(template) : null

  if (!isOpen || !template || !config) return null
  if (config.method !== 'VALUE' && config.method !== 'FORM') return null

  const isForm = config.method === 'FORM'
  const schema = config.schema || config.form

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (isForm && schema) {
      const validation = CompletionService.validateForm(schema, formValues)
      if (!validation.success) {
        setErrorMsg(validation.error || 'Please fill in required fields correctly.')
        return
      }
      onSave({
        value: validation.parsedValues ?? null,
        values: validation.parsedValues ?? {}
      })
      onClose()
      return
    }

    if (config.value) {
      const validation = CompletionService.validateInput(config, value)
      if (!validation.success) {
        setErrorMsg(validation.error || 'Invalid input')
        return
      }

      onSave({ value: validation.parsedValue ?? null })
      onClose()
    }
  }

  const getHTMLInputType = (inputType?: string) => {
    if (['number', 'decimal', 'currency', 'percentage', 'duration'].includes(inputType || 'number')) {
      return 'number'
    }
    return 'text'
  }

  const getStep = (inputType?: string) => {
    if (['number', 'decimal', 'currency', 'percentage'].includes(inputType || 'number')) {
      return 'any'
    }
    return '1'
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template.name}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-500 rounded-lg text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {isForm && schema ? (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {schema.fields.map(field => {
              const currentVal = formValues[field.id] !== undefined ? String(formValues[field.id]) : ''
              if (field.type === 'select') {
                const options = (field.options || []).map(opt => ({ value: opt, label: opt }))
                return (
                  <div key={field.id}>
                    <Select
                      label={field.label}
                      value={String(formValues[field.id] || '')}
                      onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                      options={[{ value: '', label: '-- Select --' }, ...options]}
                    />
                  </div>
                )
              }

              if (field.type === 'boolean') {
                return (
                  <div key={field.id} className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id={`form-field-${field.id}`}
                      checked={Boolean(formValues[field.id])}
                      onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.checked }))}
                      className="w-4 h-4 rounded accent-[var(--color-primary)] cursor-pointer"
                    />
                    <label htmlFor={`form-field-${field.id}`} className="text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
                      {field.label}
                    </label>
                  </div>
                )
              }

              return (
                <div key={field.id} className="flex gap-2 items-end">
                  <div className="grow">
                    <Input
                      type={getHTMLInputType(field.type)}
                      step={getStep(field.type)}
                      label={field.label}
                      value={currentVal}
                      onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                      required={field.required}
                    />
                  </div>
                  {field.unit && (
                    <span className="text-sm font-semibold text-[var(--color-text-muted)] pb-3 select-none shrink-0">
                      {field.unit}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : config.value ? (
          <div className="flex gap-2 items-end">
            <div className="grow">
              <Input
                type={getHTMLInputType(config.value.inputType)}
                step={getStep(config.value.inputType)}
                label={config.value.label || 'Enter Value'}
                value={value}
                onChange={e => setValue(e.target.value)}
                required={config.value.required}
                autoFocus
              />
            </div>
            {config.value.unit && (
              <span className="text-sm font-semibold text-[var(--color-text-muted)] pb-3 select-none shrink-0">
                {config.value.unit}
              </span>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)]/40 pt-4 mt-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
export default CompletionDialog
