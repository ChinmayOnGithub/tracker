'use client'

import React from 'react'

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'danger'
  | 'info'
  | 'muted'

export type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20',
  secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] border border-[var(--border-subtle)]',
  outline: 'bg-transparent text-[var(--foreground)] border border-[var(--border)]',
  success: 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20',
  warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20',
  destructive: 'bg-[var(--destructive)]/10 text-[var(--destructive)] border border-[var(--destructive)]/20',
  danger: 'bg-[var(--destructive)]/10 text-[var(--destructive)] border border-[var(--destructive)]/20',
  info: 'bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20',
  muted: 'bg-[var(--accent)] text-[var(--muted-foreground)] border border-[var(--border)]',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[var(--primary)]',
  secondary: 'bg-[var(--muted-foreground)]',
  outline: 'bg-[var(--foreground)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  destructive: 'bg-[var(--destructive)]',
  danger: 'bg-[var(--destructive)]',
  info: 'bg-[var(--info)]',
  muted: 'bg-[var(--muted-foreground)]',
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
