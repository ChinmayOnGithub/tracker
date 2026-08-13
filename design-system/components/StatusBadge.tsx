import React from 'react'

// Canonical activity log status values from the domain
type ActivityStatus =
  | 'done'
  | 'skipped'
  | 'postponed'
  | 'cleared'
  | 'wfh'
  | 'office'
  | 'overdue'
  | 'external'
  | 'pending'

interface StatusBadgeProps {
  status: ActivityStatus
  /** Show a leading dot indicator */
  dot?: boolean
  /** Optional size override */
  size?: 'xs' | 'sm'
  className?: string
}

type StatusConfig = {
  label: string
  classes: string
  dotClass: string
}

const STATUS_MAP: Record<ActivityStatus, StatusConfig> = {
  done: {
    label: 'Done',
    classes: 'bg-[var(--color-completed)]/10 text-[var(--color-completed)] border-[var(--color-completed)]/20',
    dotClass: 'bg-[var(--color-completed)]',
  },
  skipped: {
    label: 'Skipped',
    classes: 'bg-[var(--color-overdue)]/10 text-[var(--color-overdue)] border-[var(--color-overdue)]/20',
    dotClass: 'bg-[var(--color-overdue)]',
  },
  postponed: {
    label: 'Postponed',
    classes: 'bg-[var(--color-external)]/10 text-[var(--color-external)] border-[var(--color-external)]/20',
    dotClass: 'bg-[var(--color-external)]',
  },
  cleared: {
    label: 'Pending',
    classes: 'bg-[var(--color-accent)] text-[var(--color-text-muted)] border-[var(--color-border)]',
    dotClass: 'bg-[var(--color-text-muted)]',
  },
  wfh: {
    label: 'WFH',
    classes: 'bg-[var(--color-personal)]/10 text-[var(--color-personal)] border-[var(--color-personal)]/20',
    dotClass: 'bg-[var(--color-personal)]',
  },
  office: {
    label: 'Office',
    classes: 'bg-[var(--color-completed)]/10 text-[var(--color-completed)] border-[var(--color-completed)]/20',
    dotClass: 'bg-[var(--color-completed)]',
  },
  overdue: {
    label: 'Overdue',
    classes: 'bg-[var(--color-overdue)]/10 text-[var(--color-overdue)] border-[var(--color-overdue)]/20',
    dotClass: 'bg-[var(--color-overdue)]',
  },
  external: {
    label: 'External',
    classes: 'bg-[var(--color-external)]/10 text-[var(--color-external)] border-[var(--color-external)]/20',
    dotClass: 'bg-[var(--color-external)]',
  },
  pending: {
    label: 'Pending',
    classes: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20',
    dotClass: 'bg-[var(--color-warning)]',
  },
}

const sizeClasses = {
  xs: 'text-[9px] px-1.5 py-0.5 gap-1 tracking-wide',
  sm: 'text-[10px] px-2 py-0.5 gap-1.5',
}

/**
 * StatusBadge
 * Maps activity log status strings to a canonical colored pill badge.
 * Replaces all ad-hoc status span elements scattered across panels.
 *
 * @example
 * <StatusBadge status="done" />
 * <StatusBadge status="skipped" dot />
 * <StatusBadge status="postponed" size="xs" />
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  dot = false,
  size = 'sm',
  className = '',
}) => {
  const config = STATUS_MAP[status] ?? STATUS_MAP.cleared

  return (
    <span
      className={[
        'inline-flex items-center font-semibold rounded-[var(--radius-pill)] border uppercase',
        config.classes,
        sizeClasses[size],
        className,
      ].filter(Boolean).join(' ')}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotClass}`} />
      )}
      {config.label}
    </span>
  )
}
