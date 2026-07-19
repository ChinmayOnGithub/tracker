'use client'

import React from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default:  'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20',
  success:  'bg-[var(--color-completed)]/10 text-[var(--color-completed)] border border-[var(--color-completed)]/20',
  warning:  'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20',
  danger:   'bg-[var(--color-overdue)]/10 text-[var(--color-overdue)] border border-[var(--color-overdue)]/20',
  info:     'bg-[var(--color-external)]/10 text-[var(--color-external)] border border-[var(--color-external)]/20',
  muted:    'bg-[var(--color-accent)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
}

const dotColors: Record<BadgeVariant, string> = {
  default:  'bg-[var(--color-primary)]',
  success:  'bg-[var(--color-completed)]',
  warning:  'bg-[var(--color-warning)]',
  danger:   'bg-[var(--color-overdue)]',
  info:     'bg-[var(--color-external)]',
  muted:    'bg-[var(--color-text-muted)]',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  )
}
