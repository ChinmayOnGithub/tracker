import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input: React.FC<InputProps> = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, '-')}`
  const baseInputStyle = 'w-full px-3 py-2 text-sm bg-[var(--color-bg-base)] border rounded-[var(--radius-md)] text-[var(--color-text-main)] transition-colors duration-200 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]'
  const borderStyle = error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-[var(--color-border)]'

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[var(--color-text-muted)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`${baseInputStyle} ${borderStyle} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </div>
  )
})

Input.displayName = 'Input'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea: React.FC<TextareaProps> = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  className = '',
  id,
  rows = 3,
  ...props
}, ref) => {
  const textareaId = id || `textarea-${label?.toLowerCase().replace(/\s+/g, '-')}`
  const baseTextareaStyle = 'w-full px-3 py-2 text-sm bg-[var(--color-bg-base)] border rounded-[var(--radius-md)] text-[var(--color-text-main)] transition-colors duration-200 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-y'
  const borderStyle = error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-[var(--color-border)]'

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={textareaId} className="text-xs font-medium text-[var(--color-text-muted)]">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={`${baseTextareaStyle} ${borderStyle} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </div>
  )
})

Textarea.displayName = 'Textarea'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
}

export const Select: React.FC<SelectProps> = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  options,
  className = '',
  id,
  ...props
}, ref) => {
  const selectId = id || `select-${label?.toLowerCase().replace(/\s+/g, '-')}`
  const baseSelectStyle = 'w-full px-3 py-2 text-sm bg-[var(--color-bg-base)] border rounded-[var(--radius-md)] text-[var(--color-text-main)] transition-colors duration-200 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer'
  const borderStyle = error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-[var(--color-border)]'

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-[var(--color-text-muted)]">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`${baseSelectStyle} ${borderStyle} ${className}`}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </div>
  )
})

Select.displayName = 'Select'
