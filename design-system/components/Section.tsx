import React from 'react'

interface SectionProps {
  /** Section heading text */
  title?: string
  /** Optional count badge shown beside the title */
  count?: number
  /** Optional right-side action (e.g. an IconButton or Button) */
  action?: React.ReactNode
  /** Children — the section body content */
  children: React.ReactNode
  /** Remove the top separator line */
  noSeparator?: boolean
  /** Tighten vertical spacing for dense layouts */
  compact?: boolean
  className?: string
}

/**
 * Section
 * A titled content group with consistent heading, optional count badge,
 * optional action slot, and a separator. Use to visually segment a page
 * into named regions.
 *
 * Conforms to Law UI3 — Section heading → `text-sm font-semibold uppercase tracking-wider`
 *
 * @example
 * <Section title="Habits" count={3} action={<IconButton icon={<Plus />} label="Add" />}>
 *   <ListRow ... />
 * </Section>
 */
export const Section: React.FC<SectionProps> = ({
  title,
  count,
  action,
  children,
  noSeparator = false,
  compact = false,
  className = '',
}) => {
  const hasHeader = title || action

  return (
    <div className={['flex flex-col', compact ? 'gap-2' : 'gap-3', className].join(' ')}>
      {hasHeader && (
        <div
          className={[
            'flex items-center justify-between gap-3',
            !noSeparator ? 'border-b border-[var(--color-border)] pb-2' : '',
          ].filter(Boolean).join(' ')}
        >
          {title && (
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                {title}
              </h2>
              {count !== undefined && count > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  {count}
                </span>
              )}
            </div>
          )}
          {action && (
            <div className="shrink-0">
              {action}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-0">
        {children}
      </div>
    </div>
  )
}
