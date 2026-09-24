import React from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  primaryAction?: React.ReactNode
  secondaryAction?: React.ReactNode
  compact?: boolean
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  primaryAction,
  secondaryAction,
  compact = false,
  className = '',
}) => {
  const effectivePrimaryAction = primaryAction ?? action

  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        'border border-[var(--border)] bg-[var(--surface)] rounded-[var(--radius-lg)]',
        'transition-colors duration-150',
        compact ? 'p-6 gap-3' : 'p-10 gap-4',
        className,
      ].filter(Boolean).join(' ')}
    >
      {icon && (
        <div
          className={[
            'flex items-center justify-center rounded-full',
            'bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--muted-foreground)]',
            compact ? 'w-10 h-10' : 'w-12 h-12',
          ].join(' ')}
        >
          {icon}
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-sm">
        <h4 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
          {title}
        </h4>
        {description && (
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {(effectivePrimaryAction || secondaryAction) && (
        <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
          {effectivePrimaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
