"use client"

import React, { useState } from 'react'
import { Modal, Input, Button } from '@/design-system'
import { ActivityTemplate } from '@/types'
import { CompletionService } from '@/lib/services/CompletionService'

interface CompletionDialogProps {
  isOpen: boolean
  onClose: () => void
  template: ActivityTemplate | null
  onSave: (payload: { value: string | number | boolean | null }) => void
}

export const CompletionDialog: React.FC<CompletionDialogProps> = ({
  isOpen,
  onClose,
  template,
  onSave,
}) => {
  const [value, setValue] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const config = template ? CompletionService.getCompletionConfig(template) : null

  if (!isOpen || !template || !config || !config.value) return null

  const { label, unit, required, inputType } = config.value

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    const validation = CompletionService.validateInput(config, value)
    if (!validation.success) {
      setErrorMsg(validation.error || 'Invalid input')
      return
    }

    onSave({ value: validation.parsedValue ?? null })
    onClose()
  }

  const getHTMLInputType = () => {
    if (['number', 'decimal', 'currency', 'percentage', 'duration'].includes(inputType || 'number')) {
      return 'number'
    }
    return 'text'
  }

  const getStep = () => {
    if (inputType === 'decimal' || inputType === 'currency') {
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

        <div className="flex gap-2 items-end">
          <div className="grow">
            <Input
              type={getHTMLInputType()}
              step={getStep()}
              label={label || 'Enter Value'}
              value={value}
              onChange={e => setValue(e.target.value)}
              required={required}
              autoFocus
            />
          </div>
          {unit && (
            <span className="text-sm font-semibold text-[var(--color-text-muted)] pb-3 select-none">
              {unit}
            </span>
          )}
        </div>

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
