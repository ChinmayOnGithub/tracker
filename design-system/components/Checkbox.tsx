'use client'

import React, { useId } from 'react'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string
  description?: string
  size?: 'sm' | 'md'
  indeterminate?: boolean
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  description,
  size = 'md',
  indeterminate = false,
  checked,
  disabled,
  className = '',
  id: propId,
  ...props
}) => {
  const autoId = useId()
  const id = propId ?? autoId

  const boxSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const labelSize = size === 'sm' ? 'text-xs' : 'text-sm'

  const ref = React.useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = indeterminate
    },
    [indeterminate]
  )

  return (
    <label
      htmlFor={id}
      className={`inline-flex items-start gap-2.5 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        {/* Custom checkbox box */}
        <div
          className={`
            ${boxSize} rounded-[var(--radius-sm)] border-2
            border-[var(--color-border)]
            bg-[var(--color-bg-surface)]
            transition-all duration-[var(--motion-duration-fast)]
            peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)] peer-focus-visible:ring-offset-2
            peer-checked:bg-[var(--color-primary)] peer-checked:border-[var(--color-primary)]
            peer-indeterminate:bg-[var(--color-primary)] peer-indeterminate:border-[var(--color-primary)]
            group-hover:border-[var(--color-primary)]
          `}
        />
        {/* Checkmark */}
        <svg
          className={`
            absolute inset-0 m-auto text-white pointer-events-none
            ${size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'}
            opacity-0 peer-checked:opacity-100 transition-opacity duration-[var(--motion-duration-fast)]
          `}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {indeterminate ? (
            <line x1="2" y1="6" x2="10" y2="6" />
          ) : (
            <polyline points="2,6 5,9 10,3" />
          )}
        </svg>
      </div>

      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <span className={`${labelSize} font-medium text-[var(--color-text-main)] leading-snug`}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-[var(--color-text-muted)] leading-snug">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  )
}
