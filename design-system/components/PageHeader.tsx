import React from 'react'

interface PageHeaderProps {
  /** The page title rendered as an h1 */
  title: string
  /** Optional subtitle / contextual meta below the title */
  subtitle?: React.ReactNode
  /** Optional slot for right-side action buttons */
  actions?: React.ReactNode
  /** Optional slot for left-side prefix (e.g. back button or nav arrows) */
  prefix?: React.ReactNode
  /** Removes the bottom border — use when the page has a sticky header or tabs below */
  noBorder?: boolean
  className?: string
}

/**
 * PageHeader
 * Standard page-level header bar. Renders an h1 title (required), an optional
 * subtitle line, an optional left prefix slot, and an optional right actions slot.
 *
 * Conforms to Law UI3 — Typography Scale:
 *   - title → `text-2xl font-bold tracking-tight`
 *   - subtitle → `text-sm text-[var(--color-text-muted)]`
 *
 * @example
 * <PageHeader
 *   title="Today"
 *   subtitle="Monday, 14 Aug · 3 tasks due"
 *   prefix={<NavArrows />}
 *   actions={<Button>New Activity</Button>}
 * />
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  prefix,
  noBorder = false,
  className = '',
}) => {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4',
        noBorder
          ? 'mb-6'
          : 'border-b border-[var(--color-border)] pb-4 mb-6',
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
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5 font-normal leading-snug">
              {subtitle}
            </p>
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
