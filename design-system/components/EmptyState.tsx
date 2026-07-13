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
    <div className={`flex flex-col items-center justify-center text-center p-10 bg-gradient-to-b from-[var(--color-bg-surface)] to-transparent border border-dashed border-[var(--color-border)]/60 rounded-[var(--radius-lg)] gap-5 transition-colors hover:border-[var(--color-border)] ${className}`}>
      {icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-bg-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] shadow-sm">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5 max-w-sm">
        <h4 className="text-base font-bold tracking-tight text-[var(--color-text-main)]">
          {title}
        </h4>
        <p className="text-[13px] text-[var(--color-text-muted)] leading-relaxed font-medium">
          {description}
        </p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
