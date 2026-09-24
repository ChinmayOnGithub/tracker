import React from 'react'

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  noBorder?: boolean
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  icon,
  badge,
  noBorder = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3',
        !noBorder ? 'border-b border-[var(--border)] pb-2.5 mb-3' : 'mb-2',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="shrink-0 text-[var(--muted-foreground)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] truncate">
              {title}
            </h3>
            {badge && <span className="shrink-0">{badge}</span>}
          </div>
          {description && (
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 font-normal truncate">
              {description}
            </p>
          )}
        </div>
      </div>

      {action && (
        <div className="shrink-0 flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  )
}
