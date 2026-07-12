import React from 'react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 bg-[var(--color-bg-surface)] border border-dashed border-[var(--color-border)] rounded-[var(--radius-lg)] gap-4 ${className}`}>
      {icon && (
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent)] text-[var(--color-text-muted)]">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1 max-w-sm">
        <h4 className="text-sm font-semibold text-[var(--color-text-main)]">
          {title}
        </h4>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          {description}
        </p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
