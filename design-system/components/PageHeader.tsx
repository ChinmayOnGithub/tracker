import React from 'react'

interface PageHeaderProps {
  /** The page title rendered as an h1 */
  title: string
  /** Optional eyebrow tag / category above the title */
  eyebrow?: React.ReactNode
  /** Optional description or subtitle below the title */
  description?: React.ReactNode
  /** Optional subtitle / contextual meta below the title (alias for description) */
  subtitle?: React.ReactNode
  /** Optional slot for right-side action buttons */
  actions?: React.ReactNode
  /** Optional slot for left-side prefix (e.g. back button or nav arrows) */
  prefix?: React.ReactNode
  /** Sizing scale for header density */
  size?: 'compact' | 'default' | 'large'
  /** Removes the bottom border — use when the page has a sticky header or tabs below */
  noBorder?: boolean
  className?: string
}

/**
 * PageHeader
 * Canonical page-level header bar. Renders an h1 title, optional eyebrow,
 * optional description/subtitle, optional prefix, and optional actions.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  eyebrow,
  description,
  subtitle,
  actions,
  prefix,
  size = 'default',
  noBorder = false,
  className = '',
}) => {
  const contentDescription = description ?? subtitle

  const titleSizeClass = 
    size === 'compact' ? 'text-lg font-bold' :
    size === 'large' ? 'text-3xl font-extrabold' :
    'text-2xl font-bold'

  const spacingClass =
    size === 'compact' ? 'pb-2 mb-4' :
    'pb-4 mb-6'

  return (
    <div
      className={[
        'flex items-center justify-between gap-4',
        noBorder ? (size === 'compact' ? 'mb-4' : 'mb-6') : `border-b border-[var(--color-border)] ${spacingClass}`,
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Left: prefix + title block */}
      <div className="flex items-center gap-3 min-w-0">
        {prefix && (
          <div className="flex items-center gap-1 shrink-0">
            {prefix}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
              {eyebrow}
            </div>
          )}
          <h1 className={`${titleSizeClass} tracking-tight text-[var(--color-text-main)] leading-tight truncate`}>
            {title}
          </h1>
          {contentDescription && (
            <div className="text-sm text-[var(--color-text-muted)] mt-0.5 font-normal leading-snug">
              {contentDescription}
            </div>
          )}
        </div>
      </div>

      {/* Right: action slot */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
